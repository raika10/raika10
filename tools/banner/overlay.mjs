// スマホ用バナーの「前景」（見出し・小さい文字・線・枠・暗くする層）を、透明背景の PNG に書き出す
//   node overlay.mjs <ヘッダー SVG> [倍率]
// スマホでは SVG を毎コマ描き直す処理が間に合わず止まるため、スマホ用は
// 「流体のコマ＋この前景」を合成したアニメーション WebP にする（compose.py）。
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [input, scaleArg] = process.argv.slice(2);
const SCALE = Number(scaleArg || 1.5);
let svg = await readFile(input, "utf8");

const cutBetween = (start, end) => {
  const i = svg.indexOf(start), j = svg.indexOf(end, i);
  if (i < 0 || j < 0) throw new Error(`marker not found: ${start.slice(0, 40)}`);
  svg = svg.slice(0, i) + svg.slice(j + end.length);
};
// 流体の層と、その下の紺の地（どちらも compose.py 側で敷く）
cutBetween("  <!-- fluid:start", "<!-- fluid:end -->\n");
svg = svg.replace('  <rect width="804" height="300" fill="#0B1220"/>\n', "");
// カットインの光のライン（登場時だけの演出なので、静止画には入れない）
cutBetween('  <g aria-hidden="true">\n    <rect class="cutbar"', "  </g>\n");
// すべての CSS アニメーションを止め、完成した状態で書き出す
svg = svg.replace("</svg>", "<style>*{animation:none!important;transition:none!important}</style></svg>");

const overlaySvg = path.join(here, ".cache", "overlay.svg");
await writeFile(overlaySvg, svg);
const W = Math.round(804 * SCALE), H = Math.round(300 * SCALE);
const html = path.join(here, ".cache", "overlay.html");
await writeFile(html, `<html><body style="margin:0;background:transparent"><img id="o" src="overlay.svg" width="${W}" height="${H}"></body></html>`);

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(pathToFileURL(html).href);
await page.waitForTimeout(300);
await page.locator("#o").screenshot({ path: path.join(here, ".cache", "overlay.png"), omitBackground: true });
await browser.close();
console.log(`overlay ${W}x${H} → .cache/overlay.png`);
