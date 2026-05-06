import { chromium } from "playwright";

const URL = "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function slowScroll(page, fromY, toY, durationMs, steps = 60) {
  const delta = toY - fromY;
  const stepSize = delta / steps;
  const stepDelay = durationMs / steps;
  for (let i = 0; i <= steps; i++) {
    await page.evaluate((y) => window.scrollTo({ top: y }), fromY + stepSize * i);
    await sleep(stepDelay);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const issues = [];
  page.on("pageerror", (err) => issues.push(`JS ERROR: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") issues.push(`CONSOLE ERR: ${msg.text()}`);
  });

  await page.goto(URL, { waitUntil: "networkidle" });
  console.log("✓ Page loaded — beginning slow scroll test\n");

  // Pause on hero so animations settle
  await sleep(2000);

  // Get full page height
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  console.log(`  Page height: ${pageHeight}px`);

  // ── Scroll hero → Reports ──────────────────────────────────────────────────
  console.log("  Scrolling to Reports section...");
  const casesTop = await page.evaluate(() => document.getElementById("cases")?.offsetTop ?? 0);
  await slowScroll(page, 0, casesTop, 2500);
  await sleep(2000); // watch CaseFolder hover reveal + Typewriter

  // ── Scroll Reports → Pipeline ──────────────────────────────────────────────
  console.log("  Scrolling to Pipeline section...");
  const pipelineTop = await page.evaluate(() => document.getElementById("pipeline")?.offsetTop ?? 0);
  await slowScroll(page, casesTop, pipelineTop, 2500);
  await sleep(3000); // watch AnimatedPipeline cycle through stages

  // ── Scroll Pipeline → Stack ────────────────────────────────────────────────
  console.log("  Scrolling to Stack section...");
  const stackTop = await page.evaluate(() => document.getElementById("stack")?.offsetTop ?? 0);
  await slowScroll(page, pipelineTop, stackTop, 2500);
  await sleep(2500); // watch StackGrid zoom cycle

  // ── Scroll Stack → bottom CTA + footer ────────────────────────────────────
  console.log("  Scrolling to bottom...");
  await slowScroll(page, stackTop, pageHeight, 3000);
  await sleep(2000);

  // ── Scroll back to top ─────────────────────────────────────────────────────
  console.log("  Scrolling back to top...");
  await slowScroll(page, pageHeight, 0, 3000);
  await sleep(1500);

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log("\n── SCROLL TEST COMPLETE ────────────────────────────────");
  if (issues.length === 0) {
    console.log("  ✓ No JS errors or console errors detected");
  } else {
    issues.forEach((i) => console.log("  ⚠", i));
  }

  await browser.close();
  console.log("  Browser closed.");
})();
