// スマホ用バナーの前景（見出し・演出）を、時間ごとに 1 コマずつ透明 PNG で書き出す
//   node overlay-anim.mjs <ヘッダー SVG> [fps] [seconds] [倍率]
//
// PC 版 SVG の演出（カットイン・光・文字の波・流れる線）を、ブラウザ上で時刻を指定して止め、
// そのまま撮影する。スマホ用はアニメーション画像として丸ごとループするので、
//   ・最後の約 0.9 秒で文字が切れ目へ沈み（カットアウト）、最初のカットインへ自然につながる
//   ・線の伸び縮みはループの長さで 1 往復するよう合わせる
// という調整を加える。
import { chromium } from "playwright";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [input, fpsArg, secArg, scaleArg] = process.argv.slice(2);
const FPS = Number(fpsArg || 15), SECONDS = Number(secArg || 20), SCALE = Number(scaleArg || 1.5);
const N = FPS * SECONDS;
const W = Math.round(804 * SCALE), H = Math.round(300 * SCALE);

let svg = await readFile(input, "utf8");
const cutBetween = (start, end) => {
  const i = svg.indexOf(start), j = svg.indexOf(end, i);
  if (i < 0 || j < 0) throw new Error(`marker not found: ${start.slice(0, 40)}`);
  svg = svg.slice(0, i) + svg.slice(j + end.length);
};
// 流体と紺の地は compose.py 側で敷くので外す（前景だけにする）
cutBetween("  <!-- fluid:start", "<!-- fluid:end -->\n");
svg = svg.replace('  <rect width="804" height="300" fill="#0B1220"/>\n', "");
svg = svg.replace(/^<svg /, `<svg id="banner" style="width:${W}px;height:${H}px;display:block" `);

const outDir = path.join(here, ".cache", "overlay-frames");
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const html = path.join(here, ".cache", "overlay-anim.html");
await writeFile(html, `<!doctype html><html><head><style>html,body{margin:0;background:transparent}
.sway{animation-duration:${SECONDS / 2}s!important}</style></head><body>${svg}</body></html>`);

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(pathToFileURL(html).href);
await page.evaluate(({ SECONDS }) => {
  const OUT = SECONDS - 0.9; // カットアウト開始
  const ease = "cubic-bezier(.55,0,1,.45)";
  // 文字：左から順に切れ目の下へ沈む（＝カットインの開始状態と同じ位置で終わる）
  document.querySelectorAll("#banner .ci").forEach((el, k) =>
    el.animate([{ transform: "none" }, { transform: "translateY(92px) rotate(9deg)" }],
      { duration: 450, delay: (OUT + k * 0.025) * 1000, fill: "forwards", easing: ease }));
  // 小さい文字・上のラベル・流れる線：静かに消える（ループ先頭のフェードインへつながる）
  const fadeOut = (sel, at, dur) => document.querySelectorAll(sel).forEach((el) =>
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur * 1000, delay: at * 1000, fill: "forwards", easing: "ease-in" }));
  fadeOut("#banner .track", OUT, 0.6);
  fadeOut("#banner .in", OUT + 0.1, 0.6);
  fadeOut("#banner .sway", OUT - 0.2, 0.9);
  // 時刻を外から指定できるようにする（CSS / Web Animations と SMIL の両方）
  const svg = document.getElementById("banner");
  window.setTime = (t) => {
    document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t * 1000; });
    svg.pauseAnimations();
    svg.setCurrentTime(t);
  };
}, { SECONDS });

const el = page.locator("#banner");
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  await page.evaluate((t) => window.setTime(t), i / FPS);
  await el.screenshot({ path: path.join(outDir, `o${String(i).padStart(4, "0")}.png`), omitBackground: true });
  if (i % 60 === 0) console.log(`overlay ${i + 1}/${N} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
await browser.close();
console.log(`rendered ${N} overlay frames ${W}x${H} → ${outDir}`);
