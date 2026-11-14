// fluid.html の流体を 1 コマずつ PNG に書き出す（Playwright + PC に入っている Edge を使用）
//   node render.mjs [fps] [seconds]
import { chromium } from "playwright";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const FPS = Number(process.argv[2] || 12);
const SECONDS = Number(process.argv[3] || 16);
const W = 804, H = 300;
const N = FPS * SECONDS;
const outDir = path.join(here, ".cache", "frames");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on("pageerror", (e) => { console.error("page error:", e.message); process.exit(1); });
await page.goto(`${pathToFileURL(path.join(here, "fluid.html")).href}?w=${W}&h=${H}`);
await page.waitForFunction(() => window.ready === true);

const t0 = Date.now();
for (let i = 0; i < N; i++) {
  // i / N：最後のコマの次が最初のコマに戻るよう、phase = 1 は含めない
  const url = await page.evaluate((ph) => window.renderFrame(ph), i / N);
  await writeFile(path.join(outDir, `f${String(i).padStart(4, "0")}.png`), Buffer.from(url.split(",")[1], "base64"));
  if (i % 24 === 0) console.log(`frame ${i + 1}/${N}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
await browser.close();
console.log(`rendered ${N} frames → ${outDir}`);
