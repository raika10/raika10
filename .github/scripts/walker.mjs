/**
 * 歩く Claude のお散歩タイル
 * ------------------------
 * 白を基調にした野原の散歩道を、オレンジのドット絵の Claude が左から右へ歩く SVG（CSS アニメーションのみ）。
 *   奥から：白い空・お日さま・流れる雲と小鳥 → 遠くの丘 → 木と茂み・奥のお花 → 砂の小道（Claude が歩く）→ 手前の草地とお花
 *   ちょうちょがお花のまわりをふわふわ飛ぶ。
 * compose.mjs がプロフィール画像の一番上に置きます。
 *
 * 背景のドットは Claude と同じ大きさ（p = u）にそろえて、1 枚のドット絵に見えるようにする。
 * 最初のコマ（アニメーションが止まる環境）でも、雲・小鳥・ちょうちょ・Claude がタイルの中に見える位置から始める。
 */
const C = {
  claude: "#D97757", eye: "#1A1310",
  sky0: "#FFFFFF", sky1: "#F3FAF6", sun: "#FDE68A", cloud: "#DFE8EF", bird: "#7C8BA1",
  hillFar: "#E8F5EC", hillNear: "#DAF0E2", back: "#D3EEDB",
  path: "#F5EDE0", pathEdge: "#E6D9C2", pebble: "#DDCDB1",
  front0: "#CDEBD6", front1: "#E3F4E8", blade1: "#B9E2C6", blade2: "#A6D9B5",
  stem: "#6FBF8A", leaf: "#8FD4A3",
  canopyHi: "#BDE8CA", canopy: "#93D3A6", canopyLo: "#76C28E", trunk: "#C49A6C",
};
// 花びらの色と真ん中の色
const FLOWERS = [
  ["#F9A8D4", "#FDE68A"], // ピンク
  ["#FCD34D", "#F97316"], // 黄色
  ["#C4B5FD", "#FDE68A"], // ラベンダー
  ["#93C5FD", "#FEF3C7"], // 水色
  ["#FB7185", "#FDE68A"], // ローズ
  ["#FDBA74", "#FEF3C7"], // コーラル
];
// ドット絵（1 文字 = 1 マス）。H: 明るい葉 / C: 葉 / L: 影の葉 / T: 幹
const TREE = [
  "..HHHH...",
  ".HHCCCC..",
  "HHCCCCCC.",
  "HCCCCCCCL",
  "CCCCCCCLL",
  ".CCCCCLL.",
  "..CLLLL..",
  "....T....",
  "....T....",
  "...TTT...",
];
const BUSH = [".HHC.", "HCCCL", "CCCLL"];
const CLOUD = ["..XXX....", ".XXXXXX..", "XXXXXXXXX"];
const SPRITE_COLORS = { H: C.canopyHi, C: C.canopy, L: C.canopyLo, T: C.trunk };

// 毎回同じ配置になる乱数
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const f2 = (n) => Math.round(n * 100) / 100;

export function walkerBar({ W, H, r = 14, u, speed, pause = 2.2, p = u, seed = 7 }) {
  const rand = rng(seed);
  const cell = (x, y, w = 1, h = 1, fill) => `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w * p)}" height="${f2(h * p)}"${fill ? ` fill="${fill}"` : ""}/>`;
  // ドット絵を描く（横に同じ色が続くマスは 1 つの長方形にまとめる）
  const sprite = (rows, colors, x, y) => rows.map((row, j) => {
    let out = "";
    for (let i = 0; i < row.length;) {
      const c = row[i];
      let n = 1;
      while (row[i + n] === c) n++;
      if (colors[c]) out += cell(x + i * p, y + j * p, n, 1, colors[c]);
      i += n;
    }
    return out;
  }).join("");
  const snap = (v) => Math.round(v / p) * p;

  // 高さの割り付け（下から：手前の草地 → 小道 → 奥の草地 → 丘 → 空）
  const PB = H - Math.round(H * 0.17); // 小道の下端
  const PT = PB - Math.round(H * 0.12); // 小道の上端
  const GB = PT - Math.round(H * 0.09); // 丘のふもと（奥の草地の上端）
  const W2 = W > 600;
  let css = "";

  /* 遠くの丘（2 層） */
  const hill = (amp, lift, fill, phase) => {
    let d = `M0 ${GB} L0 ${f2(GB - lift)}`;
    const n = W2 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const x0 = (W / n) * i, x1 = (W / n) * (i + 1);
      const peak = GB - lift - amp * (0.6 + 0.4 * Math.sin(i * 1.7 + phase));
      d += ` Q${f2((x0 + x1) / 2)} ${f2(peak)} ${f2(x1)} ${f2(GB - lift)}`;
    }
    return `<path d="${d} L${W} ${GB} Z" fill="${fill}"/>`;
  };

  /* 空を横切るもの（雲・小鳥）。右へ流れ、右端を出たら左端から戻る。最初のコマで元の位置に来るよう途中から始める */
  const drift = (name, x0, y0, w, dur, inner) => {
    const from = f2(-x0 - w - 4), to = f2(W - x0 + 4);
    const delay = f2(-(dur * -from) / (to - from));
    css += `\n  .${name}{animation:${name} ${dur}s ${delay}s linear infinite} @keyframes ${name}{from{transform:translateX(${from}px)}to{transform:translateX(${to}px)}}`;
    return `<g transform="translate(${f2(x0)} ${f2(y0)})"><g class="${name}">${inner}</g></g>`;
  };
  const clouds = (W2 ? [[0.14, 0.1, 80], [0.5, 0.04, 105], [0.78, 0.16, 90]] : [[0.18, 0.08, 60], [0.66, 0.18, 75]])
    .map(([fx, fy, dur], i) => drift(`wk-c${i}`, W * fx, H * fy + 2, CLOUD[0].length * p, dur, sprite(CLOUD, { X: C.cloud }, 0, 0))).join("");
  // 小鳥（羽を上げる / 下げるの 2 コマ）
  const birdUp = cell(0, 0) + cell(p, p) + cell(2 * p, 0);
  const birdDown = cell(0, p) + cell(p, p) + cell(2 * p, p);
  const bird = `<g fill="${C.bird}"><g class="wk-wa">${birdUp}</g><g class="wk-wb">${birdDown}</g></g>`;
  const birds = (W2 ? [[0.3, 0.2, 48], [0.34, 0.12, 48]] : [[0.4, 0.16, 36]])
    .map(([fx, fy, dur], i) => drift(`wk-bd${i}`, W * fx, H * fy, 3 * p, dur, bird)).join("");

  /* 奥の草地：木・茂み・お花 */
  let backs = "";
  const trees = W2 ? [0.2, 0.47, 0.71, 0.93] : [0.28, 0.8];
  for (const fx of trees) {
    const rows = rand() < 0.6 ? TREE : TREE.slice(1);
    backs += sprite(rows, SPRITE_COLORS, snap(W * fx - 4.5 * p), PT - 1 - rows.length * p);
  }
  for (let x = snap(8 + rand() * 20); x < W - 8; x = snap(x + 30 + rand() * 60)) {
    if (trees.some((fx) => Math.abs(x - W * fx) < 8 * p)) continue;
    if (rand() < 0.4) backs += sprite(BUSH, SPRITE_COLORS, x - 2 * p, PT - 1 - 3 * p);
  }

  const flower = (bx, base, stem) => {
    const [petal, center] = FLOWERS[Math.floor(rand() * FLOWERS.length)];
    const top = base - (stem + 3) * p;
    let g = cell(bx, top + 3 * p, 1, stem, C.stem);
    if (stem >= 2) g += cell(bx + (rand() < 0.5 ? p : -p), top + (3 + Math.floor((stem - 1) / 2)) * p, 1, 1, C.leaf);
    if (rand() < 0.7) { // 十字の花
      g += cell(bx, top, 1, 1, petal) + cell(bx - p, top + p, 1, 1, petal) + cell(bx + p, top + p, 1, 1, petal) + cell(bx, top + 2 * p, 1, 1, petal) + cell(bx, top + p, 1, 1, center);
    } else { // チューリップ
      g += cell(bx - p, top, 1, 1, petal) + cell(bx + p, top, 1, 1, petal) + cell(bx - p, top + p, 3, 2, petal) + cell(bx, top + p, 1, 1, center);
    }
    return g;
  };
  for (let x = snap(6 + rand() * 10); x < W - 6; x = snap(x + 14 + rand() * 26)) backs += flower(x, PT, 1 + Math.floor(rand() * 2));

  /* 小道（砂）と小石 */
  let pebbles = "";
  for (let i = 0; i < (W2 ? 34 : 18); i++) pebbles += cell(snap(rand() * W), snap(PT + p + rand() * (PB - PT - 2.5 * p)), rand() < 0.3 ? 2 : 1, 1, C.pebble);

  /* 手前の草地：ふちの短い草とお花 */
  let fronts = "";
  for (let x = 0; x < W; x += p * 2) if (rand() < 0.5) fronts += cell(snap(x), PB, 1, 1, rand() < 0.5 ? C.blade1 : C.blade2);
  const room = Math.floor((H - 3 - PB) / p) - 4; // 小道にかからない茎の長さ
  for (let x = snap(12 + rand() * 16); x < W - 6; x = snap(x + 18 + rand() * 34)) {
    if (rand() < 0.2) { fronts += cell(x - p, H - 3 - p, 1, 1, C.leaf) + cell(x + p, H - 3 - p, 1, 1, C.leaf) + cell(x, H - 3 - 2 * p, 1, 2, C.stem); continue; }
    fronts += flower(x, H - 3, 1 + Math.floor(rand() * Math.max(1, Math.min(3, room))));
  }

  /* ちょうちょ（羽を 2 コマでぱたぱた、ふわふわ飛ぶ） */
  const wingsOpen = (a, b) => cell(-2 * p, 0, 2, 2, a) + cell(p, 0, 2, 2, b);
  const wingsShut = (a, b) => cell(-p, 0, 1, 2, a) + cell(p, 0, 1, 2, b);
  const butterflies = [[0.36, "#F9A8D4", "#C4B5FD", 7], [0.82, "#FCD34D", "#FDBA74", 8.5]].slice(0, W2 ? 2 : 1).map(([fx, a, b, dur], i) => {
    css += `\n  .wk-f${i}{animation:wk-f${i} ${dur}s ease-in-out infinite} @keyframes wk-f${i}{0%,100%{transform:translate(0,0)}25%{transform:translate(${f2(W * 0.03)}px,-${f2(H * 0.07)}px)}50%{transform:translate(${f2(W * 0.06)}px,${f2(H * 0.03)}px)}75%{transform:translate(${f2(W * 0.025)}px,${f2(H * 0.08)}px)}}`;
    return `<g transform="translate(${snap(W * fx)} ${f2(GB - H * 0.08)})"><g class="wk-f${i}"><g class="wk-fa">${wingsOpen(a, b)}</g><g class="wk-fb">${wingsShut(a, b)}</g>${cell(0, 0, 1, 2, "#475569")}</g></g>`;
  }).join("");

  /* Claude */
  const w = 11 * u, h = 7 * u;
  const px = (x, y, ww, hh) => `<rect x="${x * u}" y="${y * u}" width="${ww * u}" height="${hh * u}"/>`;
  const body = px(2, 0, 7, 5) + px(0, 2, 2, 1) + px(9, 2, 2, 1); // 胴体と両腕
  const eyes = px(4, 1, 1, 2) + px(7, 1, 1, 2); // 進む向き（右）寄りの目
  // 足は胴体に 1 マス食い込ませておく（体が弾んでも足が離れて見えないように）
  const legsA = px(2, 4, 1, 3) + px(4, 4, 1, 2) + px(6, 4, 1, 3) + px(8, 4, 1, 2);
  const legsB = px(2, 4, 1, 2) + px(4, 4, 1, 3) + px(6, 4, 1, 2) + px(8, 4, 1, 3);
  const feet = (PT + PB) / 2 + p; // 小道のまん中より少し手前を歩く
  const top = feet - h;
  const BX = Math.round(W * 0.06); // 最初のコマの位置
  const xs = -w - 6, xe = W + 6; // 画面外（左・右）
  const t1 = (xe - BX) / speed, t2 = (BX - xs) / speed, T = t1 + pause + t2;
  const k1 = ((t1 / T) * 100).toFixed(2), k3 = (((t1 + pause) / T) * 100).toFixed(2);
  const step = 0.32;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="野原の散歩道をお散歩する Claude">
<defs>
  <linearGradient id="wk-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.sky0}"/><stop offset="1" stop-color="${C.sky1}"/></linearGradient>
  <radialGradient id="wk-sun"><stop offset="0" stop-color="${C.sun}" stop-opacity=".8"/><stop offset=".45" stop-color="${C.sun}" stop-opacity=".35"/><stop offset="1" stop-color="${C.sun}" stop-opacity="0"/></radialGradient>
  <linearGradient id="wk-front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.front0}"/><stop offset="1" stop-color="${C.front1}"/></linearGradient>
  <clipPath id="wk-clip"><rect width="${W}" height="${H}" rx="${r}"/></clipPath>
</defs>
<style>${css}
  .wk-wa{animation:wk-a .5s steps(1,end) infinite} .wk-wb{opacity:0;animation:wk-b .5s steps(1,end) infinite}
  .wk-fa{animation:wk-a .24s steps(1,end) infinite} .wk-fb{opacity:0;animation:wk-b .24s steps(1,end) infinite}
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
  <circle cx="${f2(W - (W2 ? 78 : 48))}" cy="${f2(H * 0.2)}" r="${f2(H * 0.3)}" fill="url(#wk-sun)"/>
  <g shape-rendering="crispEdges">${clouds}${birds}</g>
  ${hill(H * 0.12, H * 0.08, C.hillFar, 0.8)}
  ${hill(H * 0.08, H * 0.01, C.hillNear, 2.3)}
  <rect y="${GB}" width="${W}" height="${PT - GB}" fill="${C.back}"/>
  <g shape-rendering="crispEdges">${backs}</g>
  <rect y="${PT}" width="${W}" height="${PB - PT}" fill="${C.path}"/>
  <rect y="${PT}" width="${W}" height="1.5" fill="${C.pathEdge}"/>
  <rect y="${PB}" width="${W}" height="${H - PB}" fill="url(#wk-front)"/>
  <g shape-rendering="crispEdges">${pebbles}${fronts}${butterflies}</g>
  <g transform="translate(${BX} ${f2(top)})">
    <g class="wk-walk">
      <ellipse cx="${f2(w / 2)}" cy="${f2(h)}" rx="${f2(u * 4.2)}" ry="${f2(u * 0.7)}" fill="#7A5C3A" fill-opacity=".14"/>
      <g fill="${C.claude}" shape-rendering="crispEdges">
        <g class="wk-bob">${body}<g class="wk-eye" fill="${C.eye}">${eyes}</g></g>
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
