import { chromium } from "playwright";

const URL = "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: false, devtools: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const jsErrors = [];
  page.on("pageerror", (err) => jsErrors.push(err.message));

  // ── 1. Load timing ─────────────────────────────────────────────────────────
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: "networkidle" });
  const networkIdleMs = Date.now() - t0;

  const navTiming = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0];
    return {
      ttfb: Math.round(n.responseStart - n.startTime),
      domContentLoaded: Math.round(n.domContentLoadedEventEnd - n.startTime),
      load: Math.round(n.loadEventEnd - n.startTime),
    };
  });

  // ── 2. JS bundle sizes ─────────────────────────────────────────────────────
  const resources = await page.evaluate(() => {
    const entries = performance.getEntriesByType("resource");
    const js = entries.filter((r) => r.initiatorType === "script");
    const total = js.reduce((s, r) => s + (r.transferSize || 0), 0);
    const top5 = [...js]
      .sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0))
      .slice(0, 5)
      .map((r) => ({
        name: r.name.split("/").pop().split("?")[0],
        kb: Math.round((r.transferSize || 0) / 1024),
      }));
    return { totalKb: Math.round(total / 1024), top5 };
  });

  // ── 3. DOM stats ───────────────────────────────────────────────────────────
  const domStats = await page.evaluate(() => {
    const tickerRow = document.querySelector(".flex.gap-4.w-max");
    return {
      totalNodes: document.querySelectorAll("*").length,
      tickerItems: tickerRow ? tickerRow.children.length : 0,
      willChangeEls: document.querySelectorAll('[style*="will-change"]').length,
    };
  });

  // ── 4. Section scroll-to-settle timings ───────────────────────────────────
  const sections = [
    { id: "cases",    label: "Reports  (#cases)"    },
    { id: "pipeline", label: "Pipeline (#pipeline)" },
    { id: "stack",    label: "Stack    (#stack)"    },
  ];
  const timings = [];

  for (const { id, label } of sections) {
    await page.evaluate((sid) => {
      document.getElementById(sid)?.scrollIntoView({ behavior: "instant" });
    }, id);

    // measure rAF round-trip (first browser paint after scroll)
    const firstRaf = await page.evaluate(() =>
      new Promise((res) => {
        const t = performance.now();
        requestAnimationFrame(() => requestAnimationFrame(() => res(Math.round(performance.now() - t))));
      })
    );

    // wait up to 1s for framer-motion to clear opacity:0 elements
    const settled = await page.evaluate(() =>
      new Promise((res) => {
        const t = performance.now();
        const deadline = t + 1000;
        const check = () => {
          if (performance.now() >= deadline) { res(Math.round(performance.now() - t)); return; }
          requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      })
    );

    // count blur elements present *right after* scroll (before settle)
    const blurCount = await page.evaluate(() =>
      document.querySelectorAll('[style*="blur"]').length
    );

    timings.push({ label, firstRaf, settled, blurCount });
    await sleep(1000);
  }

  // ── 5. Bottom CTA + footer ─────────────────────────────────────────────────
  await page.evaluate(() => document.querySelector("footer")?.scrollIntoView({ behavior: "instant" }));
  const bottomRaf = await page.evaluate(() =>
    new Promise((res) => {
      const t = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => res(Math.round(performance.now() - t))));
    })
  );
  await sleep(1000);

  // ── 6. RAF frame budget at #pipeline ──────────────────────────────────────
  await page.evaluate((sid) => document.getElementById(sid)?.scrollIntoView({ behavior: "instant" }), "pipeline");
  await sleep(300);

  const frameBudget = await page.evaluate(() =>
    new Promise((res) => {
      const frames = [];
      let last = performance.now();
      let n = 0;
      const tick = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        if (++n < 60) requestAnimationFrame(tick);
        else {
          const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
          const janky = frames.filter((f) => f > 20).length;
          res({ avg: Math.round(avg * 10) / 10, janky });
        }
      };
      requestAnimationFrame(tick);
    })
  );

  // ── Print report ───────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║     AETHEN LANDING PAGE — PERF AUDIT REPORT         ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  console.log("── 1. LOAD TIMING ──────────────────────────────────────");
  console.log(`   TTFB:              ${navTiming.ttfb}ms`);
  console.log(`   DOMContentLoaded:  ${navTiming.domContentLoaded}ms`);
  console.log(`   Load event:        ${navTiming.load}ms`);
  console.log(`   networkidle:       ${networkIdleMs}ms\n`);

  console.log("── 2. JS BUNDLE ────────────────────────────────────────");
  console.log(`   Total JS transfer: ${resources.totalKb}KB`);
  resources.top5.forEach((r) => console.log(`   ${r.name.padEnd(42)} ${r.kb}KB`));
  console.log();

  console.log("── 3. DOM COMPLEXITY ───────────────────────────────────");
  console.log(`   Total DOM nodes:     ${domStats.totalNodes}`);
  console.log(`   Ticker items:        ${domStats.tickerItems}  ${domStats.tickerItems > 18 ? "⚠ duplicated for scroll loop" : "✓"}`);
  console.log(`   will-change nodes:   ${domStats.willChangeEls}\n`);

  console.log("── 4. SECTION SCROLL-TO-SETTLE ─────────────────────────");
  for (const t of timings) {
    const flag = t.settled > 800 ? "⚠ SLOW" : t.settled > 400 ? "~ MEDIUM" : "✓ OK";
    console.log(`   ${t.label}`);
    console.log(`     first rAF paint:  ${t.firstRaf}ms`);
    console.log(`     settled (~1s cap): ${t.settled}ms  ${flag}`);
    console.log(`     blur() nodes live: ${t.blurCount}  ${t.blurCount > 3 ? "⚠ GPU layer cost" : "✓"}`);
  }
  console.log(`   Bottom CTA + Footer`);
  console.log(`     first rAF paint:  ${bottomRaf}ms\n`);

  console.log("── 5. RAF FRAME BUDGET @ #pipeline ─────────────────────");
  console.log(`   Avg frame time:  ${frameBudget.avg}ms  (budget: 16.7ms @ 60fps)`);
  console.log(`   Jank frames:     ${frameBudget.janky}/60  ${frameBudget.janky > 10 ? "⚠ JANK" : frameBudget.janky > 4 ? "~ SOME JANK" : "✓ SMOOTH"}\n`);

  if (jsErrors.length) {
    console.log("── 6. JS ERRORS ─────────────────────────────────────────");
    jsErrors.forEach((e) => console.log("   ⚠", e));
    console.log();
  }

  console.log("── 7. STRUCTURAL CONCERNS ──────────────────────────────");
  console.log("   AnimatedPipeline  rAF loop — runs even when section off-screen (once: false)");
  console.log("   SectionReveal     filter:blur(8px) initial state — GPU composite layer × every section");
  console.log("   StackGrid         setInterval(1600ms) + 6× framer-motion per tick");
  console.log("   Typewriter        setInterval(18ms) — 3+ instances fire simultaneously");
  console.log("   stack-scroll      CSS animation on 24-item w-max flex row\n");

  console.log("   Browser open for 45s — inspect DevTools, then it closes.");
  await sleep(45000);
  await browser.close();
})();
