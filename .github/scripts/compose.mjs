/**
 * プロフィール画像を 1 枚にまとめる
 * --------------------------------
 * お散歩する Claude（白い野原）・Hello, World!・紹介文・Stats・Top Languages・Activity を、同じすき間・同じ角丸のタイルとして 1 枚の SVG に並べます。
 *   profile.svg         … PC 用（804 幅）。Stats と Top Languages は横並び
 *   profile-mobile.svg  … スマホ・GitHub アプリ用（420 幅）。縦 1 列。
 *                          Hello, World! の背景は水彩（重い）ではなくカードと同じ静かな背景にして軽くする
 *
 * 1 枚の SVG に入れると id・class・@keyframes の名前がぶつかるので、部品ごとに接頭辞を付けてから
 * 入れ子の <svg>（部品ごとの座標系）として置きます。profile-cards.mjs から毎日呼ばれます。
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { walkerBar } from "./walker.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const BANNER = path.resolve(here, "../../assets/banner-v8.svg");
const R = 14; // タイルの角丸（画面上の大きさ）
const SANS = `'Inter','Segoe UI',-apple-system,BlinkMacSystemFont,'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic','Noto Sans JP','Helvetica Neue',Arial,sans-serif`;
const r2 = (n) => Math.round(n * 100) / 100;

/* ---------- 部品の下ごしらえ ---------- */

// 縮小・拡大しても角丸と枠線が他のタイルと同じ見た目になるよう、部品の座標で描き直す
function reframe(svg, scale) {
  const [, W, H] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).map(Number);
  const rx = R / scale, sw = 1 / scale;
  return svg
    .replace(/(<clipPath id="(?:k-clip|clip|wk-clip)"><rect\b[^>]*?\brx=")[\d.]+/, `$1${r2(rx)}`)
    .replace(/<rect x="\.5" y="\.5" width="[\d.]+" height="[\d.]+" rx="[\d.]+"/,
      `<rect x="${r2(sw / 2)}" y="${r2(sw / 2)}" width="${r2(W - sw)}" height="${r2(H - sw)}" rx="${r2(rx - sw / 2)}" stroke-width="${r2(sw)}"`);
}

// id・class・@keyframes に接頭辞を付け、中身（<svg> の内側）と元の大きさを返す
function scope(svg, p) {
  const open = svg.match(/<svg\b[^>]*>/);
  const [, w, h] = open[0].match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).map(Number);
  let s = svg.slice(open.index + open[0].length, svg.lastIndexOf("</svg>"));

  const ids = new Set([...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  s = s.replace(/(\sid=")([^"]+)"/g, (m, a, id) => `${a}${p}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (m, id) => (ids.has(id) ? `url(#${p}-${id})` : m))
    .replace(/((?:xlink:)?href=")#([^"]+)"/g, (m, a, id) => (ids.has(id) ? `${a}#${p}-${id}"` : m));

  const classes = new Set();
  s = s.replace(/(\sclass=")([^"]*)"/g, (m, a, v) =>
    `${a}${v.split(/\s+/).filter(Boolean).map((c) => (classes.add(c), `${p}-${c}`)).join(" ")}"`);

  const frames = new Set([...s.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]));
  const anim = (t) => t.replace(/(animation(?:-name)?\s*:\s*)([^;}"]+)/g, (m, a, v) =>
    a + v.replace(/(?<![\w-])([A-Za-z_][\w-]*)(?![\w-])/g, (n) => (frames.has(n) ? `${p}-${n}` : n)));
  s = s.replace(/<style>([\s\S]*?)<\/style>/g, (m, css) => {
    css = anim(css.replace(/@keyframes\s+([\w-]+)/g, (m2, n) => `@keyframes ${p}-${n}`));
    css = css.replace(/\.([A-Za-z_][\w-]*)/g, (m2, c) => (classes.has(c) ? `.${p}-${c}` : m2));
    return `<style>${css}</style>`;
  }).replace(/(\sstyle=")([^"]*)"/g, (m, a, v) => `${a}${anim(v)}"`);

  return { w, h, inner: s };
}

// 部品を幅 w で (x, y) に置く。高さは元の縦横比から決まる
function place(svg, p, x, y, w) {
  const scale = w / Number(svg.match(/viewBox="0 0 ([\d.]+)/)[1]);
  const pc = scope(reframe(svg, scale), p);
  const h = (w * pc.h) / pc.w;
  return { h, svg: `<svg x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" viewBox="0 0 ${pc.w} ${pc.h}">${pc.inner}</svg>` };
}

// スマホ用の Hello, World!：水彩の背景を外してカードと同じ背景にし、線の束の伸び縮みと点の波紋を止めて軽くする
function calmBanner(svg) {
  const i = svg.indexOf("  <!-- fluid:start"), j = svg.indexOf("<!-- fluid:end -->");
  if (i < 0 || j < 0) throw new Error("banner: fluid markers not found");
  const glow = `<radialGradient id="cardGlow" gradientUnits="userSpaceOnUse" cx="96" cy="0" r="442"><stop offset="0" stop-color="#10B981" stop-opacity=".13"/><stop offset="1" stop-color="#10B981" stop-opacity="0"/></radialGradient>
  <linearGradient id="cardHair" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#10B981" stop-opacity="0"/><stop offset=".35" stop-color="#10B981"/><stop offset=".65" stop-color="#38BDF8"/><stop offset="1" stop-color="#38BDF8" stop-opacity="0"/></linearGradient>
</defs>`;
  return (svg.slice(0, i) + `  <rect width="804" height="300" fill="url(#cardGlow)"/>\n  <rect x="145" y="0" width="514" height="1.5" fill="url(#cardHair)"/>\n` + svg.slice(j + "<!-- fluid:end -->".length))
    .replace("</defs>", glow)
    .replace("</style>", "  .sway{animation:none!important}\n</style>")
    .replace(/<circle cx="361" cy="58" r="3.5" fill="none"[^>]*>[\s\S]*?<\/circle>/, "");
}

// 紹介文のタイル（カードと同じ紺の地・左上の光・上辺の細い線）
function introTile(W, H, lines) {
  const text = lines.map(({ t, y, size, fill, italic }) =>
    `<text x="${W / 2}" y="${y}" text-anchor="middle" font-size="${size}" fill="${fill}"${italic ? ' font-style="italic"' : ""}>${t}</text>`).join("\n    ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="${r2(W * 0.12)}" cy="0" r="${r2(Math.max(W * 0.55, 240))}"><stop offset="0" stop-color="#10B981" stop-opacity=".11"/><stop offset="1" stop-color="#10B981" stop-opacity="0"/></radialGradient>
  <linearGradient id="hair" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#10B981" stop-opacity="0"/><stop offset=".35" stop-color="#10B981"/><stop offset=".65" stop-color="#38BDF8"/><stop offset="1" stop-color="#38BDF8" stop-opacity="0"/></linearGradient>
  <clipPath id="clip"><rect width="${W}" height="${H}" rx="${R}"/></clipPath>
</defs>
<style>
  .it{animation:it 1s .6s cubic-bezier(.16,1,.3,1) both}
  @keyframes it{from{opacity:.3;transform:translateY(6px)}to{opacity:1;transform:none}}
  @media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<g clip-path="url(#clip)">
  <rect width="${W}" height="${H}" fill="#0B1220"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="${r2(W * 0.18)}" y="0" width="${r2(W * 0.64)}" height="1" fill="url(#hair)"/>
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="${R - 0.5}" fill="none" stroke="#94A3B8" stroke-opacity=".16"/>
<g class="it" style="font-family:${SANS.replace(/"/g, "'")}">
    ${text}
</g>
</svg>
`;
}

const JA = "Web・モバイルを中心に、幅広いアプリケーション開発に取り組んでいます。";
const EN = "Crafting innovative applications across web and mobile.";
const LABEL = `Hello, World! ${JA} ${EN} GitHub Stats, Top Languages, Contribution Activity`;

const root = (W, H, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${r2(H)}" viewBox="0 0 ${W} ${r2(H)}" role="img" aria-label="${LABEL}">
${body}
</svg>
`;

/* ---------- 並べる ---------- */
export async function composeProfile({ outDir, stats, languages, activity, activityMobile }) {
  const banner = await readFile(BANNER, "utf8");

  // PC：上から 歩く Claude → Hello, World! → 紹介文 → Stats | Top Languages → Activity
  {
    const W = 804, G = 12, half = (W - G) / 2;
    const out = [];
    let y = 0;
    const row = (svg, p, x, w) => { const r = place(svg, p, x, y, w); out.push(r.svg); return r.h; };
    y += row(walkerBar({ W, H: 72, u: 2.4, speed: 64 }), "wk", 0, W) + G;
    y += row(banner, "bn", 0, W) + G;
    y += row(introTile(W, 84, [
      { t: JA, y: 40, size: 15, fill: "#E2E8F0" },
      { t: EN, y: 62, size: 12, fill: "#94A3B8", italic: true },
    ]), "it", 0, W) + G;
    y += Math.max(row(stats, "st", 0, half), row(languages, "lg", half + G, half)) + G;
    y += row(activity, "ac", 0, W);
    await writeFile(path.join(outDir, "profile.svg"), root(W, y, out.join("\n")));
  }

  // スマホ：縦 1 列
  {
    const W = 420, G = 10;
    const out = [];
    let y = 0;
    const row = (svg, p, w = W) => { const r = place(svg, p, 0, y, w); out.push(r.svg); y += r.h + G; };
    row(walkerBar({ W, H: 64, u: 2.6, speed: 40 }), "wk");
    row(calmBanner(banner), "bn");
    row(introTile(W, 104, [
      { t: "Web・モバイルを中心に、", y: 37, size: 14, fill: "#E2E8F0" },
      { t: "幅広いアプリケーション開発に取り組んでいます。", y: 60, size: 14, fill: "#E2E8F0" },
      { t: EN, y: 84, size: 11, fill: "#94A3B8", italic: true },
    ]), "it");
    row(stats, "st");
    row(languages, "lg");
    row(activityMobile, "ac");
    await writeFile(path.join(outDir, "profile-mobile.svg"), root(W, y - G, out.join("\n")));
  }
}
