// 書き出した流体アニメーション（.cache/fluid.webp）を、ヘッダー SVG の背景に埋め込む
//   node embed.mjs <入力 SVG> <出力 SVG>
// README の画像は外部ファイルを読み込めないため、WebP を data URI として SVG の中に直接入れる。
// 2 回目以降は <!-- fluid:start --> 〜 <!-- fluid:end --> の間だけを差し替える。
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: node embed.mjs <input.svg> <output.svg>");
  process.exit(1);
}
let svg = await readFile(input, "utf8");
const webp = await readFile(path.join(here, ".cache", "fluid.webp"));

const layer = `  <!-- fluid:start 水中の絵の具（tools/banner/fluid.html の WebGL シェーダーから書き出した、継ぎ目のないループ） -->
  <g class="paintIn"><image href="data:image/webp;base64,${webp.toString("base64")}" x="0" y="0" width="804" height="300" preserveAspectRatio="none"/></g>
  <!-- fluid:end -->
`;

const cut = (start, end, replacement = "") => {
  const i = svg.indexOf(start), j = svg.indexOf(end, i);
  if (i < 0 || j < 0) return false;
  svg = svg.slice(0, i) + replacement + svg.slice(j);
  return true;
};

if (svg.includes("<!-- fluid:start")) {
  // 2 回目以降：埋め込み済みの画像だけ差し替え
  const i = svg.indexOf("  <!-- fluid:start"), j = svg.indexOf("<!-- fluid:end -->") + "<!-- fluid:end -->\n".length;
  svg = svg.slice(0, i) + layer + svg.slice(j);
} else {
  // 初回：SVG フィルターで作っていたマーブリング（定義・CSS・本体）を取り除いて置き換える
  if (!cut("  <!-- 水中の絵の具（マーブリング）", "  <!-- 縁を暗く沈めて")) throw new Error("marble defs not found");
  if (!svg.includes("  .flowA{")) throw new Error("marble css not found");
  svg = svg.replace(/  \.flowA\{[^\n]*\n/, "").replace(/  \.flowB\{[^\n]*\n/, "");
  svg = svg.replace(/  @keyframes flowA\{[^\n]*\n/, "").replace(/  @keyframes flowB\{[^\n]*\n/, "");
  svg = svg.replace(/  @keyframes paintIn\{[^\n]*\n/, "  @keyframes paintIn{from{opacity:.15}to{opacity:1}}\n");
  if (!cut("  <!-- 水中の絵の具：2 つの流れ", '  <rect width="804" height="300" fill="url(#depth)"/>', layer)) throw new Error("marble body not found");
  // 縁の暗さは、流体側の色に合わせて少し弱める
  svg = svg.replace('<stop offset="1" stop-color="#0B1220" stop-opacity=".85"/>', '<stop offset="1" stop-color="#0B1220" stop-opacity=".6"/>');
}

await writeFile(output, svg);
console.log(`embedded fluid.webp (${(webp.length / 1024).toFixed(0)} KB) → ${output} (${(Buffer.byteLength(svg) / 1024).toFixed(0)} KB)`);
