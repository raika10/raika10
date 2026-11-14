#!/usr/bin/env node
/**
 * Profile cards generator
 * -----------------------
 * GitHub GraphQL API から公開データを取得し、README 用の SVG カードを生成します。
 *   assets/generated/stats.svg      … GitHub Stats
 *   assets/generated/languages.svg  … Top Languages
 *   assets/generated/activity.svg   … Activity Graph（直近 30 日）
 *
 * 環境変数
 *   GITHUB_TOKEN   必須。Actions では secrets.GITHUB_TOKEN をそのまま渡せます
 *   GH_USER        必須。Actions では github.repository_owner を渡します
 *   EXCLUDE_REPOS  任意。言語集計から除外するリポジトリ名（カンマ区切り）
 *   EXCLUDE_LANGS  任意。言語集計から除外する言語名（カンマ区切り）
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = process.env.OUT_DIR || "assets/generated";
const USER = process.env.GH_USER;
const TOKEN = process.env.GITHUB_TOKEN;
const list = (v) => (v || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const EXCLUDE_REPOS = list(process.env.EXCLUDE_REPOS);
const EXCLUDE_LANGS = list(process.env.EXCLUDE_LANGS);

if (!USER || !TOKEN) {
  console.error("GH_USER and GITHUB_TOKEN are required.");
  process.exit(1);
}

/* ------------------------------------------------------------------ design tokens */
const C = {
  navy: "#0B1220",
  emerald: "#10B981",
  cyan: "#38BDF8",
  mint: "#6EE7B7",
  text: "#F8FAFC",
  soft: "#E2E8F0",
  muted: "#94A3B8",
  faint: "#64748B",
};
const SANS = `'Inter','Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif`;
const MONO = `'JetBrains Mono','SF Mono',SFMono-Regular,Consolas,Menlo,monospace`;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const r1 = (n) => Math.round(n * 10) / 10;
const fmt = (n) => (n >= 1e6 ? `${r1(n / 1e6)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${r1(n / 1e3)}k` : String(n));

/* ------------------------------------------------------------------ data */
async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "profile-cards" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GraphQL error: ${JSON.stringify(json.errors || json)}`);
  return json.data;
}

async function fetchData() {
  const { user } = await gql(
    `query($login:String!){
      user(login:$login){
        login
        followers{ totalCount }
        pullRequests{ totalCount }
        issues{ totalCount }
        contributionsCollection{
          totalCommitContributions
          contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount } } }
        }
      }
    }`,
    { login: USER },
  );
  if (!user) throw new Error(`User not found: ${USER}`);

  const repos = [];
  let after = null;
  for (;;) {
    const d = await gql(
      `query($login:String!,$after:String){
        user(login:$login){
          repositories(ownerAffiliations:OWNER,isFork:false,privacy:PUBLIC,first:100,after:$after){
            totalCount
            pageInfo{ hasNextPage endCursor }
            nodes{ name stargazerCount languages(first:12,orderBy:{field:SIZE,direction:DESC}){ edges{ size node{ name color } } } }
          }
        }
      }`,
      { login: USER, after },
    );
    const page = d.user.repositories;
    repos.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) break;
    after = page.pageInfo.endCursor;
  }

  const stars = repos.reduce((s, r) => s + r.stargazerCount, 0);

  // プロフィール README リポジトリ自身（生成スクリプト等）は言語集計から除外
  const skip = new Set([user.login.toLowerCase(), ...EXCLUDE_REPOS]);
  const bytes = new Map();
  const colors = new Map(); // GitHub (Linguist) の言語カラー
  for (const r of repos) {
    if (skip.has(r.name.toLowerCase())) continue;
    for (const e of r.languages.edges) {
      if (EXCLUDE_LANGS.includes(e.node.name.toLowerCase())) continue;
      bytes.set(e.node.name, (bytes.get(e.node.name) || 0) + e.size);
      if (e.node.color) colors.set(e.node.name, e.node.color);
    }
  }
  const total = [...bytes.values()].reduce((a, b) => a + b, 0);
  const languages = [...bytes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, size]) => ({ name, color: colors.get(name) || C.muted, pct: total ? (size / total) * 100 : 0 }));

  const cc = user.contributionsCollection;
  const days = cc.contributionCalendar.weeks.flatMap((w) => w.contributionDays);

  return {
    login: user.login,
    stats: {
      stars,
      commits: cc.totalCommitContributions,
      prs: user.pullRequests.totalCount,
      issues: user.issues.totalCount,
      contributions: cc.contributionCalendar.totalContributions,
      repos: repos.length,
    },
    languages,
    days: days.slice(-30),
  };
}

/* ------------------------------------------------------------------ motion helpers */
// アニメーションは SVG 内の CSS と SMIL だけで完結します（README 側に JS / CSS は不要）。
// SMIL は begin=0 から「待機 → 動作」を 1 本で表すので、非対応環境でも最終状態で表示されます。
const EXPO = [0.16, 1, 0.3, 1]; // ease-out-expo
const INOUT = [0.45, 0, 0.55, 1]; // ease-in-out
let uid = 0;
const nid = (p) => `${p}${++uid}`;

function timed(delay, dur, bez = EXPO) {
  const total = Math.max(delay, 0.01) + dur;
  const k = (Math.max(delay, 0.01) / total).toFixed(4);
  return `dur="${total.toFixed(2)}s" keyTimes="0;${k};1" keySplines="0 0 1 1;${bez.join(" ")}" calcMode="spline" fill="freeze"`;
}

// cubic-bezier で「進捗 p に到達する時刻（0..1）」を求める
function timeAt(p, [x1, y1, x2, y2]) {
  const B = (s, a, b) => 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s ** 2 * b + s ** 3;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (B(m, y1, y2) < p) lo = m; else hi = m;
  }
  return B((lo + hi) / 2, x1, x2);
}

// 数字がスロットのように回転して最終値に止まるテキスト
function roller(str, { x, y, size, fill, cls, weight = 400, cw, delay = 0, dur = 1.4, anchor = "start", mono = false }) {
  const chars = [...String(str)];
  const wOf = (c) => (mono || /\d/.test(c) ? cw : c === "." ? cw * 0.45 : cw * 0.95);
  const total = chars.reduce((s, c) => s + wOf(c), 0);
  let cx = anchor === "end" ? x - total : anchor === "middle" ? x - total / 2 : x;
  const LH = Math.round(size * 1.4);
  const attrs = `class="${cls}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="middle"`;
  const digits = chars.map((c, i) => (/\d/.test(c) ? i : -1)).filter((i) => i >= 0);
  return chars
    .map((c, i) => {
      const w = wOf(c);
      const mx = r1(cx + w / 2);
      cx += w;
      if (!/\d/.test(c)) {
        return `<text ${attrs} x="${mx}" y="${y}">${esc(c)}<animate attributeName="opacity" values="0;0;1" ${timed(delay + dur * 0.4, 0.5)}/></text>`;
      }
      const order = digits.indexOf(i);
      const N = 10 * (1 + order) + Number(c);
      const id = nid("k-r");
      let strip = "";
      for (let k = 0; k <= N; k++) strip += `<text ${attrs} x="${mx}" y="${y + (N - k) * LH}">${k % 10}</text>`;
      return `<clipPath id="${id}"><rect x="${r1(mx - w)}" y="${r1(y - size * 0.92)}" width="${r1(w * 2)}" height="${r1(size * 1.24)}"/></clipPath>` +
        `<g clip-path="url(#${id})"><g>${strip}<animateTransform attributeName="transform" type="translate" values="0 ${-N * LH};0 ${-N * LH};0 0" ${timed(delay + order * 0.06, dur + order * 0.14)}/></g></g>`;
    })
    .join("\n");
}

/* ------------------------------------------------------------------ card frame */
function card({ w, h, title, meta, label, body, defs = "", css = "" }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">
<defs>
  <linearGradient id="k-hair" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${C.emerald}" stop-opacity="0"/>
    <stop offset=".35" stop-color="${C.emerald}"/>
    <stop offset=".65" stop-color="${C.cyan}"/>
    <stop offset="1" stop-color="${C.cyan}" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="k-glow" gradientUnits="userSpaceOnUse" cx="${r1(w * 0.12)}" cy="0" r="${r1(Math.max(w * 0.55, 240))}">
    <stop offset="0" stop-color="${C.emerald}" stop-opacity=".11"/>
    <stop offset="1" stop-color="${C.emerald}" stop-opacity="0"/>
  </radialGradient>
  <clipPath id="k-clip"><rect width="${w}" height="${h}" rx="14"/></clipPath>
  ${defs}
</defs>
<style>
  .k-sans{font-family:${SANS}}
  .k-mono{font-family:${MONO}}
  .k-in{animation:k-in .9s cubic-bezier(.16,1,.3,1) both}
  .k-slide{animation:k-slide .9s cubic-bezier(.16,1,.3,1) both}
  .k-fade{animation:k-fade .8s ease both}
  .k-draw{stroke-dasharray:1;animation:k-draw 1.3s cubic-bezier(.16,1,.3,1) both}
  @keyframes k-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  @keyframes k-slide{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}
  @keyframes k-fade{from{opacity:0}to{opacity:1}}
  @keyframes k-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
  ${css}
  @media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<g clip-path="url(#k-clip)">
  <rect width="${w}" height="${h}" fill="${C.navy}"/>
  <rect width="${w}" height="${h}" fill="url(#k-glow)"/>
  <rect x="${r1(w * 0.18)}" y="0" width="${r1(w * 0.64)}" height="1" fill="url(#k-hair)"/>
</g>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="13.5" fill="none" stroke="${C.muted}" stroke-opacity=".16"/>
<g class="k-mono k-slide" font-size="11" letter-spacing="1.6">
  <rect x="24" y="24.5" width="6" height="6" rx="1.5" fill="${C.emerald}"/>
  <text x="38" y="31" fill="${C.mint}">${esc(title)}</text>
  ${meta ? `<text x="${w - 24}" y="31" fill="${C.faint}" text-anchor="end" letter-spacing="1">${esc(meta)}</text>` : ""}
</g>
${body}
</svg>
`;
}

/* ------------------------------------------------------------------ stats */
function statsCard({ login, stats }) {
  const W = 400, H = 200;
  const items = [
    ["TOTAL STARS", stats.stars],
    ["COMMITS · 1Y", stats.commits],
    ["PULL REQUESTS", stats.prs],
    ["ISSUES", stats.issues],
    ["CONTRIBS · 1Y", stats.contributions],
    ["REPOSITORIES", stats.repos],
  ];
  const xs = [24, 148, 272];
  const ys = [94, 160];
  const cells = items
    .map(([label, value], i) => {
      const x = xs[i % 3], y = ys[Math.floor(i / 3)];
      const delay = 0.2 + i * 0.08;
      return `${roller(fmt(value), { x, y, size: 26, weight: 700, fill: C.text, cls: "k-sans", cw: 15, delay })}
<g class="k-slide" style="animation-delay:${(delay + 0.15).toFixed(2)}s">
  <text class="k-mono" x="${x}" y="${y + 18.5}" font-size="9.5" fill="${C.muted}" letter-spacing=".9">${label}</text>
</g>`;
    })
    .join("\n");
  const grid = `<g stroke="${C.muted}" stroke-opacity=".09">
  <line class="k-draw" style="animation-delay:.1s" pathLength="1" x1="24" y1="128" x2="376" y2="128"/>
  <line class="k-draw" style="animation-delay:.25s" pathLength="1" x1="136" y1="64" x2="136" y2="184"/>
  <line class="k-draw" style="animation-delay:.35s" pathLength="1" x1="260" y1="64" x2="260" y2="184"/>
</g>`;
  return card({ w: W, h: H, title: "GITHUB STATS", meta: `@${login}`, label: "GitHub Stats", body: grid + cells });
}

/* ------------------------------------------------------------------ languages */
function languagesCard({ languages }) {
  const W = 400, H = 200;
  const BX = 24, BW = 352, BY = 56, BH = 8;
  // 各言語のイメージカラー（GitHub の言語カラー）を使用
  // 紺の背景に埋もれるほど暗い色だけ、色味を保ったまま白に寄せて見えるようにする
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const visible = (hex) => {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
    let c = hex;
    for (let t = 0.08; lum(c) < 0.06 && t <= 1; t += 0.08) {
      c = "#" + [1, 3, 5].map((i) => {
        const v = parseInt(hex.slice(i, i + 2), 16);
        return Math.round(v + (255 - v) * t).toString(16).padStart(2, "0");
      }).join("");
    }
    return c;
  };
  const color = (i) => visible(languages[i].color);

  let body;
  if (!languages.length) {
    body = `<text class="k-mono k-in" x="${W / 2}" y="118" text-anchor="middle" font-size="11" fill="${C.faint}" letter-spacing="1">NO PUBLIC CODE YET</text>`;
  } else {
    let x = BX;
    const segs = languages
      .map((l, i) => {
        const w = i === languages.length - 1 ? BX + BW - x : (BW * l.pct) / 100;
        const s = `<rect class="k-grow" style="animation-delay:${(0.2 + i * 0.1).toFixed(2)}s" x="${r1(x)}" y="${BY}" width="${r1(Math.max(w, 0))}" height="${BH}" fill="${color(i)}"/>`;
        x += w;
        return s;
      })
      .join("");
    let acc = BX;
    const gaps = languages
      .slice(0, -1)
      .map((l) => {
        acc += (BW * l.pct) / 100;
        return `<rect x="${r1(acc - 1)}" y="${BY}" width="2" height="${BH}" fill="${C.navy}"/>`;
      })
      .join("");
    // バーの上を周期的に通り過ぎる光
    const sheen = `<rect x="${BX}" y="${BY}" width="70" height="${BH}" fill="url(#k-sheen)" transform="translate(-90 0)">
  <animateTransform attributeName="transform" type="translate" values="-90 0;${BW + 20} 0;${BW + 20} 0" keyTimes="0;.3;1" dur="6s" begin="1.8s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;0 0 1 1"/>
</rect>`;
    const rows = languages
      .map((l, i) => {
        const cx = i % 2 === 0 ? 24 : 212;
        const cy = 106 + Math.floor(i / 2) * 30;
        const delay = 0.45 + i * 0.08;
        return `<g class="k-slide" style="animation-delay:${delay.toFixed(2)}s">
  <rect x="${cx}" y="${cy - 8}" width="8" height="8" rx="2" fill="${color(i)}"/>
  <text class="k-sans" x="${cx + 16}" y="${cy}" font-size="13" fill="${C.soft}">${esc(l.name)}</text>
</g>
${roller(`${l.pct.toFixed(1)}%`, { x: cx + 164, y: cy, size: 11, fill: C.muted, cls: "k-mono", cw: 6.6, mono: true, anchor: "end", delay: delay + 0.1, dur: 1.2 })}`;
      })
      .join("\n");
    body = `<clipPath id="k-bar"><rect x="${BX}" y="${BY}" width="${BW}" height="${BH}" rx="4"/></clipPath>
<rect x="${BX}" y="${BY}" width="${BW}" height="${BH}" rx="4" fill="${C.muted}" fill-opacity=".1"/>
<g clip-path="url(#k-bar)">${segs}${gaps}${sheen}</g>
${rows}`;
  }
  return card({
    w: W, h: H, title: "TOP LANGUAGES", meta: "PUBLIC REPOS", label: "Top Languages", body,
    defs: `<linearGradient id="k-sheen" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>`,
    css: `.k-grow{transform-box:fill-box;transform-origin:left;animation:k-grow 1.2s cubic-bezier(.16,1,.3,1) both}
  @keyframes k-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}`,
  });
}

/* ------------------------------------------------------------------ activity */
// 単調 3 次補間（値が 0 を下回るような行き過ぎが出ない曲線）
function monotone(p) {
  const n = p.length;
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = p[i + 1][0] - p[i][0];
    m[i] = (p[i + 1][1] - p[i][1]) / dx[i];
  }
  const t = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  const segs = [];
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    segs.push([p[i], [p[i][0] + h, p[i][1] + t[i] * h], [p[i + 1][0] - h, p[i + 1][1] - t[i + 1] * h], p[i + 1]].map(([x, y]) => [r1(x), r1(y)]));
  }
  const d = `M${segs[0][0][0]} ${segs[0][0][1]}` + segs.map(([, c1, c2, e]) => ` C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${e[0]} ${e[1]}`).join("");
  return { d, segs };
}

function segLength([a, b, c, e]) {
  let L = 0, px = a[0], py = a[1];
  for (let k = 1; k <= 32; k++) {
    const s = k / 32, u = 1 - s;
    const x = u ** 3 * a[0] + 3 * u * u * s * b[0] + 3 * u * s * s * c[0] + s ** 3 * e[0];
    const y = u ** 3 * a[1] + 3 * u * u * s * b[1] + 3 * u * s * s * c[1] + s ** 3 * e[1];
    L += Math.hypot(x - px, y - py);
    px = x; py = y;
  }
  return L;
}

function niceMax(v) {
  if (v <= 4) return 4;
  const raw = v / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((s) => s >= raw);
  return step * 4;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function activityCard({ days }) {
  const W = 804, H = 260;
  const X0 = 56, X1 = W - 28, Y0 = 70, Y1 = 206;
  const RD = 0.4, RT = 2.4; // 描画開始までの待ち / 描画時間
  const vals = days.map((d) => d.contributionCount);
  const sum = vals.reduce((a, b) => a + b, 0);
  const vmax = Math.max(...vals, 0);
  const max = niceMax(vmax);
  const pts = vals.map((v, i) => [X0 + (i * (X1 - X0)) / (vals.length - 1), Y1 - (v / max) * (Y1 - Y0)]);
  const { d: line, segs } = monotone(pts);
  const area = `${line} L${X1} ${Y1} L${X0} ${Y1} Z`;

  // 左から右へ一定のイージングで描かれるよう、各点に到達する時刻と曲線上の位置を対応づける
  const xfrac = pts.map(([x]) => (x - X0) / (X1 - X0));
  const tAt = xfrac.map((f) => timeAt(f, INOUT));
  const lens = segs.map(segLength);
  const totalLen = lens.reduce((a, b) => a + b, 0);
  let acc = 0;
  const lenFrac = [0, ...lens.map((l) => (acc += l) / totalLen)];
  const keyTimes = tAt.map((t, i) => (i === 0 ? 0 : i === tAt.length - 1 ? 1 : t).toFixed(4)).join(";");
  const keyPoints = lenFrac.map((f, i) => (i === lenFrac.length - 1 ? 1 : f).toFixed(4)).join(";");

  const grid = [0, 1, 2, 3, 4]
    .map((k) => {
      const y = r1(Y1 - (k * (Y1 - Y0)) / 4);
      const lineEl = k === 0
        ? `<line class="k-draw" style="animation-delay:.1s" pathLength="1" x1="${X0}" y1="${y}" x2="${X1}" y2="${y}" stroke="${C.muted}" stroke-opacity=".18"/>`
        : `<line class="k-fade" style="animation-delay:${(0.15 + k * 0.08).toFixed(2)}s" x1="${X0}" y1="${y}" x2="${X1}" y2="${y}" stroke="${C.muted}" stroke-opacity=".08" stroke-dasharray="2 5"/>`;
      return `${lineEl}
<text class="k-fade" style="animation-delay:${(0.2 + k * 0.08).toFixed(2)}s" x="${X0 - 12}" y="${r1(y + 3.5)}" text-anchor="end">${fmt((max * k) / 4)}</text>`;
    })
    .join("\n");
  const xl = days
    .map((d, i) => {
      if (i % 5 !== 0 && i !== days.length - 1) return "";
      if (i === days.length - 1 && i % 5 !== 0 && i % 5 < 3) return "";
      const [, mm, dd] = d.date.split("-").map(Number);
      return `<text class="k-fade" style="animation-delay:${(RD + RT * tAt[i]).toFixed(2)}s" x="${r1(pts[i][0])}" y="${Y1 + 24}" text-anchor="middle">${MONTHS[mm - 1]} ${dd}</text>`;
    })
    .join("");

  const [lx, ly] = pts[pts.length - 1];
  const RW = X1 - X0 + 12;

  const body = `<g class="k-mono" font-size="10" fill="${C.faint}">
${grid}
${xl}
</g>
<g clip-path="url(#k-reveal)">
  <path d="${area}" fill="url(#k-areaG)"/>
  <path d="${line}" fill="none" stroke="url(#k-lineG)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</g>
<g fill="none" stroke-linecap="round" filter="url(#k-glowF)">
  <path d="${line}" pathLength="1" stroke="${C.mint}" stroke-width="2.2" stroke-opacity=".3" stroke-dasharray=".18 2" stroke-dashoffset=".18">
    <animate attributeName="stroke-dashoffset" values=".18;-1;-1" keyTimes="0;.55;1" dur="6s" begin="${(RD + RT + 1).toFixed(1)}s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;0 0 1 1"/>
  </path>
  <path d="${line}" pathLength="1" stroke="${C.text}" stroke-width="2.2" stroke-dasharray=".04 2" stroke-dashoffset=".04">
    <animate attributeName="stroke-dashoffset" values=".04;-1.14;-1.14" keyTimes="0;.55;1" dur="6s" begin="${(RD + RT + 1).toFixed(1)}s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;0 0 1 1"/>
  </path>
</g>
<g opacity="0" filter="url(#k-glowF)">
  <circle r="7" fill="${C.mint}" fill-opacity=".25"/>
  <circle r="2.6" fill="${C.text}"/>
  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.05;.9;1" dur="${RT}s" begin="${RD}s" fill="freeze"/>
  <animateMotion dur="${RT}s" begin="${RD}s" fill="freeze" calcMode="linear" keyTimes="${keyTimes}" keyPoints="${keyPoints}" path="${line}"/>
</g>
<g class="k-fade" style="animation-delay:${(RD + RT - 0.15).toFixed(2)}s">
  <circle cx="${r1(lx)}" cy="${r1(ly)}" r="4" fill="none" stroke="${C.cyan}" stroke-width="1.5">
    <animate attributeName="r" values="4;12" dur="2.4s" begin="${(RD + RT).toFixed(1)}s" repeatCount="indefinite"/>
    <animate attributeName="stroke-opacity" values=".7;0" dur="2.4s" begin="${(RD + RT).toFixed(1)}s" repeatCount="indefinite"/>
  </circle>
  <circle cx="${r1(lx)}" cy="${r1(ly)}" r="3.5" fill="${C.cyan}"/>
</g>`;
  return card({
    w: W, h: H, title: "CONTRIBUTION ACTIVITY", meta: `LAST 30 DAYS · ${sum} CONTRIBUTIONS`, label: "GitHub Activity Graph", body,
    defs: `<linearGradient id="k-lineG" gradientUnits="userSpaceOnUse" x1="${X0}" y1="0" x2="${X1}" y2="0">
    <stop offset="0" stop-color="${C.emerald}"/><stop offset=".6" stop-color="${C.cyan}"/><stop offset="1" stop-color="${C.mint}"/>
  </linearGradient>
  <linearGradient id="k-areaG" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${C.emerald}" stop-opacity=".28"/><stop offset="1" stop-color="${C.emerald}" stop-opacity="0"/>
  </linearGradient>
  <clipPath id="k-reveal"><rect x="${X0 - 8}" y="0" width="${RW}" height="${H}">
    <animate attributeName="width" values="12;12;${RW}" ${timed(RD, RT, INOUT)}/>
  </rect></clipPath>
  <filter id="k-glowF" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`,
  });
}

/* ------------------------------------------------------------------ main */
const data = await fetchData();
await mkdir(OUT_DIR, { recursive: true });
const out = (f) => path.join(OUT_DIR, f);

await writeFile(out("stats.svg"), statsCard(data));
await writeFile(out("languages.svg"), languagesCard(data));
await writeFile(out("activity.svg"), activityCard(data));

console.log(`Generated cards for @${data.login} → ${OUT_DIR}`);
