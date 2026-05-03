/**
 * Aethen-AI demo recorder — produces demo.webm then converts to demo.gif via ffmpeg.
 *
 * Usage:
 *   node scripts/record_demo.mjs [BASE_URL]
 *   node scripts/record_demo.mjs https://aethen-ai.vercel.app
 *   node scripts/record_demo.mjs http://localhost:3000   (local dev)
 */

import { chromium } from "playwright";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const BASE_URL = process.argv[2] || "http://localhost:3000";
const OUT_DIR  = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEBM     = path.join(OUT_DIR, "demo.webm");
const GIF      = path.join(OUT_DIR, "demo.gif");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`Recording demo from ${BASE_URL} …`);

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 860 },
    recordVideo: { dir: OUT_DIR, size: { width: 1400, height: 860 } },
  });
  const page = await ctx.newPage();

  // ── Scene 1: Dashboard ──────────────────────────────────────────────────
  console.log("Scene 1: Dashboard");
  await page.goto(`${BASE_URL}/overview`, { waitUntil: "networkidle" });
  await sleep(2500);
  // Hover over the reliability score ring
  await page.hover(".rounded-2xl >> nth=2").catch(() => {});
  await sleep(1500);

  // ── Scene 2: Failure Trends ─────────────────────────────────────────────
  console.log("Scene 2: Failure Trends");
  await page.goto(`${BASE_URL}/trends`, { waitUntil: "networkidle" });
  await sleep(2000);
  // Switch to 30d window
  await page.getByText("30d").click().catch(() => {});
  await sleep(1500);

  // ── Scene 3: Trace Explorer ─────────────────────────────────────────────
  console.log("Scene 3: Trace Explorer");
  await page.goto(`${BASE_URL}/traces`, { waitUntil: "networkidle" });
  await sleep(2000);
  // Open filters and select Memory failure type
  await page.getByText("Filters").click().catch(() => {});
  await sleep(800);
  await page.getByText("Memory").first().click().catch(() => {});
  await sleep(1000);
  // Click first session in the list
  const firstSession = page.locator("button.group").first();
  await firstSession.click().catch(() => {});
  await sleep(3000);
  // Switch to Diagnosis tab
  await page.getByText("Diagnosis").click().catch(() => {});
  await sleep(1500);
  // Switch to Findings tab
  await page.getByText("Findings").click().catch(() => {});
  await sleep(1500);

  // ── Scene 4: Demo Agent ─────────────────────────────────────────────────
  console.log("Scene 4: Demo Agent");
  await page.goto(`${BASE_URL}/demo-agent`, { waitUntil: "networkidle" });
  await sleep(1500);
  // Click Memory scenario button
  const memBtn = page.getByText("Memory Retrieval Failure").first();
  await memBtn.click().catch(() => {});
  await sleep(5000); // wait for LLM response

  // ── Scene 5: Recommendations ────────────────────────────────────────────
  console.log("Scene 5: Recommendations");
  await page.goto(`${BASE_URL}/recommendations`, { waitUntil: "networkidle" });
  await sleep(2500);
  // Scroll down slightly
  await page.mouse.wheel(0, 300);
  await sleep(1500);

  // ── Scene 6: Pattern Clusters ───────────────────────────────────────────
  console.log("Scene 6: Pattern Clusters");
  await page.goto(`${BASE_URL}/patterns`, { waitUntil: "networkidle" });
  await sleep(2500);

  // Done
  await sleep(1000);
  console.log("Recording complete — saving video …");
  const video = await page.video();
  await ctx.close();
  await browser.close();

  const videoPath = await video.path();
  console.log(`Video saved: ${videoPath}`);

  // ── Convert to GIF via ffmpeg ────────────────────────────────────────────
  console.log("Converting to GIF …");
  execSync(
    `ffmpeg -y -i "${videoPath}" -vf "fps=12,scale=1200:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" "${GIF}"`,
    { stdio: "inherit" }
  );

  console.log(`\n✅ Done!`);
  console.log(`   GIF:  ${GIF}`);
  console.log(`   Size: ${Math.round(require("fs").statSync(GIF).size / 1024)}KB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
