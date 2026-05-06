import { chromium } from "playwright";

const URL = "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(URL, { waitUntil: "networkidle" });
  await sleep(1000);

  // Probe header state at each scroll position
  console.log("\n── HEADER STATE WHILE SCROLLING TOP SECTION ────────────────");
  console.log("  scrollY   position    top     bg-visible  z-index");
  console.log("  ──────────────────────────────────────────────────");

  for (let y = 0; y <= 300; y += 20) {
    await page.evaluate((scrollY) => window.scrollTo({ top: scrollY }), y);
    await sleep(60);

    const state = await page.evaluate(() => {
      const header = document.querySelector("header");
      if (!header) return null;
      const style = window.getComputedStyle(header);
      const rect = header.getBoundingClientRect();
      return {
        position: style.position,
        top: Math.round(rect.top),
        height: Math.round(rect.height),
        zIndex: style.zIndex,
        bgColor: style.backgroundColor,
        backdropFilter: style.backdropFilter,
        transform: style.transform,
      };
    });

    if (state) {
      const bgVisible = state.bgColor !== "rgba(0, 0, 0, 0)" && state.bgColor !== "transparent";
      console.log(
        `  y=${String(y).padEnd(5)}  ${state.position.padEnd(10)}  top=${state.top}  ` +
        `bg=${bgVisible ? "yes" : "no "}  z=${state.zIndex}  h=${state.height}px  ` +
        `transform=${state.transform === "none" ? "none" : "⚠ " + state.transform}`
      );
    }
  }

  // Check if header overlaps hero content at top
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await sleep(300);
  const overlap = await page.evaluate(() => {
    const header = document.querySelector("header");
    const hero = document.querySelector("main section");
    if (!header || !hero) return null;
    const hRect = header.getBoundingClientRect();
    const sRect = hero.getBoundingClientRect();
    return {
      headerBottom: Math.round(hRect.bottom),
      heroTop: Math.round(sRect.top),
      overlapping: hRect.bottom > sRect.top,
      heroHasPaddingTop: window.getComputedStyle(hero).paddingTop,
    };
  });

  console.log("\n── HERO / HEADER OVERLAP CHECK ─────────────────────────────");
  if (overlap) {
    console.log(`  Header bottom:   ${overlap.headerBottom}px`);
    console.log(`  Hero top:        ${overlap.heroTop}px`);
    console.log(`  Overlapping:     ${overlap.overlapping ? "⚠ YES — header covers hero content" : "✓ no"}`);
    console.log(`  Hero padding-top: ${overlap.heroHasPaddingTop}`);
  }

  // Scroll slowly through the hero watching for any header jumps
  console.log("\n── SLOW SCROLL: checking for header position jumps ─────────");
  let lastTop = null;
  for (let y = 0; y <= 500; y += 5) {
    await page.evaluate((scrollY) => window.scrollTo({ top: scrollY }), y);
    await sleep(30);
    const top = await page.evaluate(() => {
      const h = document.querySelector("header");
      return h ? Math.round(h.getBoundingClientRect().top) : null;
    });
    if (lastTop !== null && top !== null && Math.abs(top - lastTop) > 2) {
      console.log(`  ⚠ Header jumped at scrollY=${y}: top went ${lastTop} → ${top}`);
    }
    lastTop = top;
  }
  console.log("  Scan complete.");

  await browser.close();
  console.log("\n  Browser closed.");
})();
