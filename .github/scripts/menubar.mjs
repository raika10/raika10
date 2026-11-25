#!/usr/bin/env node
/**
 * メニューバー風ステータス
 * ------------------------
 * Mac のメニューバーのような細い帯を SVG で作ります（PC 用・スマホ用の 2 枚）。
 *   menubar.svg         … PC 用（804×50）：ロゴ・名前・メニュー｜作業中のリポジトリ・Claude Code・更新日時
 *   menubar-mobile.svg  … スマホ用（420×62）：ロゴ・名前｜作業中のリポジトリ・更新日時
 *
 * 「作業中のリポジトリ」は、いちばん最近 push された公開リポジトリ（このプロフィール用リポジトリは除く）。
 * 日時は生成した時点の日本時間。.github/workflows/menubar.yml が 30 分ごとに作り直しますが、
 * GitHub が混んでいると数時間遅れることがあるので、現在時刻ではなく「更新」日時として表示します。
 * バーの下の端では、オレンジのドット絵の Claude が左から右へ歩きます（CSS アニメーションのみ）。
 *
 * 環境変数
 *   GITHUB_TOKEN  必須（Actions では secrets.GITHUB_TOKEN）
 *   GH_USER       必須（Actions では github.repository_owner）
 *   OUT_DIR       出力先（既定: out）
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const USER = process.env.GH_USER;
const TOKEN = process.env.GITHUB_TOKEN;
const OUT_DIR = process.env.OUT_DIR || "out";
if (!USER || !TOKEN) { console.error("GH_USER and GITHUB_TOKEN are required."); process.exit(1); }

const SANS = `'Inter','Segoe UI',-apple-system,BlinkMacSystemFont,'Hiragino Sans','Yu Gothic','Helvetica Neue',Arial,sans-serif`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// 文字幅の見積もり（em）。見積もった幅を textLength で固定するので、閲覧環境のフォントが違っても配置がずれない
const charW = (ch) => {
  if (ch.charCodeAt(0) > 0x2e7f) return 1; // 全角
  if (" ·".includes(ch)) return 0.27;
  if ("iljtfr".includes(ch)) return 0.3;
  if ("mw".includes(ch)) return 0.8;
  if ("MW".includes(ch)) return 0.86;
  if (ch === "I") return 0.28;
  if (/[a-z]/.test(ch)) return 0.53;
  if (/[A-Z]/.test(ch)) return 0.64;
  if (/[0-9]/.test(ch)) return 0.55;
  if ("()/:.,-_[]".includes(ch)) return 0.32;
  return 0.6;
};
const textWidth = (s, size, bold = false) => [...s].reduce((w, ch) => w + charW(ch), 0) * size * (bold ? 1.06 : 1);
// 幅を固定したテキスト
const label = (x, y, s, size, attrs = "", anchor = "start", bold = false) =>
  `<text x="${x.toFixed(1)}" y="${y}" text-anchor="${anchor}" textLength="${textWidth(s, size, bold).toFixed(1)}" lengthAdjust="spacing"${bold ? ' font-weight="700"' : ""} ${attrs}>${esc(s)}</text>`;
// 長いリポジトリ名は省略
const clip = (s, n) => ([...s].length > n ? [...s].slice(0, n - 1).join("") + "…" : s);

/* ---------- データ ---------- */
async function latestRepo() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "profile-menubar" },
    body: JSON.stringify({
      query: `query($login:String!){ user(login:$login){ login repositories(ownerAffiliations:OWNER,isFork:false,privacy:PUBLIC,first:10,orderBy:{field:PUSHED_AT,direction:DESC}){ nodes{ name pushedAt } } } }`,
      variables: { login: USER },
    }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GraphQL error: ${JSON.stringify(json.errors || json)}`);
  const u = json.data.user;
  return u.repositories.nodes.find((r) => r.name.toLowerCase() !== u.login.toLowerCase()) || null;
}

function statusText(repo, now, max) {
  if (!repo) return "のんびり中";
  const name = clip(repo.name, max);
  const h = (now - new Date(repo.pushedAt)) / 36e5;
  if (h < 24) return `${name} を作業中`;
  if (h < 24 * 7) return `${name} · ${Math.floor(h / 24)} 日前`;
  return `最近：${name}`;
}

function jst(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.month}/${parts.day}(${parts.weekday})`, short: `${parts.month}/${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/* ---------- 共通の部品 ---------- */
const defs = (w, h, r) => `<defs>
  <linearGradient id="mb-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#132036"/><stop offset="1" stop-color="#0D1626"/></linearGradient>
  <radialGradient id="mb-a" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${w * 0.12} ${h * 0.5}) scale(${w * 0.32} ${h * 2})"><stop offset="0" stop-color="#10B981" stop-opacity=".22"/><stop offset="1" stop-color="#10B981" stop-opacity="0"/></radialGradient>
  <radialGradient id="mb-b" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${w * 0.86} ${h * 0.5}) scale(${w * 0.3} ${h * 2})"><stop offset="0" stop-color="#38BDF8" stop-opacity=".18"/><stop offset="1" stop-color="#38BDF8" stop-opacity="0"/></radialGradient>
  <linearGradient id="mb-logo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10B981"/><stop offset="1" stop-color="#38BDF8"/></linearGradient>
  <clipPath id="mb-clip"><rect width="${w}" height="${h}" rx="${r}"/></clipPath>
</defs>`;

const style = `<style>
  .sans{font-family:${SANS}}
  .ping{transform-box:fill-box;transform-origin:center;animation:ping 2.4s ease-out infinite}
  @keyframes ping{0%{transform:scale(1);opacity:.7}100%{transform:scale(2.6);opacity:0}}
  .spark text{opacity:0;animation:spark 1.2s steps(1) infinite}
  @keyframes spark{0%{opacity:1}16.6%,100%{opacity:0}}
  @media (prefers-reduced-motion:reduce){*{animation:none!important}.spark text:first-child{opacity:1}}
</style>`;

// ✻ がきらめく（6 つの形を順に表示）。✳ は iPhone などで絵文字になるので使わない
const sparkle = (x, y, size, anchor = "start") =>
  `<g class="spark" fill="#F2A385" font-size="${size}">${["✢", "✶", "✻", "✽", "✻", "✶"].map((g, i) =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" style="animation-delay:${(i * 0.2).toFixed(1)}s">${g}</text>`).join("")}</g>`;

const frame = (w, h, r, body, label, inside = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">
${defs(w, h, r)}
${style}
<g clip-path="url(#mb-clip)">
  <rect width="${w}" height="${h}" fill="url(#mb-bg)"/>
  <rect width="${w}" height="${h}" fill="url(#mb-a)"/>
  <rect width="${w}" height="${h}" fill="url(#mb-b)"/>
  <rect width="${w}" height="1" fill="#FFFFFF" fill-opacity=".07"/>
  ${inside}
</g>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="${r - 0.5}" fill="none" stroke="#94A3B8" stroke-opacity=".16"/>
${body}
</svg>
`;

const logo = (x, y, s) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.28}" fill="url(#mb-logo)"/>
<text class="sans" x="${x + s / 2}" y="${y + s * 0.72}" text-anchor="middle" font-size="${s * 0.58}" font-weight="900" fill="#04120D">R</text>`;

/* ---------- 歩く Claude（ドット絵） ----------
   11×7 マスのドット絵。足は 2 コマで交互に動き、体が少し弾み、ときどきまばたきする。
   バーの右端から出たら少し休み、左端から入り直す。最初のコマ（アニメーションが止まる環境）でもバーの中に見える位置から始める */
const CLAUDE = "#D97757", EYE = "#1A1310";
function walker(W, H, u, speed, pause = 2.5) {
  const w = 11 * u, h = 7 * u;
  const px = (x, y, ww, hh) => `<rect x="${x * u}" y="${y * u}" width="${ww * u}" height="${hh * u}"/>`;
  const body = px(2, 0, 7, 5) + px(0, 2, 2, 1) + px(9, 2, 2, 1); // 胴体と両腕
  const eyes = px(4, 1, 1, 2) + px(7, 1, 1, 2); // 右（進む向き）寄りの目
  // 足は胴体に 1 マス食い込ませておく（体が弾んでも足が離れて見えないように）
  const legsA = px(2, 4, 1, 3) + px(4, 4, 1, 2) + px(6, 4, 1, 3) + px(8, 4, 1, 2);
  const legsB = px(2, 4, 1, 2) + px(4, 4, 1, 3) + px(6, 4, 1, 2) + px(8, 4, 1, 3);
  const BX = Math.round(W * 0.05); // 最初のコマの位置
  const xs = -w - 6, xe = W + 6; // 画面外（左・右）
  const t1 = (xe - BX) / speed, t2 = (BX - xs) / speed, T = t1 + pause + t2;
  const p1 = ((t1 / T) * 100).toFixed(2), p3 = (((t1 + pause) / T) * 100).toFixed(2);
  const step = 0.32;
  return `<style>
  .cl-walk{animation:cl-walk ${T.toFixed(2)}s linear infinite}
  @keyframes cl-walk{0%{transform:translateX(0)}${p1}%{transform:translateX(${(xe - BX).toFixed(1)}px);animation-timing-function:steps(1,end)}${p3}%{transform:translateX(${(xs - BX).toFixed(1)}px);animation-timing-function:linear}100%{transform:translateX(0)}}
  .cl-a{animation:cl-a ${step}s steps(1,end) infinite} @keyframes cl-a{0%{opacity:1}50%{opacity:0}}
  .cl-b{opacity:0;animation:cl-b ${step}s steps(1,end) infinite} @keyframes cl-b{0%{opacity:0}50%{opacity:1}}
  .cl-bob{animation:cl-bob ${step}s steps(1,end) infinite} @keyframes cl-bob{0%{transform:translateY(0)}50%{transform:translateY(${(-u * 0.5).toFixed(2)}px)}}
  .cl-eye{transform-box:fill-box;transform-origin:center;animation:cl-blink 4.6s infinite}
  @keyframes cl-blink{0%,90%,96%,100%{transform:scaleY(1)}93%{transform:scaleY(.15)}}
</style>
<g transform="translate(${BX} ${(H - 1 - h).toFixed(2)})" fill="${CLAUDE}" shape-rendering="crispEdges">
  <g class="cl-walk">
    <g class="cl-bob">${body}<g class="cl-eye" fill="${EYE}">${eyes}</g></g>
    <g class="cl-a">${legsA}</g>
    <g class="cl-b">${legsB}</g>
  </g>
</g>`;
}

const statusDot = (x, y, r) => `<circle class="ping" cx="${x}" cy="${y}" r="${r}" fill="#10B981"/><circle cx="${x}" cy="${y}" r="${r}" fill="#10B981"/>`;

/* ---------- PC 用 ---------- */
function desktop(status, dt) {
  const W = 804, H = 50, FS = 13, Y = 26, GAP = 26; // 下の端はキャラクターの通り道
  // 左：ロゴ・名前・メニュー（左から順に並べる）
  let x = 46;
  const left = [label(x, Y, "raika10", FS, 'fill="#F1F5F9"', "start", true)];
  x += textWidth("raika10", FS, true) + 22;
  for (const m of ["Projects", "Activity", "About"]) { left.push(label(x, Y, m, FS)); x += textWidth(m, FS) + 18; }
  // 右：更新日時 → Claude Code → 作業中のリポジトリ（右から順に並べる）
  // 日付と時刻は別の要素にする（空白を含む文字列に textLength を付けると Safari で字が崩れるため）
  const xTime = W - 16;
  const xDate = xTime - textWidth(dt.time, FS) - 7;
  const xUpd = xDate - textWidth(dt.date, FS) - 7;
  const xClaude = xUpd - textWidth("更新", FS) - GAP;
  const xSpark = xClaude - textWidth("Claude Code", FS) - 5;
  const xStatus = xSpark - FS * 0.9 - GAP;
  const dotX = xStatus - textWidth(status, FS) - 10;
  const body = `<g class="sans" font-size="${FS}">
  ${logo(14, 10, 22)}
  ${left[0]}
  <g fill="#CBD5E1" fill-opacity=".85">${left.slice(1).join("")}</g>
  ${statusDot(dotX, Y - 4.5, 3.4)}
  ${label(xStatus, Y, status, FS, 'fill="#E2E8F0"', "end")}
  ${sparkle(xSpark, Y, FS, "end")}
  ${label(xClaude, Y, "Claude Code", FS, 'fill="#F2A385"', "end")}
  ${label(xUpd, Y, "更新", FS, 'fill="#94A3B8"', "end")}
  ${label(xDate, Y, dt.date, FS, 'fill="#F1F5F9"', "end")}
  ${label(xTime, Y, dt.time, FS, 'fill="#F1F5F9"', "end")}
</g>`;
  return frame(W, H, 12, body, `raika10 のメニューバー：${status}・${dt.date} ${dt.time} 更新`, walker(W, H, 1.7, 58));
}

/* ---------- スマホ用（項目を絞って文字を大きく。幅が足りないので ✻ は省く） ---------- */
function mobile(status, dt) {
  const W = 420, H = 62, FS = 15, Y = 31; // 下の端はキャラクターの通り道
  const xTime = W - 18;
  const xDate = xTime - textWidth(dt.time, FS) - 6;
  const xUpd = xDate - textWidth(dt.short, FS) - 6;
  const xStatus = xUpd - textWidth("更新", FS) - 18;
  const dotX = xStatus - textWidth(status, FS) - 11;
  const body = `<g class="sans" font-size="${FS}">
  ${logo(16, 13, 26)}
  ${label(52, Y, "raika10", FS, 'fill="#F1F5F9"', "start", true)}
  ${statusDot(dotX, Y - 5, 3.8)}
  ${label(xStatus, Y, status, FS, 'fill="#E2E8F0"', "end")}
  ${label(xUpd, Y, "更新", FS, 'fill="#94A3B8"', "end")}
  ${label(xDate, Y, dt.short, FS, 'fill="#F1F5F9"', "end")}
  ${label(xTime, Y, dt.time, FS, 'fill="#F1F5F9"', "end")}
</g>`;
  return frame(W, H, 14, body, `raika10 のメニューバー：${status}・${dt.short} ${dt.time} 更新`, walker(W, H, 2, 36));
}

/* ---------- main ---------- */
const now = new Date();
const repo = await latestRepo();
const dt = jst(now);
await mkdir(OUT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, "menubar.svg"), desktop(statusText(repo, now, 24), dt));
await writeFile(path.join(OUT_DIR, "menubar-mobile.svg"), mobile(statusText(repo, now, 9), dt));
console.log(`menu bar: "${statusText(repo, now, 24)}" · ${dt.date} ${dt.time} → ${OUT_DIR}`);
