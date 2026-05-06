import { chromium } from "playwright";

const URL = "http://localhost:3000";

interface SectionTiming {
  section: string;
  scrollStart: number;
  firstPaint: number;
  settled: number;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const browser = await chromium.launch({ headless: false, devtools: true, slowMo: 80 });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  // Capture JS errors
  const jsErrors: string[] = [];
  context.on("page", (page) => {
    page.on("pageerror", (err) => jsErrors.push(err.message));
  });

  const page = await context.newPage();
  page.on("pageerror", (err) => jsErrors.push(err.message));

  // ── 1. Load timing ────────────────────────────────────────────────────────
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: "networkidle" });
  const loadTime = Date.now() - t0;

  const navTiming = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    return {
      domContentLoaded: Math.round(n.domContentLoadedEventEnd - n.startTime),
      load: Math.round(n.loadEventEnd - n.startTime),
      ttfb: Math.round(n.responseStart - n.startTime),
    };
  });

  // ── 2. Resource sizes ─────────────────────────────────────────────────────
  const resources = await page.evaluate(() => {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const js = entries.filter((r) => r.initiatorType === "script");
    const totalTransfer = js.reduce((s, r) => s + (r.transferSize || 0), 0);
    const top5 = [...js]
      .sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0))
      .slice(0, 5)
      .map((r) => ({
        name: r.name.split("/").pop()?.split("?")[0] ?? r.name,
        kb: Math.round((r.transferSize || 0) / 1024),
      }));
    return { totalKb: Math.round(totalTransfer / 1024), top5 };
  });

  // ── 3. DOM complexity ─────────────────────────────────────────────────────
  const domStats = await page.evaluate(() => {
    const ticker = document.querySelector('[style*="stack-scroll"]') as HTMLElement | null;
    const tickerItems = ticker ? ticker.children.length : 0;
    return {
      totalNodes: document.querySelectorAll("*").length,
      tickerItems,
      sectionRevealCount: document.querySelectorAll('[style*="willChange"]').length,
      blurElements: document.querySelectorAll('[style*="blur"]').length,
    };
  });

  // ── 4. Section scroll timing ──────────────────────────────────────────────
  const sections = [
    { id: "cases",    label: "Reports (#cases)"   },
    { id: "pipeline", label: "Pipeline (#pipeline)" },
    { id: "stack",    label: "Stack (#stack)"      },
  ];

  const timings: SectionTiming[] = [];

  for (const { id, label } of sections) {
    // Measure time from scrollIntoView call to when framer-motion animations settle
    const result = await page.evaluate(async (sectionId: string) => {
      const el = document.getElementById(sectionId);
      if (!el) return null;

      const t1 = performance.now();
      el.scrollIntoView({ behavior: "instant" });

      // Wait for next rAF (first paint after scroll)
      const firstPaint = await new Promise<number>((res) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => res(performance.now()));
        });
      });

      // Wait up to 1200ms for animations to visually settle (opacity/transform done)
      const settled = await new Promise<number>((res) => {
        const deadline = performance.now() + 1200;
        const check = () => {
          const animating = document.querySelectorAll('[style*="opacity: 0"]').length;
          if (animating === 0 || performance.now() >= deadline) {
            res(performance.now());
          } else {
            requestAnimationFrame(check);
          }
        };
        requestAnimationFrame(check);
      });

      return {
        scrollStart: Math.round(t1),
        firstPaint: Math.round(firstPaint - t1),
        settled: Math.round(settled - t1),
      };
    }, id);

    if (result) {
      timings.push({ section: label, ...result });
    }

    await sleep(800); // let animations finish before next section
  }

  // ── 5. Bottom section ─────────────────────────────────────────────────────
  const bottomResult = await page.evaluate(async () => {
    const footer = document.querySelector("footer");
    if (!footer) return null;
    const t1 = performance.now();
    footer.scrollIntoView({ behavior: "instant" });
    const firstPaint = await new Promise<number>((res) => {
      requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now())));
    });
    await new Promise<void>((res) => setTimeout(res, 900));
    return {
      firstPaint: Math.round(firstPaint - t1),
      settled: Math.round(performance.now() - t1),
    };
  });

  // ── 6. Framer-motion animation instances ──────────────────────────────────
  const animStats = await page.evaluate(() => {
    // Count motion.div elements (framer-motion wraps in data-framer-motion or style transforms)
    const motionEls = document.querySelectorAll('[style*="transform"]').length;
    const blurEls = document.querySelectorAll('[style*="blur"]').length;
    const willChangeEls = document.querySelectorAll('[style*="will-change"]').length;
    return { motionEls, blurEls, willChangeEls };
  });

  // ── 7. RAF loop check (AnimatedPipeline) ──────────────────────────────────
  // Scroll to pipeline and measure frame budget
  await page.evaluate(() => {
    const el = document.getElementById("pipeline");
    el?.scrollIntoView({ behavior: "instant" });
  });
  await sleep(200);

  const frameBudget = await page.evaluate(async () => {
    return new Promise<{ avgFrameMs: number; droppedFrames: number }>((resolve) => {
      const frames: number[] = [];
      let last = performance.now();
      let count = 0;
      const measure = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        count++;
        if (count < 60) requestAnimationFrame(measure);
        else {
          const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
          const dropped = frames.filter((f) => f > 20).length; // >20ms = potential jank at 60fps
          resolve({ avgFrameMs: Math.round(avg * 10) / 10, droppedFrames: dropped });
        }
      };
      requestAnimationFrame(measure);
    });
  });

  console.log("\n   Browser staying open for 60s — inspect DevTools, then close manually.");
  await sleep(60000);
  await browser.close();

  // ── Report ────────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║       AETHEN LANDING PAGE — PERF AUDIT REPORT       ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  console.log("── 1. LOAD TIMING ─────────────────────────────────────");
  console.log(`   TTFB:              ${navTiming.ttfb}ms`);
  console.log(`   DOMContentLoaded:  ${navTiming.domContentLoaded}ms`);
  console.log(`   Load event:        ${navTiming.load}ms`);
  console.log(`   networkidle wait:  ${loadTime}ms\n`);

  console.log("── 2. JS BUNDLE ───────────────────────────────────────");
  console.log(`   Total JS transfer: ${resources.totalKb}KB`);
  console.log("   Top 5 chunks:");
  resources.top5.forEach((r) => console.log(`     ${r.name.padEnd(40)} ${r.kb}KB`));
  console.log();

  console.log("── 3. DOM COMPLEXITY ──────────────────────────────────");
  console.log(`   Total DOM nodes:        ${domStats.totalNodes}`);
  console.log(`   Ticker items (stack-scroll): ${domStats.tickerItems}  ${domStats.tickerItems > 20 ? "⚠ HIGH" : "✓"}`);
  console.log(`   will-change elements:   ${animStats.willChangeEls}`);
  console.log(`   blur() elements (live): ${animStats.blurEls}  ${animStats.blurEls > 5 ? "⚠ GPU COST" : "✓"}`);
  console.log(`   transform elements:     ${animStats.motionEls}\n`);

  console.log("── 4. SECTION SCROLL-TO-SETTLE TIMINGS ───────────────");
  for (const t of timings) {
    const jank = t.settled > 600 ? "⚠ SLOW" : t.settled > 300 ? "~ MEDIUM" : "✓ OK";
    console.log(`   ${t.section}`);
    console.log(`     first rAF:  ${t.firstPaint}ms`);
    console.log(`     settled:    ${t.settled}ms  ${jank}`);
  }

  if (bottomResult) {
    const jank = bottomResult.settled > 600 ? "⚠ SLOW" : bottomResult.settled > 300 ? "~ MEDIUM" : "✓ OK";
    console.log("   Bottom CTA + Footer");
    console.log(`     first rAF:  ${bottomResult.firstPaint}ms`);
    console.log(`     settled:    ${bottomResult.settled}ms  ${jank}`);
  }
  console.log();

  console.log("── 5. ANIMATION PIPELINE (RAF LOOP @ #pipeline) ──────");
  console.log(`   Avg frame time:  ${frameBudget.avgFrameMs}ms  (target <16.7ms for 60fps)`);
  console.log(`   Jank frames:     ${frameBudget.droppedFrames}/60  ${frameBudget.droppedFrames > 10 ? "⚠ JANK" : frameBudget.droppedFrames > 4 ? "~ SOME JANK" : "✓ SMOOTH"}`);
  console.log();

  if (jsErrors.length) {
    console.log("── 6. JS ERRORS ───────────────────────────────────────");
    jsErrors.forEach((e) => console.log("   ⚠", e));
    console.log();
  }

  console.log("── 7. KNOWN ARCHITECTURAL ISSUES ─────────────────────");
  console.log("   AnimatedPipeline: unbounded rAF loop (runs even off-screen)");
  console.log("   SectionReveal:    filter:blur(8px) initial state → GPU layer on every section");
  console.log("   StackGrid:        setInterval(1600ms) + 6× framer-motion animate per tick");
  console.log("   Typewriter:       setInterval(18ms) per instance — 3 active simultaneously");
  console.log("   stack-scroll:     CSS animation on w-max flex row with 24 items");
  console.log();
})();
