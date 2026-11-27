/**
 * 歩く Claude のお散歩タイル
 * ------------------------
 * 白を基調にした野原（遠くの丘・草地・小さなお花・流れる雲・ちょうちょ）を、
 * オレンジのドット絵の Claude が左から右へ散歩する SVG（CSS アニメーションのみ）。
 * compose.mjs がプロフィール画像の一番上に置きます。
 *
 * Claude は 11×7 マスのドット絵。足は 2 コマで交互に動き、体が少し弾み、ときどきまばたきする。
 * 右端から出たら少し休み、左端から入り直す。
 * 最初のコマ（アニメーションが止まる環境）でも、雲・ちょうちょ・Claude がタイルの中に見える位置から始める。
 */
const CLAUDE = "#D97757", EYE = "#1A1310";
const STEM = "#6FBF8A", LEAF = "#8FD4A3";
// 花びらの色と真ん中の色
const FLOWERS = [
  ["#F9A8D4", "#FDE68A"], // ピンク
  ["#FCD34D", "#F97316"], // 黄色
  ["#C4B5FD", "#FDE68A"], // ラベンダー
  ["#93C5FD", "#FEF3C7"], // 水色
  ["#FB7185", "#FDE68A"], // ローズ
  ["#FDBA74", "#FEF3C7"], // コーラル
];

// 毎回同じ配置になる乱数
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const f2 = (n) => Math.round(n * 100) / 100;

// p：背景のドットの大きさ（Claude と同じ u にそろえる）
export function walkerBar({ W, H, r = 14, u, speed, pause = 2.2, p = u, seed = 7 }) {
  const rand = rng(seed);
  const cell = (x, y, w = 1, h = 1, fill) => `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w * p)}" height="${f2(h * p)}"${fill ? ` fill="${fill}"` : ""}/>`;
  const GY = H - Math.round(H * 0.19); // 草地の上端（Claude が歩く地面）

  /* 遠くの丘（2 層） */
  const hill = (amp, base, fill, phase) => {
    let d = `M0 ${GY} L0 ${f2(GY - base)}`;
    const n = 4;
    for (let i = 0; i < n; i++) {
      const x0 = (W / n) * i, x1 = (W / n) * (i + 1);
      const peak = GY - base - amp * (0.6 + 0.4 * Math.sin(i * 1.7 + phase));
      d += ` Q${f2((x0 + x1) / 2)} ${f2(peak)} ${f2(x1)} ${f2(GY - base)}`;
    }
    return `<path d="${d} L${W} ${GY} Z" fill="${fill}"/>`;
  };

  /* 雲（ドット絵）。ゆっくり右へ流れ、右端を出たら左端から戻る */
  const CLOUD = ["..XXX....", ".XXXXXX..", "XXXXXXXXX"];
  const cloudShape = CLOUD.flatMap((row, y) => [...row].map((c, x) => (c === "X" ? cell(x * p, y * p) : ""))).join("");
  const cw = CLOUD[0].length * p;
  let cloudCss = "";
  const clouds = (W > 600 ? [[0.16, 0.16, 70], [0.52, 0.06, 95], [0.8, 0.22, 80]] : [[0.2, 0.12, 55], [0.68, 0.24, 70]])
    .map(([fx, fy, dur], i) => {
      const x0 = f2(W * fx), y0 = f2(H * fy + 4);
      const from = f2(-x0 - cw - 4), to = f2(W - x0 + 4);
      const delay = f2(-(dur * -from) / (to - from)); // 最初のコマで元の位置に来るよう、途中から始める
      cloudCss += `
  .wk-c${i}{animation:wk-c${i} ${dur}s ${delay}s linear infinite} @keyframes wk-c${i}{from{transform:translateX(${from}px)}to{transform:translateX(${to}px)}}`;
      return `<g transform="translate(${x0} ${y0})"><g class="wk-c${i}" fill="#DFE8EF">${cloudShape}</g></g>`;
    }).join("");

  /* お花と草むら（地面に沿って並べる） */
  let flowers = "", tufts = "", blades = "";
  for (let x = 0; x < W; x += p * 2) if (rand() < 0.45) blades += cell(Math.round(x / p) * p, GY - p, 1, 1, rand() < 0.5 ? "#B9E2C6" : "#A6D9B5"); // 地面のふちの短い草
  for (let x = 10 + rand() * 12; x < W - 10; x += 16 + rand() * 30) {
    const kind = rand();
    const [petal, center] = FLOWERS[Math.floor(rand() * FLOWERS.length)];
    const stem = 1 + Math.floor(rand() * 3); // 茎の長さ（マス）
    const bx = Math.round(x / p) * p, top = GY + p - (stem + 3) * p;
    if (kind < 0.18) { // 草むら
      tufts += cell(bx - p, GY - p, 1, 1, LEAF) + cell(bx + p, GY - p, 1, 1, LEAF) + cell(bx, GY - 2 * p, 1, 2, STEM);
      continue;
    }
    let g = cell(bx, top + 3 * p, 1, stem, STEM); // 茎
    const side = rand() < 0.5 ? p : -p;
    if (stem >= 2) g += cell(bx + side, top + (3 + Math.floor((stem - 1) / 2)) * p, 1, 1, LEAF); // 葉（地面より上の茎につける）
    if (kind < 0.72) { // 十字の花
      g += cell(bx, top, 1, 1, petal) + cell(bx - p, top + p, 1, 1, petal) + cell(bx + p, top + p, 1, 1, petal) + cell(bx, top + 2 * p, 1, 1, petal) + cell(bx, top + p, 1, 1, center);
    } else { // チューリップ
      g += cell(bx - p, top, 1, 1, petal) + cell(bx + p, top, 1, 1, petal) + cell(bx - p, top + p, 3, 2, petal) + cell(bx, top + p, 1, 1, center);
    }
    flowers += g;
  }

  /* ちょうちょ（羽を 2 コマでぱたぱた、ふわふわ飛ぶ） */
  const bfx = f2(W * 0.62), bfy = f2(GY - H * 0.42);
  const wingsOpen = cell(-2 * p, 0, 2, 2, "#F9A8D4") + cell(p, 0, 2, 2, "#C4B5FD");
  const wingsShut = cell(-p, 0, 1, 2, "#F9A8D4") + cell(p, 0, 1, 2, "#C4B5FD");
  const butterfly = `<g transform="translate(${bfx} ${bfy})"><g class="wk-fly">
    <g class="wk-fa">${wingsOpen}</g><g class="wk-fb">${wingsShut}</g>${cell(0, 0, 1, 2, "#475569")}
  </g></g>`;

  /* Claude */
  const w = 11 * u, h = 7 * u;
  const px = (x, y, ww, hh) => `<rect x="${x * u}" y="${y * u}" width="${ww * u}" height="${hh * u}"/>`;
  const body = px(2, 0, 7, 5) + px(0, 2, 2, 1) + px(9, 2, 2, 1); // 胴体と両腕
  const eyes = px(4, 1, 1, 2) + px(7, 1, 1, 2); // 進む向き（右）寄りの目
  // 足は胴体に 1 マス食い込ませておく（体が弾んでも足が離れて見えないように）
  const legsA = px(2, 4, 1, 3) + px(4, 4, 1, 2) + px(6, 4, 1, 3) + px(8, 4, 1, 2);
  const legsB = px(2, 4, 1, 2) + px(4, 4, 1, 3) + px(6, 4, 1, 2) + px(8, 4, 1, 3);
  const top = GY + 1 - h; // 足が地面に乗る高さ
  const BX = Math.round(W * 0.06); // 最初のコマの位置
  const xs = -w - 6, xe = W + 6; // 画面外（左・右）
  const t1 = (xe - BX) / speed, t2 = (BX - xs) / speed, T = t1 + pause + t2;
  const k1 = ((t1 / T) * 100).toFixed(2), k3 = (((t1 + pause) / T) * 100).toFixed(2);
  const step = 0.32;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="野原をお散歩する Claude">
<defs>
  <linearGradient id="wk-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F5FAF7"/></linearGradient>
  <radialGradient id="wk-sun"><stop offset="0" stop-color="#FDE68A" stop-opacity=".75"/><stop offset=".45" stop-color="#FDE68A" stop-opacity=".35"/><stop offset="1" stop-color="#FDE68A" stop-opacity="0"/></radialGradient>
  <linearGradient id="wk-grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CDEBD6"/><stop offset="1" stop-color="#E4F4E9"/></linearGradient>
  <clipPath id="wk-clip"><rect width="${W}" height="${H}" rx="${r}"/></clipPath>
</defs>
<style>
  ${cloudCss.trim()}
  .wk-fa{animation:wk-a .24s steps(1,end) infinite} .wk-fb{opacity:0;animation:wk-b .24s steps(1,end) infinite}
  .wk-fly{animation:wk-fly 7s ease-in-out infinite}
  @keyframes wk-fly{0%,100%{transform:translate(0,0)}25%{transform:translate(${f2(W * 0.03)}px,-${f2(H * 0.08)}px)}50%{transform:translate(${f2(W * 0.06)}px,${f2(H * 0.04)}px)}75%{transform:translate(${f2(W * 0.025)}px,${f2(H * 0.1)}px)}}
  .wk-walk{animation:wk-walk ${T.toFixed(2)}s linear infinite}
  @keyframes wk-walk{0%{transform:translateX(0)}${k1}%{transform:translateX(${(xe - BX).toFixed(1)}px);animation-timing-function:steps(1,end)}${k3}%{transform:translateX(${(xs - BX).toFixed(1)}px);animation-timing-function:linear}100%{transform:translateX(0)}}
  .wk-a{animation:wk-a ${step}s steps(1,end) infinite} @keyframes wk-a{0%{opacity:1}50%{opacity:0}}
  .wk-b{opacity:0;animation:wk-b ${step}s steps(1,end) infinite} @keyframes wk-b{0%{opacity:0}50%{opacity:1}}
  .wk-bob{animation:wk-bob ${step}s steps(1,end) infinite} @keyframes wk-bob{0%{transform:translateY(0)}50%{transform:translateY(${(-u * 0.5).toFixed(2)}px)}}
  .wk-eye{transform-box:fill-box;transform-origin:center;animation:wk-blink 4.6s infinite}
  @keyframes wk-blink{0%,90%,96%,100%{transform:scaleY(1)}93%{transform:scaleY(.15)}}
  @media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<g clip-path="url(#wk-clip)">
  <rect width="${W}" height="${H}" fill="url(#wk-sky)"/>
  <circle cx="${f2(W - (W > 600 ? 70 : 44))}" cy="${f2(H * 0.24)}" r="${f2(H * 0.42)}" fill="url(#wk-sun)"/>
  <g shape-rendering="crispEdges">${clouds}</g>
  ${hill(H * 0.16, H * 0.06, "#E9F5ED", 0.8)}
  ${hill(H * 0.1, 0, "#DCF0E3", 2.3)}
  <rect y="${GY}" width="${W}" height="${H - GY}" fill="url(#wk-grass)"/>
  <rect y="${GY}" width="${W}" height="1.5" fill="#BFE5CB"/>
  <g shape-rendering="crispEdges">${blades}${flowers}${tufts}${butterfly}</g>
  <g transform="translate(${BX} ${f2(top)})">
    <g class="wk-walk">
      <ellipse cx="${f2(w / 2)}" cy="${f2(h)}" rx="${f2(u * 4.2)}" ry="${f2(u * 0.7)}" fill="#0F172A" fill-opacity=".12"/>
      <g fill="${CLAUDE}" shape-rendering="crispEdges">
        <g class="wk-bob">${body}<g class="wk-eye" fill="${EYE}">${eyes}</g></g>
        <g class="wk-a">${legsA}</g>
        <g class="wk-b">${legsB}</g>
      </g>
    </g>
  </g>
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="${r - 0.5}" fill="none" stroke="#CFDDD5"/>
</svg>
`;
}
