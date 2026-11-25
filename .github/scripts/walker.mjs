/**
 * 歩く Claude のバー
 * ------------------
 * 紺のガラス風のバーの中を、オレンジのドット絵の Claude が左から右へ歩く SVG（CSS アニメーションのみ）。
 * compose.mjs がプロフィール画像の一番上に置きます。
 *
 * 11×7 マスのドット絵。足は 2 コマで交互に動き、体が少し弾み、ときどきまばたきする。
 * 右端から出たら少し休み、左端から入り直す。
 * 最初のコマ（アニメーションが止まる環境）でもバーの中に立っている位置から始める。
 */
const CLAUDE = "#D97757", EYE = "#1A1310";

export function walkerBar({ W, H, r = 14, u, speed, pause = 2.2 }) {
  const w = 11 * u, h = 7 * u;
  const px = (x, y, ww, hh) => `<rect x="${x * u}" y="${y * u}" width="${ww * u}" height="${hh * u}"/>`;
  const body = px(2, 0, 7, 5) + px(0, 2, 2, 1) + px(9, 2, 2, 1); // 胴体と両腕
  const eyes = px(4, 1, 1, 2) + px(7, 1, 1, 2); // 進む向き（右）寄りの目
  // 足は胴体に 1 マス食い込ませておく（体が弾んでも足が離れて見えないように）
  const legsA = px(2, 4, 1, 3) + px(4, 4, 1, 2) + px(6, 4, 1, 3) + px(8, 4, 1, 2);
  const legsB = px(2, 4, 1, 2) + px(4, 4, 1, 3) + px(6, 4, 1, 2) + px(8, 4, 1, 3);

  const top = (H - h) / 2 + u * 0.5; // 上下の中央より少しだけ下
  const BX = Math.round(W * 0.06); // 最初のコマの位置
  const xs = -w - 6, xe = W + 6; // 画面外（左・右）
  const t1 = (xe - BX) / speed, t2 = (BX - xs) / speed, T = t1 + pause + t2;
  const p1 = ((t1 / T) * 100).toFixed(2), p3 = (((t1 + pause) / T) * 100).toFixed(2);
  const step = 0.32;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Claude が歩くバー">
<defs>
  <linearGradient id="wk-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#132036"/><stop offset="1" stop-color="#0D1626"/></linearGradient>
  <radialGradient id="wk-a" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${W * 0.12} ${H * 0.5}) scale(${W * 0.32} ${H * 2})"><stop offset="0" stop-color="#10B981" stop-opacity=".22"/><stop offset="1" stop-color="#10B981" stop-opacity="0"/></radialGradient>
  <radialGradient id="wk-b" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${W * 0.86} ${H * 0.5}) scale(${W * 0.3} ${H * 2})"><stop offset="0" stop-color="#38BDF8" stop-opacity=".18"/><stop offset="1" stop-color="#38BDF8" stop-opacity="0"/></radialGradient>
  <clipPath id="wk-clip"><rect width="${W}" height="${H}" rx="${r}"/></clipPath>
</defs>
<style>
  .wk-walk{animation:wk-walk ${T.toFixed(2)}s linear infinite}
  @keyframes wk-walk{0%{transform:translateX(0)}${p1}%{transform:translateX(${(xe - BX).toFixed(1)}px);animation-timing-function:steps(1,end)}${p3}%{transform:translateX(${(xs - BX).toFixed(1)}px);animation-timing-function:linear}100%{transform:translateX(0)}}
  .wk-a{animation:wk-a ${step}s steps(1,end) infinite} @keyframes wk-a{0%{opacity:1}50%{opacity:0}}
  .wk-b{opacity:0;animation:wk-b ${step}s steps(1,end) infinite} @keyframes wk-b{0%{opacity:0}50%{opacity:1}}
  .wk-bob{animation:wk-bob ${step}s steps(1,end) infinite} @keyframes wk-bob{0%{transform:translateY(0)}50%{transform:translateY(${(-u * 0.5).toFixed(2)}px)}}
  .wk-eye{transform-box:fill-box;transform-origin:center;animation:wk-blink 4.6s infinite}
  @keyframes wk-blink{0%,90%,96%,100%{transform:scaleY(1)}93%{transform:scaleY(.15)}}
  @media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<g clip-path="url(#wk-clip)">
  <rect width="${W}" height="${H}" fill="url(#wk-bg)"/>
  <rect width="${W}" height="${H}" fill="url(#wk-a)"/>
  <rect width="${W}" height="${H}" fill="url(#wk-b)"/>
  <rect width="${W}" height="1" fill="#FFFFFF" fill-opacity=".07"/>
  <g transform="translate(${BX} ${top.toFixed(2)})">
    <g class="wk-walk">
      <ellipse cx="${w / 2}" cy="${h + u * 0.4}" rx="${u * 4.2}" ry="${u * 0.7}" fill="#000000" fill-opacity=".35"/>
      <g fill="${CLAUDE}" shape-rendering="crispEdges">
        <g class="wk-bob">${body}<g class="wk-eye" fill="${EYE}">${eyes}</g></g>
        <g class="wk-a">${legsA}</g>
        <g class="wk-b">${legsB}</g>
      </g>
    </g>
  </g>
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="${r - 0.5}" fill="none" stroke="#94A3B8" stroke-opacity=".16"/>
</svg>
`;
}
