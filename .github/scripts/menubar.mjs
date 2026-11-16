#!/usr/bin/env node
/**
 * メニューバー風ステータス
 * ------------------------
 * Mac のメニューバーのような細い帯を SVG で作ります（PC 用・スマホ用の 2 枚）。
 *   menubar.svg         … PC 用（804×44）：ロゴ・名前・メニュー｜作業中のリポジトリ・Claude Code・日時
 *   menubar-mobile.svg  … スマホ用（420×56）：ロゴ・名前｜作業中のリポジトリ・時刻
 *
 * 「作業中のリポジトリ」は、いちばん最近 push された公開リポジトリ（このプロフィール用リポジトリは除く）。
 * 日時は生成した時点の日本時間。.github/workflows/menubar.yml が毎時間作り直します。
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
  return { date: `${parts.month}/${parts.day}(${parts.weekday})`, time: `${parts.hour}:${parts.minute}` };
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

const frame = (w, h, r, body, label) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">
${defs(w, h, r)}
${style}
<g clip-path="url(#mb-clip)">
  <rect width="${w}" height="${h}" fill="url(#mb-bg)"/>
  <rect width="${w}" height="${h}" fill="url(#mb-a)"/>
  <rect width="${w}" height="${h}" fill="url(#mb-b)"/>
  <rect width="${w}" height="1" fill="#FFFFFF" fill-opacity=".07"/>
</g>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="${r - 0.5}" fill="none" stroke="#94A3B8" stroke-opacity=".16"/>
${body}
</svg>
`;

const logo = (x, y, s) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.28}" fill="url(#mb-logo)"/>
<text class="sans" x="${x + s / 2}" y="${y + s * 0.72}" text-anchor="middle" font-size="${s * 0.58}" font-weight="900" fill="#04120D">R</text>`;

const statusDot = (x, y, r) => `<circle class="ping" cx="${x}" cy="${y}" r="${r}" fill="#10B981"/><circle cx="${x}" cy="${y}" r="${r}" fill="#10B981"/>`;

/* ---------- PC 用 ---------- */
function desktop(status, dt) {
  const W = 804, H = 44, FS = 13, Y = 27, GAP = 26;
  // 左：ロゴ・名前・メニュー（左から順に並べる）
  let x = 46;
  const left = [label(x, Y, "raika10", FS, 'fill="#F1F5F9"', "start", true)];
  x += textWidth("raika10", FS, true) + 22;
  for (const m of ["Projects", "Activity", "About"]) { left.push(label(x, Y, m, FS)); x += textWidth(m, FS) + 18; }
  // 右：日時 → Claude Code → 作業中のリポジトリ（右から順に並べる）
  // 日付と時刻は別の要素にする（空白を含む文字列に textLength を付けると Safari で字が崩れるため）
  const xTime = W - 16;
  const xDate = xTime - textWidth(dt.time, FS) - 7;
  const xClaude = xDate - textWidth(dt.date, FS) - GAP;
  const xSpark = xClaude - textWidth("Claude Code", FS) - 5;
  const xStatus = xSpark - FS * 0.9 - GAP;
  const dotX = xStatus - textWidth(status, FS) - 10;
  const body = `<g class="sans" font-size="${FS}">
  ${logo(14, 11, 22)}
  ${left[0]}
  <g fill="#CBD5E1" fill-opacity=".85">${left.slice(1).join("")}</g>
  ${statusDot(dotX, Y - 4.5, 3.4)}
  ${label(xStatus, Y, status, FS, 'fill="#E2E8F0"', "end")}
  ${sparkle(xSpark, Y, FS, "end")}
  ${label(xClaude, Y, "Claude Code", FS, 'fill="#F2A385"', "end")}
  ${label(xDate, Y, dt.date, FS, 'fill="#F1F5F9"', "end")}
  ${label(xTime, Y, dt.time, FS, 'fill="#F1F5F9"', "end")}
</g>`;
  return frame(W, H, 12, body, `raika10 のメニューバー：${status}・${dt.date} ${dt.time}`);
}

/* ---------- スマホ用（項目を絞って文字を大きく） ---------- */
function mobile(status, dt) {
  const W = 420, H = 56, FS = 15, Y = 34;
  const xTime = W - 18;
  const xSpark = xTime - textWidth(dt.time, FS) - 12;
  const xStatus = xSpark - FS * 0.9 - 14;
  const dotX = xStatus - textWidth(status, FS) - 11;
  const body = `<g class="sans" font-size="${FS}">
  ${logo(16, 15, 26)}
  ${label(52, Y, "raika10", FS, 'fill="#F1F5F9"', "start", true)}
  ${statusDot(dotX, Y - 5, 3.8)}
  ${label(xStatus, Y, status, FS, 'fill="#E2E8F0"', "end")}
  ${sparkle(xSpark, Y, FS, "end")}
  ${label(xTime, Y, dt.time, FS, 'fill="#F1F5F9"', "end")}
</g>`;
  return frame(W, H, 14, body, `raika10 のメニューバー：${status}・${dt.time}`);
}

/* ---------- main ---------- */
const now = new Date();
const repo = await latestRepo();
const dt = jst(now);
await mkdir(OUT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, "menubar.svg"), desktop(statusText(repo, now, 24), dt));
await writeFile(path.join(OUT_DIR, "menubar-mobile.svg"), mobile(statusText(repo, now, 11), dt));
console.log(`menu bar: "${statusText(repo, now, 24)}" · ${dt.date} ${dt.time} → ${OUT_DIR}`);
