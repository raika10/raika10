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
const ACCENTS = [C.emerald, C.cyan, C.mint];

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
            nodes{ name stargazerCount languages(first:12,orderBy:{field:SIZE,direction:DESC}){ edges{ size node{ name } } } }
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
  for (const r of repos) {
    if (skip.has(r.name.toLowerCase())) continue;
    for (const e of r.languages.edges) {
      if (EXCLUDE_LANGS.includes(e.node.name.toLowerCase())) continue;
      bytes.set(e.node.name, (bytes.get(e.node.name) || 0) + e.size);
    }
  }
  const total = [...bytes.values()].reduce((a, b) => a + b, 0);
  const languages = [...bytes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, size]) => ({ name, pct: total ? (size / total) * 100 : 0 }));

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
  .k-in{animation:k-in .8s cubic-bezier(.2,.8,.2,1) both}
  @keyframes k-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  ${css}
  @media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<g clip-path="url(#k-clip)">
  <rect width="${w}" height="${h}" fill="${C.navy}"/>
  <rect width="${w}" height="${h}" fill="url(#k-glow)"/>
  <rect x="${r1(w * 0.18)}" y="0" width="${r1(w * 0.64)}" height="1" fill="url(#k-hair)"/>
</g>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="13.5" fill="none" stroke="${C.muted}" stroke-opacity=".16"/>
<g class="k-mono" font-size="11" letter-spacing="1.6">
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
      return `<g class="k-in" style="animation-delay:${(0.1 + i * 0.07).toFixed(2)}s">
  <text class="k-sans" x="${x}" y="${y}" font-size="26" font-weight="700" fill="${C.text}" letter-spacing="-.5">${fmt(value)}</text>
  <rect x="${x}" y="${y + 13}" width="5" height="5" rx="1.2" fill="${ACCENTS[i % 3]}"/>
  <text class="k-mono" x="${x + 11}" y="${y + 18.5}" font-size="9.5" fill="${C.muted}" letter-spacing=".9">${label}</text>
</g>`;
    })
    .join("\n");
  const grid = `<g stroke="${C.muted}" stroke-opacity=".09">
  <line x1="24" y1="128" x2="376" y2="128"/>
  <line x1="136" y1="64" x2="136" y2="184"/>
  <line x1="260" y1="64" x2="260" y2="184"/>
</g>`;
  return card({ w: W, h: H, title: "GITHUB STATS", meta: `@${login}`, label: "GitHub Stats", body: grid + cells });
}

/* ------------------------------------------------------------------ languages */
function languagesCard({ languages }) {
  const W = 400, H = 200;
  const BX = 24, BW = 352, BY = 56, BH = 8;
  const color = (i) => ACCENTS[i % 3];
  const op = (i) => (i < 3 ? 1 : 0.5);

  let body;
  if (!languages.length) {
    body = `<text class="k-mono k-in" x="${W / 2}" y="118" text-anchor="middle" font-size="11" fill="${C.faint}" letter-spacing="1">NO PUBLIC CODE YET</text>`;
  } else {
    let x = BX;
    const segs = languages
      .map((l, i) => {
        const w = i === languages.length - 1 ? BX + BW - x : (BW * l.pct) / 100;
        const s = `<rect class="k-grow" style="animation-delay:${(0.15 + i * 0.08).toFixed(2)}s" x="${r1(x)}" y="${BY}" width="${r1(Math.max(w, 0))}" height="${BH}" fill="${color(i)}" fill-opacity="${op(i)}"/>`;
        x += w;
        return s;
      })
      .join("");
    // セグメント間の細い区切り
    let acc = BX;
    const gaps = languages
      .slice(0, -1)
      .map((l) => {
        acc += (BW * l.pct) / 100;
        return `<rect x="${r1(acc - 1)}" y="${BY}" width="2" height="${BH}" fill="${C.navy}"/>`;
      })
      .join("");
    const rows = languages
      .map((l, i) => {
        const cx = i % 2 === 0 ? 24 : 212;
        const cy = 106 + Math.floor(i / 2) * 30;
        return `<g class="k-in" style="animation-delay:${(0.3 + i * 0.06).toFixed(2)}s">
  <rect x="${cx}" y="${cy - 8}" width="8" height="8" rx="2" fill="${color(i)}" fill-opacity="${op(i)}"/>
  <text class="k-sans" x="${cx + 16}" y="${cy}" font-size="13" fill="${C.soft}">${esc(l.name)}</text>
  <text class="k-mono" x="${cx + 164}" y="${cy}" font-size="11" fill="${C.muted}" text-anchor="end">${l.pct.toFixed(1)}%</text>
</g>`;
      })
      .join("\n");
    body = `<clipPath id="k-bar"><rect x="${BX}" y="${BY}" width="${BW}" height="${BH}" rx="4"/></clipPath>
<rect x="${BX}" y="${BY}" width="${BW}" height="${BH}" rx="4" fill="${C.muted}" fill-opacity=".1"/>
<g clip-path="url(#k-bar)">${segs}${gaps}</g>
${rows}`;
  }
  return card({
    w: W, h: H, title: "TOP LANGUAGES", meta: "PUBLIC REPOS", label: "Top Languages", body,
    css: `.k-grow{transform-box:fill-box;transform-origin:left;animation:k-grow 1s cubic-bezier(.2,.8,.2,1) both}
  @keyframes k-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}`,
  });
}

/* ------------------------------------------------------------------ activity */
function monotonePath(p) {
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
  let d = `M${r1(p[0][0])} ${r1(p[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${r1(p[i][0] + h)} ${r1(p[i][1] + t[i] * h)} ${r1(p[i + 1][0] - h)} ${r1(p[i + 1][1] - t[i + 1] * h)} ${r1(p[i + 1][0])} ${r1(p[i + 1][1])}`;
  }
  return d;
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
  const vals = days.map((d) => d.contributionCount);
  const sum = vals.reduce((a, b) => a + b, 0);
  const max = niceMax(Math.max(...vals, 0));
  const pts = vals.map((v, i) => [X0 + (i * (X1 - X0)) / (vals.length - 1), Y1 - (v / max) * (Y1 - Y0)]);
  const line = monotonePath(pts);
  const area = `${line} L${X1} ${Y1} L${X0} ${Y1} Z`;

  const grid = [0, 1, 2, 3, 4]
    .map((k) => {
      const y = Y1 - (k * (Y1 - Y0)) / 4;
      return `<line x1="${X0}" y1="${r1(y)}" x2="${X1}" y2="${r1(y)}" stroke="${C.muted}" stroke-opacity="${k === 0 ? 0.18 : 0.08}" ${k === 0 ? "" : 'stroke-dasharray="2 5"'}/>
<text x="${X0 - 12}" y="${r1(y + 3.5)}" text-anchor="end">${fmt((max * k) / 4)}</text>`;
    })
    .join("\n");
  const xl = days
    .map((d, i) => {
      if (i % 5 !== 0 && i !== days.length - 1) return "";
      if (i === days.length - 1 && i % 5 !== 0 && i % 5 < 3) return "";
      const [, mm, dd] = d.date.split("-").map(Number);
      return `<text x="${r1(pts[i][0])}" y="${Y1 + 24}" text-anchor="middle">${MONTHS[mm - 1]} ${dd}</text>`;
    })
    .join("");
  const [lx, ly] = pts[pts.length - 1];

  const body = `<g class="k-mono" font-size="10" fill="${C.faint}">
${grid}
${xl}
</g>
<path class="k-area" d="${area}" fill="url(#k-areaG)"/>
<path class="k-line" d="${line}" pathLength="1" fill="none" stroke="url(#k-lineG)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<g class="k-dot">
  <circle cx="${r1(lx)}" cy="${r1(ly)}" r="4" fill="none" stroke="${C.cyan}" stroke-width="1.5">
    <animate attributeName="r" values="4;12" dur="2.4s" begin="2s" repeatCount="indefinite"/>
    <animate attributeName="stroke-opacity" values=".7;0" dur="2.4s" begin="2s" repeatCount="indefinite"/>
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
  </linearGradient>`,
    css: `.k-line{stroke-dasharray:1;animation:k-draw 1.8s .2s cubic-bezier(.65,0,.35,1) both}
  .k-area{animation:k-fade 1.2s .9s ease both}
  .k-dot{animation:k-fade .6s 1.8s ease both}
  @keyframes k-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
  @keyframes k-fade{from{opacity:0}to{opacity:1}}`,
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
