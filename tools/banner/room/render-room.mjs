// 作業部屋（room.html）を 1 コマずつ撮影し、ループするアニメーション WebP にする
//   node room/render-room.mjs <出力 .webp> [fps] [倍率] [quality]
// README では JavaScript が動かないので、ターミナルの文字送りや ✻ のきらめきなども、すべてコマに焼き込む。
import { chromium } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [out, fpsArg, scaleArg, qArg] = process.argv.slice(2);
if (!out) { console.error("usage: node room/render-room.mjs <out.webp> [fps] [scale] [quality]"); process.exit(1); }
const FPS = Number(fpsArg || 12), SCALE = Number(scaleArg || 1.5), Q = Number(qArg || 82);
const frames = path.join(here, "..", ".cache", "room-frames");
await rm(frames, { recursive: true, force: true });
await mkdir(frames, { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 820, height: 400 }, deviceScaleFactor: SCALE });
page.on("pageerror", (e) => { console.error("page error:", e.message); process.exit(1); });
await page.goto(pathToFileURL(path.join(here, "room.html")).href);
await page.waitForFunction(() => window.ready === true);
await page.evaluate(() => document.fonts.ready);
const LOOP = await page.evaluate(() => window.LOOP);
const N = Math.round(LOOP * FPS);
const stage = page.locator("#stage");
for (let i = 0; i < N; i++) {
  await page.evaluate((t) => window.renderAt(t), i / FPS);
  await stage.screenshot({ path: path.join(frames, `r${String(i).padStart(4, "0")}.png`), omitBackground: true });
  if (i % 36 === 0) console.log(`frame ${i + 1}/${N}`);
}
await browser.close();

// コマをまとめて WebP に（Pillow）
execFileSync("python", ["-I", "-c", `
import sys, glob
from PIL import Image
fs = sorted(glob.glob(sys.argv[1] + '/r*.png'))
im = [Image.open(f).convert('RGBA') for f in fs]
im[0].save(sys.argv[2], save_all=True, append_images=im[1:], duration=round(1000/float(sys.argv[3])), loop=0,
           quality=int(sys.argv[4]), method=6, kmax=len(im), kmin=len(im)//2+1)
import os; print(f'{len(im)} frames {im[0].size} -> {sys.argv[2]} ({os.path.getsize(sys.argv[2])//1024} KB)')
`, frames, path.resolve(out), String(FPS), String(Q)], { stdio: "inherit" });
