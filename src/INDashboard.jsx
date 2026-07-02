import { useState, useEffect, useMemo, useRef } from "react";

/* ============================================================
   Firebase (Realtime Database, REST)
   ============================================================ */
const FIREBASE_URL = "https://indashboard-default-rtdb.firebaseio.com";

async function fbGet(path) {
  try {
    const res = await fetch(`${FIREBASE_URL}/${path}.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
async function fbSet(path, data) {
  try {
    await fetch(`${FIREBASE_URL}/${path}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return true;
  } catch {
    return false;
  }
}

/* ============================================================
   Googleログイン / Gemini連携（未設定の場合はプレースホルダー）
   以下の3つを設定すると実際に動作します：
   1. FIREBASE_WEB_API_KEY … Firebaseコンソール > プロジェクトの設定 > 「ウェブAPIキー」
      ※ Authentication > Sign-in method で「Google」を有効化しておく必要があります
   2. GOOGLE_OAUTH_CLIENT_ID … Google Cloud Console > 認証情報 > OAuth 2.0 クライアントID（ウェブ）
      ※ 承認済みのJavaScript生成元にこのアプリのURLを追加してください
   3. GEMINI_API_KEY … Google AI Studio（aistudio.google.com）で発行したAPIキー
   ============================================================ */
const FIREBASE_WEB_API_KEY = ""; // TODO
const GOOGLE_OAUTH_CLIENT_ID = ""; // TODO
const GEMINI_API_KEY = ""; // TODO

function loadGoogleIdentityScript() {
  return new Promise((resolve) => {
    if (window.google?.accounts?.id) { resolve(true); return; }
    const existing = document.getElementById("gis-script");
    if (existing) { existing.addEventListener("load", () => resolve(true)); return; }
    const s = document.createElement("script");
    s.id = "gis-script";
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

async function exchangeGoogleIdToken(idToken) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_WEB_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      postBody: `id_token=${idToken}&providerId=google.com`,
      requestUri: window.location.href,
      returnSecureToken: true,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "ログインに失敗しました");
  return { email: data.email, name: data.displayName, idToken };
}

async function generateGeminiComment(student, targetMonth) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY が未設定です");
  const monthData = student.months.find((m) => m.month === targetMonth);
  const idx = student.months.findIndex((m) => m.month === targetMonth);
  const prev = idx > 0 ? student.months[idx - 1] : null;
  const changes = prev
    ? Object.keys(monthData.定性).map((k) => `${k}: ${prev.定性[k]}→${monthData.定性[k]}点`)
    : Object.keys(monthData.定性).map((k) => `${k}: ${monthData.定性[k]}点`);
  const prompt = `あなたは学生インターンのマネジメントを支援するAIです。以下の評価データから、PMが面談前に読む簡潔なサマリーを生成してください。\n対象者：${student.name}（${monthLabel(targetMonth)}）\n評価変化：${changes.join("、")}\n営業pt: ${monthData.定量.営業pt} / KPI達成率: ${monthData.定量.KPI達成率}%\n1.全体サマリー 2.伸びている点 3.要注目点 4.面談で確認すべきこと、の順で簡潔に。`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "コメント生成に失敗しました";
}
function hexToRgba(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Googleマテリアル風のパステルテーマ：淡い背景＋やわらかいアクセントカラー
function makeTheme(name, accent, bgFrom, bgTo) {
  return {
    id: undefined,
    name,
    isLight: true,
    bgGradient: `linear-gradient(135deg, ${bgFrom} 0%, ${bgTo} 50%, ${bgFrom} 100%)`,
    bgSolid: "#ffffff",
    text: "#202124",
    accent,
    accentA: (a) => hexToRgba(accent, a),
    t: (a) => `rgba(32,33,36,${a})`,
    swatch: accent,
  };
}

const THEMES = {
  black: makeTheme("グレー", "#5F6368", "#F1F3F4", "#F8F9FA"),
  navy: makeTheme("ネイビー", "#3F51B5", "#E8EAF6", "#F2F3FA"),
  blue: makeTheme("ブルー", "#4285F4", "#EAF1FE", "#F6F9FF"),
  teal: makeTheme("ティール", "#12A4AF", "#E0F7FA", "#EFFDFE"),
  green: makeTheme("グリーン", "#34A853", "#E6F4EA", "#F1FAF3"),
  yellow: makeTheme("イエロー", "#C79100", "#FEF7E0", "#FFFBEF"),
  orange: makeTheme("オレンジ", "#E8710A", "#FEEFE3", "#FFF6EE"),
  red: makeTheme("レッド", "#EA4335", "#FDECEA", "#FFF5F4"),
  pink: makeTheme("ピンク", "#E8568C", "#FCE4EC", "#FFF0F5"),
  purple: makeTheme("パープル", "#9334E6", "#F3E8FD", "#FAF2FE"),
  white: makeTheme("ホワイト", "#1A73E8", "#FFFFFF", "#FAFAFB"),
};
Object.entries(THEMES).forEach(([id, t]) => { t.id = id; });
const THEME_ORDER = ["pink", "green", "black", "white", "blue", "yellow", "red", "purple", "orange", "teal", "navy"];

/* ============================================================
   評価項目構成（管理画面で編集可能）
   ============================================================ */
const CATEGORY_ORDER = ["稼働", "人間力", "思考力", "強み", "当たり前基準"];
const CATEGORY_COLORS = { 稼働: "#4FC3F7", 人間力: "#81C784", 思考力: "#FFB74D", 強み: "#F06292", 当たり前基準: "#CE93D8" };

const DEFAULT_SUBITEMS = {
  稼働: [
    { key: "pdca", label: "PDCAを回せている", max: 10 },
    { key: "mirarekata", label: "見られ方の意識を持っている", max: 10 },
    { key: "senmon", label: "専門知識の補填を日々行えている", max: 10 },
    { key: "seichou", label: "成長機会を自ら取りに行っている", max: 10 },
    { key: "houren", label: "報連相を使えている", max: 10 },
    { key: "suuji", label: "数字への意識を持てている", max: 10 },
  ],
  人間力: [
    { key: "tasha", label: "他者視点を持てている", max: 20 },
    { key: "jiseki", label: "自責にできている", max: 20 },
    { key: "sekinin", label: "自身のパフォーマンス向上への責任を持てている", max: 20 },
    { key: "mokuteki", label: "目的（目標）に対して主体的であるか", max: 20 },
  ],
  思考力: [
    { key: "rikai", label: "目的を理解できる", max: 10 },
    { key: "naze", label: "なぜの深堀ができる", max: 10 },
    { key: "chuusho", label: "抽象化ができる", max: 10 },
    { key: "gutaika", label: "具体化ができる", max: 10 },
    { key: "jikan", label: "思考時間を設けられている", max: 10 },
  ],
  強み: [
    { key: "gengo", label: "強みを言語化できる", max: 20 },
    { key: "seika", label: "強みを活かして成果を生み出せている", max: 20 },
    { key: "koken", label: "強みを活かしてチームに貢献できている", max: 20 },
    { key: "yowami", label: "弱みを対策できている", max: 20 },
  ],
  当たり前基準: [
    { key: "jikan2", label: "時間を守れている", max: 10 },
    { key: "furumai", label: "適切な立ち振る舞いができている", max: 10 },
    { key: "yakusoku", label: "約束・納期を守れる", max: 10 },
  ],
};

function categoryMax(subitemsConfig, cat) {
  return (subitemsConfig[cat] || []).reduce((a, s) => a + Number(s.max || 0), 0);
}
function totalMax(subitemsConfig) {
  return CATEGORY_ORDER.reduce((a, c) => a + categoryMax(subitemsConfig, c), 0);
}

/* 評価項目は「適用開始月」ごとに履歴管理する。
   ある月の表示・採点には、その月以前で一番新しい設定を使う。
   → 7月に項目を変更しても、6月のデータ・表示には影響しない。 */
function getConfigForMonth(history, month) {
  const keys = Object.keys(history).sort();
  if (!keys.length) return DEFAULT_SUBITEMS;
  let chosen = keys[0];
  for (const k of keys) {
    if (k <= month) chosen = k;
    else break;
  }
  return history[chosen] || DEFAULT_SUBITEMS;
}
function catMaxFor(history, month, cat) {
  return categoryMax(getConfigForMonth(history, month), cat);
}
function totalMaxFor(history, month) {
  return totalMax(getConfigForMonth(history, month));
}

/* ============================================================
   モックデータ（既存運用データ。サブ項目の内訳は持たない月もある）
   ============================================================ */
const MOCK_STUDENTS = [
  {
    id: "1",
    name: "山田 太郎",
    status: "active",
    months: [
      { month: "2025-01", 定性: { 稼働: 37, 人間力: 50, 思考力: 36, 強み: 60, 当たり前基準: 19 }, 定量: { 営業pt: 40.0, KPI達成率: 25.0 } },
      { month: "2025-02", 定性: { 稼働: 40, 人間力: 55, 思考力: 38, 強み: 63, 当たり前基準: 21 }, 定量: { 営業pt: 43.5, KPI達成率: 28.0 } },
      { month: "2025-03", 定性: { 稼働: 44, 人間力: 58, 思考力: 40, 強み: 67, 当たり前基準: 24 }, 定量: { 営業pt: 47.0, KPI達成率: 32.0 } },
      { month: "2025-04", 定性: { 稼働: 47, 人間力: 62, 思考力: 42, 強み: 70, 当たり前基準: 26 }, 定量: { 営業pt: 50.2, KPI達成率: 35.5 } },
    ],
  },
  {
    id: "2",
    name: "鈴木 花子",
    status: "active",
    months: [
      { month: "2025-01", 定性: { 稼働: 30, 人間力: 45, 思考力: 30, 強み: 50, 当たり前基準: 15 }, 定量: { 営業pt: 32.0, KPI達成率: 18.0 } },
      { month: "2025-02", 定性: { 稼働: 33, 人間力: 48, 思考力: 33, 強み: 54, 当たり前基準: 18 }, 定量: { 営業pt: 35.0, KPI達成率: 22.0 } },
      { month: "2025-03", 定性: { 稼働: 38, 人間力: 52, 思考力: 37, 強み: 58, 当たり前基準: 20 }, 定量: { 営業pt: 38.5, KPI達成率: 26.0 } },
    ],
  },
  {
    id: "3",
    name: "田中 健太",
    status: "active",
    months: [
      { month: "2025-02", 定性: { 稼働: 28, 人間力: 40, 思考力: 28, 強み: 45, 当たり前基準: 14 }, 定量: { 営業pt: 28.0, KPI達成率: 15.0 } },
      { month: "2025-03", 定性: { 稼働: 35, 人間力: 50, 思考力: 35, 強み: 55, 当たり前基準: 18 }, 定量: { 営業pt: 36.0, KPI達成率: 22.0 } },
      { month: "2025-04", 定性: { 稼働: 42, 人間力: 58, 思考力: 40, 強み: 62, 当たり前基準: 22 }, 定量: { 営業pt: 44.0, KPI達成率: 30.0 } },
    ],
  },
];

const MONTH_LABELS_BASE = {};
for (let m = 1; m <= 12; m++) MONTH_LABELS_BASE[String(m).padStart(2, "0")] = `${m}月`;
function monthLabel(ym) {
  if (!ym) return "";
  const mm = ym.split("-")[1];
  return MONTH_LABELS_BASE[mm] || ym;
}

function getAllMonths(students) {
  const set = new Set();
  students.forEach((s) => s.months.forEach((m) => set.add(m.month)));
  return Array.from(set).sort();
}
function getAllYears(students) {
  const set = new Set();
  students.forEach((s) => s.months.forEach((m) => set.add(m.month.slice(0, 4))));
  return Array.from(set).sort();
}
function totalScore(monthData) {
  return Object.values(monthData.定性).reduce((a, b) => a + b, 0);
}

const _now = new Date();
const REAL_TODAY_YEAR = String(_now.getFullYear());
const REAL_TODAY_YM = `${REAL_TODAY_YEAR}-${String(_now.getMonth() + 1).padStart(2, "0")}`;

function pickDefaultYear(years) {
  if (!years.length) return REAL_TODAY_YEAR;
  return years.includes(REAL_TODAY_YEAR) ? REAL_TODAY_YEAR : years[years.length - 1];
}
function pickDefaultMonth(allMonths, year) {
  const inYear = allMonths.filter((m) => m.startsWith(year));
  if (inYear.includes(REAL_TODAY_YM)) return REAL_TODAY_YM;
  if (inYear.length) return inYear[inYear.length - 1];
  return allMonths[allMonths.length - 1] || REAL_TODAY_YM;
}

// 在籍期間が長い人（データ記入開始月が古い人）が上に来るように並べる
function firstMonthOf(student) {
  if (!student.months.length) return "9999-99";
  return student.months.reduce((min, m) => (m.month < min ? m.month : min), student.months[0].month);
}
function sortByTenure(students) {
  return [...students].sort((a, b) => firstMonthOf(a).localeCompare(firstMonthOf(b)));
}
function isActive(student) {
  return (student.status || "active") !== "archived";
}

// Firebaseの students は「配列」または「ランダムキーで各メンバーを持つオブジェクト」の
// どちらの形式でも読み込めるようにする（既存の別システムのデータ形式にも対応）
// months も「配列」「ランダムキー付きオブジェクト」どちらの形式でも対応
function normalizeMonths(rawMonths) {
  if (!rawMonths) return [];
  if (Array.isArray(rawMonths)) return rawMonths.filter(Boolean);
  if (typeof rawMonths === "object") {
    return Object.entries(rawMonths)
      .map(([key, val]) => (val && typeof val === "object" ? { ...val, month: val.month || key } : null))
      .filter(Boolean);
  }
  return [];
}

function normalizeStudentsData(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter(Boolean).map((s, i) => ({ ...s, id: s.id || String(i + 1), months: normalizeMonths(s.months) }));
  }
  if (typeof raw === "object") {
    return Object.entries(raw).map(([key, val]) => ({ ...val, id: val.id || key, months: normalizeMonths(val.months) }));
  }
  return [];
}
// 保存する際は、元がオブジェクト形式だった場合の互換性も考え、
// id をキーにしたオブジェクト形式で書き込む（他システムからの参照にも安全）
function studentsToFirebaseShape(students) {
  const obj = {};
  students.forEach((s) => { obj[s.id] = s; });
  return obj;
}

/* ============================================================
   AI分析
   ============================================================ */
async function generateAIComment(student, targetMonth) {
  const monthData = student.months.find((m) => m.month === targetMonth);
  const idx = student.months.findIndex((m) => m.month === targetMonth);
  const prev = idx > 0 ? student.months[idx - 1] : null;

  const changes = prev
    ? Object.keys(monthData.定性).map((k) => {
        const diff = monthData.定性[k] - prev.定性[k];
        const pct = ((diff / prev.定性[k]) * 100).toFixed(1);
        return `${k}: ${prev.定性[k]}→${monthData.定性[k]}点 (${diff >= 0 ? "+" : ""}${pct}%)`;
      })
    : Object.keys(monthData.定性).map((k) => `${k}: ${monthData.定性[k]}点`);

  const prompt = `あなたは学生インターンのマネジメントを支援するAIです。
以下のIN（インターン生）の評価データを分析し、PMが面談前に読む簡潔なサマリーを生成してください。

【対象者】${student.name}（${monthLabel(targetMonth)}）
【評価変化（先月比）】
${changes.join("\n")}
【定量評価】
営業pt: ${monthData.定量.営業pt} / KPI達成率: ${monthData.定量.KPI達成率}%

出力形式：
1. 全体サマリー（2〜3文）
2. 伸びている点（箇条書き1〜2点）
3. 要注目・改善点（箇条書き1〜2点）
4. 面談で確認すべきこと（1文）

簡潔・具体的に。マネジメント視点で。`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  return data.content?.map((b) => b.text || "").join("") || "コメント生成に失敗しました";
}

/* ============================================================
   小さいUIパーツ
   ============================================================ */
function MiniLineChart({ student }) {
  const w = 80, h = 32, pad = 4;
  const vals = student.months.map((m) => totalScore(m));
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const xs = vals.map((_, i) => pad + (i / (vals.length - 1 || 1)) * (w - pad * 2));
  const ys = vals.map((v) => pad + (1 - (v - min) / range) * (h - pad * 2));
  const path = vals.map((_, i) => `${i === 0 ? "M" : "L"} ${xs[i]} ${ys[i]}`).join(" ");
  const last = vals[vals.length - 1];
  const prev = vals[vals.length - 2];
  const trend = prev !== undefined ? last - prev : 0;
  const color = trend > 0 ? "#81C784" : trend < 0 ? "#F06292" : "#4FC3F7";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <svg width={w} height={h}>
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="2.5" fill={color} />
      </svg>
      <span style={{ fontSize: "16px", color, fontFamily: "monospace" }}>{trend > 0 ? `+${trend}` : trend}</span>
    </div>
  );
}

function RankingChart({ students, selectedMonth, mode, theme, maxScore }) {
  const data = students
    .map((s) => {
      const idx = s.months.findIndex((m) => m.month === selectedMonth);
      const m = idx >= 0 ? s.months[idx] : null;
      const prev = idx > 0 ? s.months[idx - 1] : null;
      if (!m) return null;
      const score = totalScore(m);
      const prevScore = prev ? totalScore(prev) : null;
      const diff = prevScore !== null ? score - prevScore : null;
      return { name: s.name, score, diff, pct: Math.round((score / maxScore) * 100) };
    })
    .filter(Boolean);

  if (mode === "gain") {
    const ranked = data.filter((d) => d.diff !== null).sort((a, b) => b.diff - a.diff);
    const maxAbs = Math.max(1, ...ranked.map((d) => Math.abs(d.diff)));
    return (
      <div>
        {ranked.length === 0 && (
          <div style={{ fontSize: "16px", color: theme.t(0.4), padding: "12px 0" }}>前月データがないため上昇値を表示できません</div>
        )}
        {ranked.map((d, i) => {
          const pct = Math.round((Math.abs(d.diff) / maxAbs) * 100);
          const positive = d.diff >= 0;
          return (
            <div key={i} style={{ marginBottom: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                <div style={{ fontSize: "13px", fontWeight: "500" }}>
                  <span style={{ color: theme.t(0.35), fontFamily: "monospace", marginRight: "8px" }}>{i + 1}</span>
                  {d.name}
                </div>
                <span style={{ fontSize: "13px", fontFamily: "monospace", color: positive ? "#81C784" : "#F06292" }}>
                  {positive ? `+${d.diff}` : d.diff}
                </span>
              </div>
              <div style={{ height: "6px", background: theme.t(0.08), borderRadius: "3px" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: positive ? "linear-gradient(90deg, #4FC3F7, #81C784)" : "linear-gradient(90deg, #F06292, #FF8A65)", borderRadius: "3px", transition: "width 0.5s" }} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const ranked = [...data].sort((a, b) => b.score - a.score);
  return (
    <div>
      {ranked.map((d, i) => (
        <div key={i} style={{ marginBottom: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
            <div style={{ fontSize: "13px", fontWeight: "500" }}>
              <span style={{ color: theme.t(0.35), fontFamily: "monospace", marginRight: "8px" }}>{i + 1}</span>
              {d.name}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {d.diff !== null && (
                <span style={{ fontSize: "13px", color: d.diff > 0 ? "#81C784" : d.diff < 0 ? "#F06292" : theme.t(0.3), fontFamily: "monospace" }}>
                  {d.diff > 0 ? `+${d.diff}` : d.diff}
                </span>
              )}
              <span style={{ fontSize: "13px", fontFamily: "monospace", color: theme.accent }}>
                {d.score}
                <span style={{ fontSize: "16px", color: theme.t(0.4) }}>/{maxScore}</span>
              </span>
            </div>
          </div>
          <div style={{ height: "6px", background: theme.t(0.08), borderRadius: "3px" }}>
            <div style={{ width: `${d.pct}%`, height: "100%", background: `linear-gradient(90deg, ${theme.accent}, #81C784)`, borderRadius: "3px", transition: "width 0.5s" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RadarChart({ data, size = 180, subitemsConfig, theme }) {
  const categories = CATEGORY_ORDER;
  const n = categories.length;
  const cx = size / 2, cy = size / 2, r = size * 0.36;
  const getPoint = (i, val, max, radius) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: cx + Math.cos(angle) * radius * (val / max), y: cy + Math.sin(angle) * radius * (val / max) };
  };
  return (
    <svg width={size} height={size} style={{ overflow: "visible" }}>
      {[0.25, 0.5, 0.75, 1.0].map((level) => {
        const pts = categories.map((_, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
          return `${cx + Math.cos(angle) * r * level},${cy + Math.sin(angle) * r * level}`;
        });
        return <polygon key={level} points={pts.join(" ")} fill="none" stroke={theme.t(0.1)} strokeWidth="1" />;
      })}
      {categories.map((_, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        return <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(angle) * r} y2={cy + Math.sin(angle) * r} stroke={theme.t(0.12)} strokeWidth="1" />;
      })}
      {data.map((monthData, mi) => {
        const pts = categories.map((cat, i) => getPoint(i, monthData.定性[cat] || 0, categoryMax(subitemsConfig, cat), r));
        const color = mi === data.length - 1 ? theme.accent : "#ffffff";
        return <polygon key={mi} points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill={color} fillOpacity={mi === data.length - 1 ? 0.3 : 0.05} stroke={color} strokeOpacity={mi === data.length - 1 ? 1 : 0.3} strokeWidth={mi === data.length - 1 ? 2 : 1} />;
      })}
      {categories.map((cat, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        return <text key={cat} x={cx + Math.cos(angle) * (r + 20)} y={cy + Math.sin(angle) * (r + 20)} textAnchor="middle" dominantBaseline="middle" fill={CATEGORY_COLORS[cat]} fontSize="13" fontWeight="700">{cat}</text>;
      })}
    </svg>
  );
}

/* ============================================================
   テーマ選択ピッカー
   ============================================================ */
function ThemePicker({ themeId, onChange, theme }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 12px", background: theme.t(0.04), border: `1px solid ${theme.t(0.1)}`, borderRadius: "6px", color: theme.text, cursor: "pointer", fontSize: "16px", fontFamily: "'Noto Sans JP', sans-serif" }}>
        <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: THEMES[themeId].swatch, border: `1px solid ${theme.t(0.25)}`, display: "inline-block" }} />
        テーマ：{THEMES[themeId].name}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: theme.bgSolid, border: `1px solid ${theme.t(0.12)}`, borderRadius: "10px", padding: "10px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
          {THEME_ORDER.map((id) => (
            <button key={id} onClick={() => { onChange(id); setOpen(false); }} title={THEMES[id].name} style={{ width: "44px", height: "44px", borderRadius: "10px", border: id === themeId ? `2px solid ${theme.accent}` : `1px solid ${theme.t(0.15)}`, background: THEMES[id].bgGradient, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ width: "16px", height: "16px", borderRadius: "50%", background: THEMES[id].swatch, border: "1px solid rgba(0,0,0,0.2)" }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   管理者ログイン（Google）— 設定が未完了の間はお知らせを表示
   ============================================================ */
function AdminLogin({ adminUser, onLogin, onLogout, theme }) {
  const btnRef = useRef(null);
  const [ready, setReady] = useState(false);
  const configured = !!(GOOGLE_OAUTH_CLIENT_ID && FIREBASE_WEB_API_KEY);

  useEffect(() => {
    if (!configured || adminUser) return;
    let cancelled = false;
    loadGoogleIdentityScript().then((ok) => {
      if (cancelled || !ok || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        callback: async (resp) => {
          try {
            const user = await exchangeGoogleIdToken(resp.credential);
            onLogin(user);
          } catch (e) {
            alert("ログインに失敗しました：" + e.message);
          }
        },
      });
      if (btnRef.current) window.google.accounts.id.renderButton(btnRef.current, { theme: "outline", size: "medium" });
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [configured, adminUser]);

  return (
    <div style={{ border: `1px solid ${theme.accentA(0.25)}`, background: theme.accentA(0.05), borderRadius: "10px", padding: "14px", marginBottom: "18px" }}>
      <div style={{ fontSize: "13px", color: theme.t(0.5), letterSpacing: "1px", marginBottom: "10px" }}>管理者ログイン</div>
      {adminUser ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "16px", color: theme.text }}>{adminUser.name || adminUser.email} としてログイン中</span>
          <button onClick={onLogout} style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${theme.t(0.2)}`, borderRadius: "6px", color: theme.t(0.5), cursor: "pointer", fontSize: "13px" }}>ログアウト</button>
        </div>
      ) : configured ? (
        <div ref={btnRef} />
      ) : (
        <div style={{ fontSize: "13px", color: theme.t(0.45), lineHeight: "1.6" }}>
          Googleログインは準備中です（FIREBASE_WEB_API_KEY / GOOGLE_OAUTH_CLIENT_ID の設定が必要）。設定が完了するまでは、ログインなしで編集できます。
        </div>
      )}
    </div>
  );
}

/* ============================================================
   管理画面（評価項目の編集）
   ============================================================ */
function AdminModal({ configHistory, onSave, onClose, theme }) {
  const [adminUser, setAdminUser] = useState(null);
  const historyKeys = Object.keys(configHistory).sort();
  const latestKey = historyKeys[historyKeys.length - 1];
  const today = new Date();
  const defaultEffective = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const [baseKey, setBaseKey] = useState(latestKey);
  const [effective, setEffective] = useState(defaultEffective);
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(configHistory[latestKey] || DEFAULT_SUBITEMS)));
  const [saving, setSaving] = useState(false);

  function loadBase(key) {
    setBaseKey(key);
    setDraft(JSON.parse(JSON.stringify(configHistory[key] || DEFAULT_SUBITEMS)));
  }
  function updateItem(cat, idx, field, value) {
    setDraft((d) => ({ ...d, [cat]: d[cat].map((it, i) => (i === idx ? { ...it, [field]: field === "max" ? Number(value) || 0 : value } : it)) }));
  }
  function addItem(cat) {
    setDraft((d) => ({ ...d, [cat]: [...d[cat], { key: `item_${Date.now()}`, label: "新しい項目", max: 10 }] }));
  }
  function removeItem(cat, idx) {
    setDraft((d) => ({ ...d, [cat]: d[cat].filter((_, i) => i !== idx) }));
  }
  async function handleSave() {
    if (!effective) return;
    setSaving(true);
    const nextHistory = { ...configHistory, [effective]: draft };
    await fbSet("config/history", nextHistory);
    onSave(nextHistory);
    setSaving(false);
    onClose();
  }

  const isNewVersion = !configHistory[effective];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ background: theme.bgSolid, border: `1px solid ${theme.t(0.12)}`, borderRadius: "14px", width: "min(720px, 100%)", maxHeight: "88vh", overflowY: "auto", padding: "24px", color: theme.text }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
          <div style={{ fontSize: "20px", fontWeight: "700" }}>管理画面 — 評価項目の編集</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: theme.t(0.5), fontSize: "16px", cursor: "pointer" }}>×</button>
        </div>

        <AdminLogin adminUser={adminUser} onLogin={setAdminUser} onLogout={() => setAdminUser(null)} theme={theme} />

        <div style={{ fontSize: "16px", color: theme.t(0.45), marginBottom: "16px" }}>
          評価項目を変更すると「適用開始月」以降の月にのみ反映されます。それより前の月のデータ・表示は変更されません。
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px", background: theme.accentA(0.06), border: `1px solid ${theme.accentA(0.2)}`, borderRadius: "10px", padding: "14px" }}>
          <div>
            <div style={{ fontSize: "13px", color: theme.t(0.5), marginBottom: "6px" }}>ベース</div>
            <select value={baseKey} onChange={(e) => loadBase(e.target.value)} style={{ width: "100%", padding: "8px 10px", background: theme.t(0.04), border: `1px solid ${theme.t(0.15)}`, borderRadius: "6px", color: theme.text, fontSize: "16px" }}>
              {historyKeys.map((k) => <option key={k} value={k}>{k.split("-")[0]}年{monthLabel(k)}〜 の設定</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: "13px", color: theme.t(0.5), marginBottom: "6px" }}>変更適用月</div>
            <input type="month" value={effective} onChange={(e) => setEffective(e.target.value)} style={{ width: "100%", padding: "8px 10px", background: theme.t(0.04), border: `1px solid ${theme.t(0.15)}`, borderRadius: "6px", color: theme.text, fontSize: "16px", colorScheme: "light" }} />
          </div>
        </div>
        <div style={{ fontSize: "13px", color: isNewVersion ? "#34A853" : "#E8710A", marginBottom: "16px" }}>
          {isNewVersion ? `※ ${effective.split("-")[0]}年${monthLabel(effective)}以降に適用される新しい設定として保存されます` : `※ 既存の${effective.split("-")[0]}年${monthLabel(effective)}〜の設定を上書きします`}
        </div>

        {CATEGORY_ORDER.map((cat) => {
          const items = draft[cat] || [];
          const max = items.reduce((a, it) => a + Number(it.max || 0), 0);
          return (
            <div key={cat} style={{ marginBottom: "20px", border: `1px solid ${theme.t(0.08)}`, borderRadius: "10px", padding: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <div style={{ fontSize: "13px", fontWeight: "600", color: CATEGORY_COLORS[cat] }}>{cat}</div>
                <div style={{ fontSize: "16px", fontFamily: "monospace", color: theme.t(0.4) }}>満点合計：{max}</div>
              </div>
              {items.map((it, idx) => (
                <div key={it.key} style={{ display: "flex", gap: "8px", marginBottom: "8px", alignItems: "center" }}>
                  <input value={it.label} onChange={(e) => updateItem(cat, idx, "label", e.target.value)} style={{ flex: 1, padding: "8px 10px", background: theme.t(0.04), border: `1px solid ${theme.t(0.12)}`, borderRadius: "6px", color: theme.text, fontSize: "16px" }} />
                  <input type="number" value={it.max} onChange={(e) => updateItem(cat, idx, "max", e.target.value)} style={{ width: "70px", padding: "8px 10px", background: theme.t(0.04), border: `1px solid ${theme.t(0.12)}`, borderRadius: "6px", color: theme.text, fontSize: "16px" }} />
                  <button onClick={() => removeItem(cat, idx)} style={{ background: "transparent", border: "none", color: "#EA4335", cursor: "pointer", fontSize: "16px", padding: "4px" }}>×</button>
                </div>
              ))}
              <button onClick={() => addItem(cat)} style={{ marginTop: "4px", padding: "6px 12px", background: theme.t(0.04), border: `1px solid ${theme.t(0.12)}`, borderRadius: "6px", color: theme.accent, cursor: "pointer", fontSize: "13px" }}>+ 項目追加</button>
            </div>
          );
        })}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
          <button onClick={onClose} style={{ padding: "10px 18px", background: "transparent", border: `1px solid ${theme.t(0.15)}`, borderRadius: "8px", color: theme.t(0.6), cursor: "pointer", fontSize: "13px" }}>キャンセル</button>
          <button onClick={handleSave} disabled={saving || !effective} style={{ padding: "10px 18px", background: theme.accentA(0.18), border: `1px solid ${theme.accentA(0.5)}`, borderRadius: "8px", color: theme.accent, cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>{saving ? "保存中..." : "保存する"}</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   カテゴリ別スコア：アコーディオン（大項目で開閉、小項目を表示）
   ============================================================ */
function CategoryAccordion({ monthData, prevData, configForMonth, theme }) {
  const [openCats, setOpenCats] = useState(new Set());

  function toggle(cat) {
    setOpenCats((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  return (
    <div>
      <div style={{ fontSize: "13px", color: theme.t(0.4), marginBottom: "12px" }}>カテゴリ別スコア</div>
      {CATEGORY_ORDER.map((cat) => {
        const val = monthData.定性[cat] || 0;
        const max = categoryMax(configForMonth, cat);
        const diff = prevData ? val - (prevData.定性[cat] || 0) : null;
        const pct = Math.round((val / max) * 100);
        const isOpen = openCats.has(cat);
        const items = configForMonth[cat] || [];
        const detail = monthData.定性詳細?.[cat];
        const comment = monthData.定性コメント?.[cat];

        return (
          <div key={cat} style={{ border: `1px solid ${theme.t(0.08)}`, borderRadius: "12px", overflow: "hidden", marginBottom: "10px" }}>
            {/* 大項目ヘッダー（タップで開閉） */}
            <div onClick={() => toggle(cat)} style={{ padding: "13px 16px", cursor: "pointer", background: theme.t(0.03), display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "15px", fontWeight: "600", color: CATEGORY_COLORS[cat], minWidth: "90px" }}>{cat}</span>
              <div style={{ flex: 1, height: "8px", background: theme.t(0.08), borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: CATEGORY_COLORS[cat], borderRadius: "4px", transition: "width 0.4s" }} />
              </div>
              {diff !== null && (
                <span style={{ fontSize: "13px", fontFamily: "monospace", color: diff > 0 ? "#34A853" : diff < 0 ? "#F06292" : theme.t(0.3), minWidth: "28px", textAlign: "right" }}>
                  {diff > 0 ? `+${diff}` : diff === 0 ? "±0" : diff}
                </span>
              )}
              <span style={{ fontSize: "18px", fontWeight: "700", fontFamily: "monospace", minWidth: "60px", textAlign: "right" }}>
                {val}<span style={{ fontSize: "12px", fontWeight: "400", color: theme.t(0.35) }}>/{max}</span>
              </span>
              <span style={{ fontSize: "12px", color: theme.t(0.35) }}>{isOpen ? "▲" : "▼"}</span>
            </div>

            {/* 小項目（展開時のみ表示） */}
            {isOpen && (
              <div style={{ background: theme.t(0.015), borderTop: `1px solid ${theme.t(0.07)}`, padding: "12px 16px" }}>
                {items.length > 0 ? items.map((item) => {
                  const v = detail?.[item.key] !== undefined ? Number(detail[item.key]) : null;
                  const iPct = v !== null ? Math.round((v / item.max) * 100) : 0;
                  return (
                    <div key={item.key} style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                      <span style={{ fontSize: "13px", color: theme.t(0.6), flex: 1 }}>{item.label}</span>
                      <div style={{ width: "100px", height: "6px", background: theme.t(0.08), borderRadius: "3px", flexShrink: 0 }}>
                        {v !== null && <div style={{ width: `${iPct}%`, height: "100%", background: CATEGORY_COLORS[cat], borderRadius: "3px" }} />}
                      </div>
                      <span style={{ fontSize: "13px", fontFamily: "monospace", color: theme.text, minWidth: "42px", textAlign: "right" }}>
                        {v !== null ? `${v}/${item.max}` : `—/${item.max}`}
                      </span>
                    </div>
                  );
                }) : (
                  <div style={{ fontSize: "13px", color: theme.t(0.35) }}>小項目データなし</div>
                )}
                {comment && (
                  <div style={{ fontSize: "13px", color: theme.t(0.5), marginTop: "6px", padding: "8px 10px", background: theme.t(0.03), borderRadius: "6px" }}>
                    {comment}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   評価項目の入力行（スライダー方式）
   ============================================================ */
function SliderRow({ label, max, value, onChange, theme }) {
  const v = value === "" || value === undefined ? 0 : Number(value);
  return (
    <div style={{ marginBottom: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
        <span style={{ fontSize: "13px", color: theme.t(0.65) }}>{label}</span>
        <span style={{ fontSize: "13px", fontWeight: "600", color: theme.text, fontFamily: "monospace" }}>{v} / {max}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={v}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "40%", accentColor: theme.accent }}
        />
      </div>
    </div>
  );
}

/* ============================================================
   データ入力モーダル（3ステップ）
   ============================================================ */
function DataInputModal({ students, configHistory, onClose, onSave, theme }) {
  const [step, setStep] = useState(1);
  const [studentId, setStudentId] = useState(students[0]?.id || "");
  const [newStudentName, setNewStudentName] = useState("");
  const [month, setMonth] = useState("");
  const [subVals, setSubVals] = useState({}); // { category: { key: value } }
  const [catComments, setCatComments] = useState({}); // { category: text }
  const [quant, setQuant] = useState({ 営業pt: "", KPI達成率: "" });

  const isNewStudent = studentId === "__new__";
  const fallbackKey = Object.keys(configHistory).sort().slice(-1)[0];
  const subitemsConfig = useMemo(() => getConfigForMonth(configHistory, month || fallbackKey), [configHistory, month, fallbackKey]);

  function setSub(cat, key, val) {
    setSubVals((s) => ({ ...s, [cat]: { ...(s[cat] || {}), [key]: val === "" ? "" : Number(val) } }));
  }
  function catSubtotal(cat) {
    const items = subitemsConfig[cat] || [];
    return items.reduce((a, it) => a + (Number(subVals[cat]?.[it.key]) || 0), 0);
  }

  const canNextStep1 = month && (isNewStudent ? newStudentName.trim() : studentId);

  async function handleSubmit() {
    const 定性 = {};
    CATEGORY_ORDER.forEach((cat) => { 定性[cat] = catSubtotal(cat); });
    const 定性詳細 = JSON.parse(JSON.stringify(subVals));
    const 定性コメント = { ...catComments };
    const 定量 = { 営業pt: Number(quant.営業pt) || 0, KPI達成率: Number(quant.KPI達成率) || 0 };

    let baseStudents = students;
    let targetId = studentId;
    if (isNewStudent) {
      targetId = `s_${Date.now()}`;
      baseStudents = [...students, { id: targetId, name: newStudentName.trim(), status: "active", months: [] }];
    }

    const updated = baseStudents.map((s) => {
      if (s.id !== targetId) return s;
      const exists = s.months.find((m) => m.month === month);
      let months;
      if (exists) {
        months = s.months.map((m) => (m.month === month ? { ...m, 定性, 定性詳細, 定性コメント, 定量 } : m));
      } else {
        months = [...s.months, { month, 定性, 定性詳細, 定性コメント, 定量 }];
      }
      months.sort((a, b) => a.month.localeCompare(b.month));
      return { ...s, months };
    });

    await fbSet("students", studentsToFirebaseShape(updated));
    onSave(updated);
    onClose();
  }

  const selectedStudent = isNewStudent ? { name: newStudentName.trim() || "（新規）" } : students.find((s) => s.id === studentId);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ background: theme.bgSolid, border: `1px solid ${theme.t(0.12)}`, borderRadius: "14px", width: "min(640px, 100%)", maxHeight: "88vh", overflowY: "auto", padding: "28px", color: theme.text }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <div style={{ fontSize: "20px", fontWeight: "700" }}>データ入力</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: theme.t(0.5), fontSize: "16px", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontSize: "16px", color: theme.accent, letterSpacing: "1px", marginBottom: "22px" }}>STEP {step} / 3 — {step === 1 ? "対象者・対象月" : step === 2 ? "定性評価" : "定量評価・確認"}</div>

        {step === 1 && (
          <div>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "16px", color: theme.t(0.5), marginBottom: "6px" }}>対象者</div>
              <select value={studentId} onChange={(e) => setStudentId(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: theme.t(0.04), border: `1px solid ${theme.t(0.15)}`, borderRadius: "8px", color: theme.text, fontSize: "13px" }}>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value="__new__">＋ 新規IN追加</option>
              </select>
              {isNewStudent && (
                <input
                  autoFocus
                  placeholder="新しいメンバーの名前"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  style={{ width: "100%", marginTop: "8px", padding: "10px 12px", background: theme.accentA(0.06), border: `1px solid ${theme.accentA(0.4)}`, borderRadius: "8px", color: theme.text, fontSize: "13px" }}
                />
              )}
            </div>
            <div>
              <div style={{ fontSize: "16px", color: theme.t(0.5), marginBottom: "6px" }}>対象月</div>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: theme.t(0.04), border: `1px solid ${theme.t(0.15)}`, borderRadius: "8px", color: theme.text, fontSize: "13px", colorScheme: theme.isLight ? "light" : "dark" }} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            {CATEGORY_ORDER.map((cat) => {
              const items = subitemsConfig[cat] || [];
              const max = categoryMax(subitemsConfig, cat);
              const subtotal = catSubtotal(cat);
              return (
                <div key={cat} style={{ marginBottom: "18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ fontSize: "13px", fontWeight: "600", color: CATEGORY_COLORS[cat] }}>{cat}（/{max}点）</div>
                    <div style={{ fontSize: "16px", fontFamily: "monospace", color: theme.t(0.4) }}>小計：{subtotal}</div>
                  </div>
                  {items.map((it) => (
                    <SliderRow key={it.key} label={it.label} max={it.max} value={subVals[cat]?.[it.key]} onChange={(v) => setSub(cat, it.key, v)} theme={theme} />
                  ))}
                  <textarea placeholder="コメント（任意）" value={catComments[cat] || ""} onChange={(e) => setCatComments((c) => ({ ...c, [cat]: e.target.value }))} style={{ width: "100%", marginTop: "6px", padding: "8px 10px", background: theme.t(0.03), border: `1px solid ${theme.t(0.1)}`, borderRadius: "6px", color: theme.text, fontSize: "16px", minHeight: "36px", fontFamily: "inherit", resize: "vertical" }} />
                </div>
              );
            })}
          </div>
        )}

        {step === 3 && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
              <div>
                <div style={{ fontSize: "16px", color: theme.t(0.5), marginBottom: "6px" }}>営業pt</div>
                <input type="number" value={quant.営業pt} onChange={(e) => setQuant((q) => ({ ...q, 営業pt: e.target.value }))} style={{ width: "100%", padding: "10px 12px", background: theme.t(0.04), border: `1px solid ${theme.t(0.15)}`, borderRadius: "8px", color: theme.text, fontSize: "13px" }} />
              </div>
              <div>
                <div style={{ fontSize: "16px", color: theme.t(0.5), marginBottom: "6px" }}>KPI達成率（%）</div>
                <input type="number" value={quant.KPI達成率} onChange={(e) => setQuant((q) => ({ ...q, KPI達成率: e.target.value }))} style={{ width: "100%", padding: "10px 12px", background: theme.t(0.04), border: `1px solid ${theme.t(0.15)}`, borderRadius: "8px", color: theme.text, fontSize: "13px" }} />
              </div>
            </div>
            <div style={{ background: theme.t(0.03), border: `1px solid ${theme.t(0.1)}`, borderRadius: "10px", padding: "16px", fontSize: "16px" }}>
              <div style={{ marginBottom: "8px", color: theme.t(0.5) }}>確認：{selectedStudent?.name} / {monthLabel(month)}</div>
              {CATEGORY_ORDER.map((cat) => (
                <div key={cat} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span style={{ color: CATEGORY_COLORS[cat] }}>{cat}</span>
                  <span style={{ fontFamily: "monospace" }}>{catSubtotal(cat)} / {categoryMax(subitemsConfig, cat)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${theme.t(0.1)}`, marginTop: "6px", fontWeight: "600" }}>
                <span>合計</span>
                <span style={{ fontFamily: "monospace", color: theme.accent }}>{CATEGORY_ORDER.reduce((a, c) => a + catSubtotal(c), 0)} / {totalMax(subitemsConfig)}</span>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
          <button onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1} style={{ padding: "10px 18px", background: "transparent", border: `1px solid ${theme.t(0.15)}`, borderRadius: "8px", color: step === 1 ? theme.t(0.2) : theme.t(0.6), cursor: step === 1 ? "default" : "pointer", fontSize: "13px" }}>← 戻る</button>
          {step < 3 ? (
            <button onClick={() => setStep((s) => s + 1)} disabled={step === 1 && !canNextStep1} style={{ padding: "10px 18px", background: theme.accentA(0.18), border: `1px solid ${theme.accentA(0.5)}`, borderRadius: "8px", color: theme.accent, cursor: "pointer", fontSize: "13px", fontWeight: "600", opacity: step === 1 && !canNextStep1 ? 0.4 : 1 }}>次へ →</button>
          ) : (
            <button onClick={handleSubmit} style={{ padding: "10px 18px", background: theme.accentA(0.18), border: `1px solid ${theme.accentA(0.5)}`, borderRadius: "8px", color: theme.accent, cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>保存する</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   個人詳細：編集タブ（既存の月のデータをその場で編集）
   ============================================================ */
function EditPanel({ students, student, month, monthData, subitemsConfig, onSave, theme }) {
  const hasDetail = !!monthData.定性詳細;
  const [subVals, setSubVals] = useState(() => (hasDetail ? JSON.parse(JSON.stringify(monthData.定性詳細)) : {}));
  const [catComments, setCatComments] = useState(() => ({ ...(monthData.定性コメント || {}) }));
  const [quant, setQuant] = useState(() => ({ 営業pt: monthData.定量?.営業pt ?? "", KPI達成率: monthData.定量?.KPI達成率 ?? "" }));
  const [saved, setSaved] = useState(false);

  function setSub(cat, key, val) {
    setSubVals((s) => ({ ...s, [cat]: { ...(s[cat] || {}), [key]: val === "" ? "" : Number(val) } }));
    setSaved(false);
  }
  function catSubtotal(cat) {
    const items = subitemsConfig[cat] || [];
    return items.reduce((a, it) => a + (Number(subVals[cat]?.[it.key]) || 0), 0);
  }

  async function handleSave() {
    const 定性 = {};
    CATEGORY_ORDER.forEach((cat) => { 定性[cat] = catSubtotal(cat); });
    const 定性詳細 = JSON.parse(JSON.stringify(subVals));
    const 定性コメント = { ...catComments };
    const 定量 = { 営業pt: Number(quant.営業pt) || 0, KPI達成率: Number(quant.KPI達成率) || 0 };

    const updated = students.map((s) => {
      if (s.id !== student.id) return s;
      return { ...s, months: s.months.map((m) => (m.month === month ? { ...m, 定性, 定性詳細, 定性コメント, 定量 } : m)) };
    });
    await fbSet("students", studentsToFirebaseShape(updated));
    onSave(updated);
    setSaved(true);
  }

  return (
    <div>
      {!hasDetail && (
        <div style={{ background: "#FEF7E0", border: "1px solid #F4D35E", borderRadius: "8px", padding: "12px 14px", fontSize: "16px", color: "#7A5D00", marginBottom: "16px" }}>
          この月は小項目の内訳データがありません。下の項目を入力して保存すると、内訳付きのデータに更新されます（合計点は入力内容で再計算されます）。
        </div>
      )}
      {CATEGORY_ORDER.map((cat) => {
        const items = subitemsConfig[cat] || [];
        const max = categoryMax(subitemsConfig, cat);
        const subtotal = catSubtotal(cat);
        return (
          <div key={cat} style={{ marginBottom: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <div style={{ fontSize: "13px", fontWeight: "600", color: CATEGORY_COLORS[cat] }}>{cat}（/{max}点）</div>
              <div style={{ fontSize: "16px", fontFamily: "monospace", color: theme.t(0.4) }}>小計：{subtotal}</div>
            </div>
            {items.map((it) => (
              <SliderRow key={it.key} label={it.label} max={it.max} value={subVals[cat]?.[it.key]} onChange={(v) => setSub(cat, it.key, v)} theme={theme} />
            ))}
            <textarea placeholder="コメント（任意）" value={catComments[cat] || ""} onChange={(e) => { setCatComments((c) => ({ ...c, [cat]: e.target.value })); setSaved(false); }} style={{ width: "100%", marginTop: "6px", padding: "8px 10px", background: theme.t(0.03), border: `1px solid ${theme.t(0.1)}`, borderRadius: "6px", color: theme.text, fontSize: "16px", minHeight: "36px", fontFamily: "inherit", resize: "vertical" }} />
          </div>
        );
      })}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
        <div>
          <div style={{ fontSize: "16px", color: theme.t(0.5), marginBottom: "6px" }}>営業pt</div>
          <input type="number" value={quant.営業pt} onChange={(e) => { setQuant((q) => ({ ...q, 営業pt: e.target.value })); setSaved(false); }} style={{ width: "100%", padding: "10px 12px", background: theme.t(0.04), border: `1px solid ${theme.t(0.15)}`, borderRadius: "8px", color: theme.text, fontSize: "13px" }} />
        </div>
        <div>
          <div style={{ fontSize: "16px", color: theme.t(0.5), marginBottom: "6px" }}>KPI達成率（%）</div>
          <input type="number" value={quant.KPI達成率} onChange={(e) => { setQuant((q) => ({ ...q, KPI達成率: e.target.value })); setSaved(false); }} style={{ width: "100%", padding: "10px 12px", background: theme.t(0.04), border: `1px solid ${theme.t(0.15)}`, borderRadius: "8px", color: theme.text, fontSize: "13px" }} />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "10px" }}>
        {saved && <span style={{ fontSize: "16px", color: "#34A853" }}>保存しました</span>}
        <button onClick={handleSave} style={{ padding: "10px 20px", background: theme.accentA(0.15), border: `1px solid ${theme.accentA(0.45)}`, borderRadius: "8px", color: theme.accent, cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>この月の内容を保存</button>
      </div>
    </div>
  );
}

/* ============================================================
   個人詳細：PDCAタブ（月初のP・D、月末のC・Aを本人 or PMが記入）
   ============================================================ */
function PDCACard({ title, badge, fields, values, onChange, theme }) {
  return (
    <div style={{ background: theme.t(0.03), borderRadius: "12px", border: `1px solid ${theme.t(0.08)}`, padding: "20px", marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ fontSize: "15px", fontWeight: "600", color: theme.accent }}>{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {badge}
          <select value={values.enteredBy || "本人"} onChange={(e) => onChange("enteredBy", e.target.value)} style={{ fontSize: "12px", padding: "4px 8px", borderRadius: "6px", border: `1px solid ${theme.t(0.15)}`, background: theme.t(0.04), color: theme.t(0.6) }}>
            <option value="本人">記入者：本人</option>
            <option value="PM">記入者：PM</option>
          </select>
        </div>
      </div>
      {fields.map(([key, label]) => (
        <div key={key} style={{ marginBottom: key === fields[fields.length - 1][0] ? 0 : "14px" }}>
          <div style={{ fontSize: "13px", color: theme.t(0.5), marginBottom: "6px" }}>{label}</div>
          <textarea
            value={values[key] || ""}
            onChange={(e) => onChange(key, e.target.value)}
            style={{ width: "100%", minHeight: "60px", fontSize: "14px", padding: "10px 12px", borderRadius: "8px", border: `1px solid ${theme.t(0.15)}`, background: theme.t(0.03), color: theme.text, fontFamily: "inherit", resize: "vertical" }}
          />
        </div>
      ))}
    </div>
  );
}

function PDCAPanel({ students, student, month, monthData, onSave, theme }) {
  const [pdca, setPdca] = useState(() => ({ ...(monthData.pdca || {}) }));
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const updated = students.map((s) => {
      if (s.id !== student.id) return s;
      return {
        ...s,
        months: s.months.map((m) => (m.month === month ? { ...m, pdca: { ...pdca } } : m)),
      };
    });
    await fbSet("students", studentsToFirebaseShape(updated));
    onSave(updated);
    setSaved(true);
  }

  return (
    <div>
      <PDCACard
        title={`${monthLabel(month)}のPDCA`}
        badge={null}
        fields={[
          ["plan", "P　今月の目標"],
          ["do", "D　行動計画"],
          ["check", "C　できた点・できなかった点"],
          ["action", "A　次月への改善策"],
        ]}
        values={pdca}
        onChange={(k, v) => { setPdca((p) => ({ ...p, [k]: v })); setSaved(false); }}
        theme={theme}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "10px" }}>
        {saved && <span style={{ fontSize: "13px", color: "#34A853" }}>保存しました</span>}
        <button onClick={handleSave} style={{ padding: "9px 18px", background: theme.accentA(0.15), border: `1px solid ${theme.accentA(0.45)}`, borderRadius: "8px", color: theme.accent, cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>保存</button>
      </div>
    </div>
  );
}

/* ============================================================
   メイン
   ============================================================ */
export default function INDashboard() {
  const [students, setStudents] = useState(MOCK_STUDENTS);
  const [configHistory, setConfigHistory] = useState({ "2025-01": DEFAULT_SUBITEMS });
  const [themeId, setThemeId] = useState("black");
  const [loaded, setLoaded] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth <= 768 : false);
  const [showMemberSwitcher, setShowMemberSwitcher] = useState(false);

  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth <= 768); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [activeView, setActiveView] = useState("ranking"); // ranking | detail
  const [rankingTab, setRankingTab] = useState("total"); // total | gain
  const [selected, setSelected] = useState(students[0]);
  const allMonths = getAllMonths(students);
  const allYears = useMemo(() => {
    const set = new Set(getAllYears(students));
    const cur = Number(REAL_TODAY_YEAR);
    const startY = cur - 1;
    const endY = cur + 1;
    for (let y = startY; y <= endY; y++) set.add(String(y));
    return Array.from(set).sort();
  }, [students]);
  const [selectedYear, setSelectedYear] = useState(pickDefaultYear(allYears));
  const [selectedMonth, setSelectedMonth] = useState(pickDefaultMonth(allMonths, pickDefaultYear(allYears)));
  const [showArchived, setShowArchived] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [aiComment, setAiComment] = useState("");
  const [aiProvider, setAiProvider] = useState("claude"); // claude | gemini
  const [loadingAI, setLoadingAI] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  const theme = useMemo(() => THEMES[themeId], [themeId]);
  const MAX_SCORE = useMemo(() => totalMaxFor(configHistory, selectedMonth), [configHistory, selectedMonth]);
  const configForSelectedMonth = useMemo(() => getConfigForMonth(configHistory, selectedMonth), [configHistory, selectedMonth]);
  const monthsInYear = useMemo(() => {
    // データの有無に関わらず1〜12月を常に表示
    return Array.from({ length: 12 }, (_, i) => `${selectedYear}-${String(i + 1).padStart(2, "0")}`);
  }, [selectedYear]);
  const visibleStudents = useMemo(() => sortByTenure(students.filter((s) => (showArchived ? true : isActive(s)))), [students, showArchived]);

  // 初回ロード（Firebaseから取得、無ければデフォルト）
  useEffect(() => {
    (async () => {
      const [fbStudents, fbHistory, fbTheme] = await Promise.all([
        fbGet("students"),
        fbGet("config/history"),
        fbGet("settings/theme"),
      ]);
      if (fbStudents) {
        const normalized = normalizeStudentsData(fbStudents);
        if (normalized.length) {
          setStudents(normalized);
          setSelected(normalized[0]);
          const months = getAllMonths(normalized);
          const years = getAllYears(normalized);
          const y = pickDefaultYear(years);
          setSelectedYear(y);
          setSelectedMonth(pickDefaultMonth(months, y));
        }
      }
      if (fbHistory && Object.keys(fbHistory).length) setConfigHistory(fbHistory);
      if (fbTheme && THEMES[fbTheme]) setThemeId(fbTheme);
      setLoaded(true);
    })();
  }, []);

  function handleYearChange(y) {
    setSelectedYear(y);
    const inY = allMonths.filter((m) => m.startsWith(y));
    if (y === REAL_TODAY_YEAR) setSelectedMonth(REAL_TODAY_YM);
    else if (inY.length) setSelectedMonth(inY[inY.length - 1]);
    else setSelectedMonth(`${y}-01`);
    setAiComment("");
  }
  async function handleArchiveToggle(studentId) {
    const updated = students.map((s) => (s.id === studentId ? { ...s, status: isActive(s) ? "archived" : "active" } : s));
    setStudents(updated);
    await fbSet("students", studentsToFirebaseShape(updated));
  }

  function handleThemeChange(id) {
    setThemeId(id);
    fbSet("settings/theme", id);
  }
  function handleStudentsUpdate(updated) {
    setStudents(updated);
    const sel = updated.find((s) => s.id === selected.id) || updated[0];
    setSelected(sel);
    const months = getAllMonths(updated);
    if (months.length) setSelectedMonth(months[months.length - 1]);
  }
  function handleConfigSave(history) {
    setConfigHistory(history);
  }

  const monthData = selected?.months.find((m) => m.month === selectedMonth);
  const monthIdx = selected?.months.findIndex((m) => m.month === selectedMonth) ?? -1;
  const prevData = monthIdx > 0 ? selected.months[monthIdx - 1] : null;

  const score = monthData ? totalScore(monthData) : null;
  const prevScore = prevData ? totalScore(prevData) : null;
  const scoreDiff = score !== null && prevScore !== null ? score - prevScore : null;

  const handleGenerateComment = async () => {
    if (!monthData) return;
    setLoadingAI(true);
    setAiComment("");
    try {
      const comment = aiProvider === "gemini" ? await generateGeminiComment(selected, selectedMonth) : await generateAIComment(selected, selectedMonth);
      setAiComment(comment);
    } catch (e) {
      setAiComment(aiProvider === "gemini" ? `※ ${e.message}` : "※ APIキーを設定するとAI分析が使えます");
    }
    setLoadingAI(false);
  };

  if (!loaded) {
    return (
      <div style={{ minHeight: "100vh", background: theme.bgGradient, display: "flex", alignItems: "center", justifyContent: "center", color: theme.text, fontFamily: "'Noto Sans JP', sans-serif" }}>
        読み込み中...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: theme.bgGradient, fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif", color: theme.text, fontWeight: 500, transition: "background 0.3s, color 0.3s" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      {/* ヘッダー */}
      <div style={{ background: theme.t(0.03), borderBottom: `1px solid ${theme.t(0.08)}`, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <div style={{ fontSize: "12px", fontWeight: "700", color: theme.accent, letterSpacing: "3px", fontFamily: "monospace", marginBottom: "3px" }}>PM DASHBOARD</div>
          <div style={{ fontSize: "22px", fontWeight: "700" }}>IN 評価分析システム</div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setShowInput(true)} style={{ padding: "7px 14px", background: theme.accentA(0.15), border: `1px solid ${theme.accentA(0.5)}`, borderRadius: "6px", color: theme.accent, cursor: "pointer", fontSize: "16px", fontWeight: "600" }}>+ データ入力</button>
          <button onClick={() => setShowAdmin(true)} style={{ padding: "7px 14px", background: theme.t(0.04), border: `1px solid ${theme.t(0.12)}`, borderRadius: "6px", color: theme.t(0.7), cursor: "pointer", fontSize: "16px" }}>管理画面</button>
          <ThemePicker themeId={themeId} onChange={handleThemeChange} theme={theme} />
          <div style={{ display: "flex", gap: "8px", marginLeft: "4px" }}>
            {[["ranking", "ランキング"], ["detail", "個人詳細"]].map(([key, label]) => (
              <button key={key} onClick={() => setActiveView(key)} style={{ padding: "7px 16px", background: activeView === key ? theme.accentA(0.15) : "transparent", border: `1px solid ${activeView === key ? theme.accentA(0.5) : theme.t(0.1)}`, borderRadius: "6px", color: activeView === key ? theme.accent : theme.t(0.5), cursor: "pointer", fontSize: "16px", fontFamily: "'Noto Sans JP', sans-serif" }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 年・月選択バー */}
      <div style={{ background: theme.t(0.02), borderBottom: `1px solid ${theme.t(0.06)}`, padding: "10px 24px", display: "flex", alignItems: "center", gap: "8px", flexWrap: isMobile ? "nowrap" : "wrap", overflowX: isMobile ? "auto" : "visible" }}>
        <div style={{ fontSize: "13px", color: theme.t(0.3), marginRight: "4px", whiteSpace: "nowrap" }}>年選択</div>
        <select value={selectedYear} onChange={(e) => handleYearChange(e.target.value)} style={{ padding: "6px 10px", background: theme.accentA(0.1), border: `1px solid ${theme.accentA(0.4)}`, borderRadius: "8px", color: theme.accent, fontWeight: "600", fontSize: "16px", fontFamily: "monospace", cursor: "pointer", flexShrink: 0 }}>
          {allYears.map((y) => <option key={y} value={y}>{y}年</option>)}
        </select>
        <div style={{ width: "1px", height: "20px", background: theme.t(0.1), margin: "0 6px", flexShrink: 0 }} />
        <div style={{ fontSize: "13px", color: theme.t(0.3), marginRight: "4px", whiteSpace: "nowrap" }}>月選択</div>
        {monthsInYear.map((m) => {
          const hasAnyData = allMonths.includes(m);
          return (
            <button key={m} onClick={() => { setSelectedMonth(m); setAiComment(""); }} style={{ padding: "5px 12px", background: selectedMonth === m ? theme.accentA(0.2) : "transparent", border: `1px solid ${selectedMonth === m ? theme.accentA(0.6) : theme.t(0.1)}`, borderRadius: "20px", color: selectedMonth === m ? theme.accent : hasAnyData ? theme.t(0.4) : theme.t(0.25), cursor: "pointer", fontSize: "16px", fontFamily: "monospace", flexShrink: 0, whiteSpace: "nowrap" }}>
              {monthLabel(m)}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", height: isMobile ? "auto" : "calc(100vh - 115px)" }}>

        {/* サイドバー（PC） / メンバー切替（モバイル） */}
        {isMobile ? (
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${theme.t(0.08)}`, position: "relative" }}>
            <button onClick={() => setShowMemberSwitcher((v) => !v)} style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "10px 14px", background: theme.bgSolid, border: `1px solid ${theme.t(0.15)}`, borderRadius: "20px", color: theme.text, fontSize: "14px", cursor: "pointer" }}>
              <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: theme.accent, color: "#fff", fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{(selected?.name || "?").slice(0, 1)}</span>
              <span style={{ flex: 1, textAlign: "left", fontWeight: "600" }}>{selected?.name || "メンバーを選択"}</span>
              <span style={{ fontSize: "12px", color: theme.t(0.4) }}>{showMemberSwitcher ? "▲" : "▼"}</span>
            </button>
            {showMemberSwitcher && (
              <div style={{ position: "absolute", left: 16, right: 16, top: "calc(100% + 4px)", zIndex: 40, background: theme.bgSolid, border: `1px solid ${theme.t(0.12)}`, borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.18)", maxHeight: "60vh", overflowY: "auto" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 14px", fontSize: "12px", color: theme.t(0.45), cursor: "pointer", borderBottom: `1px solid ${theme.t(0.08)}` }}>
                  <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                  SAM昇格済み（非表示中）も表示する
                </label>
                {visibleStudents.map((s) => {
                  const m = s.months.find((m) => m.month === selectedMonth);
                  const sc = m ? totalScore(m) : null;
                  const pct = sc !== null ? Math.round((sc / MAX_SCORE) * 100) : 0;
                  const archived = !isActive(s);
                  const isSelected = selected?.id === s.id;
                  return (
                    <div key={s.id} onClick={() => { setSelected(s); setAiComment(""); setActiveTab("overview"); setActiveView(m ? "detail" : "ranking"); setShowMemberSwitcher(false); }}
                      style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", background: isSelected ? theme.accentA(0.08) : "transparent", opacity: m ? (archived ? 0.55 : 1) : 0.4, cursor: "pointer" }}>
                      <span style={{ fontSize: "14px", fontWeight: isSelected ? "600" : "400" }}>{s.name}{archived ? "（SAM）" : ""}</span>
                      <span style={{ fontSize: "13px", color: theme.accent, fontFamily: "monospace" }}>{m ? `${pct}%` : "—"}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
        <div style={{ width: "220px", borderRight: `1px solid ${theme.t(0.06)}`, padding: "16px 0", overflowY: "auto", flexShrink: 0 }}>
          <div style={{ padding: "0 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "16px", color: theme.t(0.3), letterSpacing: "2px" }}>IN メンバー</span>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", padding: "0 16px 12px", fontSize: "16px", color: theme.t(0.45), cursor: "pointer" }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            SAM昇格済み（非表示中）も表示する
          </label>
          {visibleStudents.map((s) => {
            const m = s.months.find((m) => m.month === selectedMonth);
            const sc = m ? totalScore(m) : null;
            const pct = sc !== null ? Math.round((sc / MAX_SCORE) * 100) : 0;
            const isSelected = selected?.id === s.id;
            const hasData = !!m;
            const archived = !isActive(s);
            return (
              <div key={s.id} onClick={() => { setSelected(s); setAiComment(""); setActiveTab("overview"); setActiveView(m ? "detail" : "ranking"); }}
                style={{ padding: "12px 16px", cursor: "pointer", background: isSelected ? theme.accentA(0.08) : "transparent", borderLeft: isSelected ? `2px solid ${theme.accent}` : "2px solid transparent", opacity: hasData ? (archived ? 0.55 : 1) : 0.4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <div style={{ fontSize: "13px", fontWeight: isSelected ? "600" : "400" }}>
                    {s.name}
                    {archived && <span style={{ marginLeft: "6px", fontSize: "13px", color: theme.t(0.4), border: `1px solid ${theme.t(0.2)}`, borderRadius: "4px", padding: "1px 4px" }}>SAM</span>}
                  </div>
                  <select
                    value={archived ? "archived" : "active"}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => { e.stopPropagation(); handleArchiveToggle(s.id); }}
                    style={{
                      fontSize: "16px",
                      padding: "3px 6px",
                      borderRadius: "6px",
                      border: `1px solid ${archived ? theme.t(0.25) : theme.accentA(0.4)}`,
                      background: archived ? theme.t(0.04) : theme.accentA(0.1),
                      color: archived ? theme.t(0.5) : theme.accent,
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    <option value="active">IN</option>
                    <option value="archived">昇格</option>
                  </select>
                </div>
                <MiniLineChart student={s} />
                {hasData && (
                  <div style={{ marginTop: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                      <span style={{ fontSize: "16px", color: theme.t(0.3) }}>{monthLabel(selectedMonth)}</span>
                      <span style={{ fontSize: "16px", color: theme.accent, fontFamily: "monospace" }}>{pct}%</span>
                    </div>
                    <div style={{ height: "3px", background: theme.t(0.1), borderRadius: "2px" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: theme.accent, borderRadius: "2px" }} />
                    </div>
                  </div>
                )}
                {!hasData && <div style={{ fontSize: "16px", color: theme.t(0.3) }}>データなし</div>}
              </div>
            );
          })}
        </div>
        )}

        {/* メインエリア */}
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "16px" : "20px 24px" }}>

          {/* ランキングビュー */}
          {activeView === "ranking" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ fontSize: "13px", color: theme.t(0.4) }}>{monthLabel(selectedMonth)} — ランキング</div>
                <div style={{ display: "flex", gap: "6px" }}>
                  {[["total", "総合点"], ["gain", "上昇値"]].map(([key, label]) => (
                    <button key={key} onClick={() => setRankingTab(key)} style={{ padding: "6px 14px", background: rankingTab === key ? theme.accentA(0.15) : "transparent", border: `1px solid ${rankingTab === key ? theme.accentA(0.5) : theme.t(0.1)}`, borderRadius: "20px", color: rankingTab === key ? theme.accent : theme.t(0.5), cursor: "pointer", fontSize: "16px" }}>{label}</button>
                  ))}
                </div>
              </div>
              <div style={{ background: theme.t(0.03), border: `1px solid ${theme.t(0.08)}`, borderRadius: "12px", padding: "24px", marginBottom: "16px" }}>
                <div style={{ fontSize: "13px", color: theme.t(0.4), marginBottom: "20px" }}>{rankingTab === "total" ? "合計スコアランキング（先月比）" : "前月比 上昇値ランキング"}</div>
                <RankingChart students={visibleStudents} selectedMonth={selectedMonth} mode={rankingTab} theme={theme} maxScore={MAX_SCORE} />
              </div>

              {/* 全員の推移を重ねて表示 */}
              <div style={{ background: theme.t(0.03), border: `1px solid ${theme.accentA(0.15)}`, borderRadius: "12px", padding: "24px" }}>
                <div style={{ fontSize: "13px", color: theme.t(0.4), marginBottom: "20px" }}>全員の合計スコア推移</div>
                <div style={{ overflowX: "auto" }}>
                {(() => {
                  const w = Math.max(640, allMonths.length * 110), h = 170, padL = 40, padR = 20, padT = 14, padB = 28;
                  const iw = w - padL - padR, ih = h - padT - padB;
                  const colors = [theme.accent, "#81C784", "#FFB74D", "#F06292", "#CE93D8", "#9334E6"];
                  return (
                    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", minWidth: "100%" }}>
                        {[0, 0.5, 1].map((level) => (
                          <line key={level} x1={padL} y1={padT + ih * (1 - level)} x2={w - padR} y2={padT + ih * (1 - level)} stroke={theme.t(0.06)} strokeWidth="1" />
                        ))}
                        {visibleStudents.map((s, si) => {
                          const color = colors[si % colors.length];
                          const vals = allMonths.map((m) => {
                            const md = s.months.find((mm) => mm.month === m);
                            return md ? totalScore(md) : null;
                          });
                          const segments = [];
                          let seg = [];
                          vals.forEach((v, i) => {
                            if (v !== null) seg.push({ i, v });
                            else { if (seg.length) segments.push(seg); seg = []; }
                          });
                          if (seg.length) segments.push(seg);
                          return segments.map((seg, segi) => {
                            const xs = seg.map((p) => padL + (p.i / (allMonths.length - 1 || 1)) * iw);
                            const ys = seg.map((p) => padT + ih - (p.v / MAX_SCORE) * ih);
                            const path = seg.map((_, j) => `${j === 0 ? "M" : "L"} ${xs[j]} ${ys[j]}`).join(" ");
                            return (
                              <g key={`${si}-${segi}`}>
                                <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                {seg.map((p, j) => <circle key={j} cx={xs[j]} cy={ys[j]} r="3.5" fill={color} stroke={theme.bgSolid} strokeWidth="1.5" />)}
                              </g>
                            );
                          });
                        })}
                        {allMonths.map((m, i) => (
                          <text key={m} x={padL + (i / (allMonths.length - 1 || 1)) * iw} y={h - 8} textAnchor="middle" fill={theme.t(0.55)} fontSize="12" fontWeight="600">{monthLabel(m)}</text>
                        ))}
                        <text x={padL - 4} y={padT + ih} textAnchor="end" fill={theme.t(0.4)} fontSize="11">0</text>
                        <text x={padL - 4} y={padT + 4} textAnchor="end" fill={theme.t(0.4)} fontSize="11">{MAX_SCORE}</text>
                    </svg>
                  );
                })()}
                </div>
                <div style={{ display: "flex", gap: "16px", marginTop: "12px", flexWrap: "wrap" }}>
                  {visibleStudents.map((s, i) => {
                    const colors = [theme.accent, "#81C784", "#FFB74D", "#F06292", "#CE93D8", "#9334E6"];
                    return (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div style={{ width: "12px", height: "3px", background: colors[i % colors.length], borderRadius: "2px" }} />
                        <span style={{ fontSize: "13px", color: theme.t(0.6) }}>{s.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 個人詳細ビュー */}
          {activeView === "detail" && selected && (
            <div>
              {!monthData ? (
                <div style={{ textAlign: "center", padding: "60px", color: theme.t(0.3) }}>
                  {selected.name} の {monthLabel(selectedMonth)} のデータはありません
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
                    <div>
                      <div style={{ fontSize: "26px", fontWeight: "700", marginBottom: "2px" }}>{selected.name}</div>
                      <div style={{ fontSize: "14px", fontWeight: "500", color: theme.t(0.5) }}>{monthLabel(selectedMonth)} の評価</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "13px", fontWeight: "600", color: theme.t(0.5), marginBottom: "2px" }}>合計スコア</div>
                      <div style={{ fontSize: "32px", fontWeight: "700", fontFamily: "monospace", color: theme.accent }}>
                        {score}<span style={{ fontSize: "16px", color: theme.t(0.4) }}>/{MAX_SCORE}</span>
                        {scoreDiff !== null && (
                          <span style={{ fontSize: "16px", color: scoreDiff > 0 ? "#81C784" : "#F06292", marginLeft: "8px" }}>
                            {scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "4px", marginBottom: "20px", borderBottom: `1px solid ${theme.t(0.08)}`, overflowX: isMobile ? "auto" : "visible" }}>
                    {[["overview", "概要"], ["edit", "編集"], ["pdca", "PDCA"], ["trends", "推移"], ["ai", "AI分析"]].map(([key, label]) => (
                      <button key={key} onClick={() => setActiveTab(key)} style={{ padding: "8px 16px", background: "transparent", border: "none", borderBottom: activeTab === key ? `2px solid ${theme.accent}` : "2px solid transparent", color: activeTab === key ? theme.accent : theme.t(0.4), cursor: "pointer", fontSize: "13px", fontWeight: activeTab === key ? "600" : "400", fontFamily: "'Noto Sans JP', sans-serif", marginBottom: "-1px", flexShrink: 0, whiteSpace: "nowrap" }}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {activeTab === "overview" && (
                    <div>
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                        <div style={{ background: theme.t(0.03), border: `1px solid ${theme.t(0.08)}`, borderRadius: "12px", padding: "20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <div style={{ fontSize: "13px", color: theme.t(0.4), marginBottom: "12px", alignSelf: "flex-start" }}>定性評価レーダー</div>
                          <RadarChart data={selected.months.filter((_, i) => i <= monthIdx)} size={200} subitemsConfig={configForSelectedMonth} theme={theme} />
                        </div>
                        <div style={{ background: theme.t(0.03), border: `1px solid ${theme.t(0.08)}`, borderRadius: "12px", padding: "20px" }}>
                          <CategoryAccordion monthData={monthData} prevData={prevData} configForMonth={configForSelectedMonth} theme={theme} />
                        </div>
                      </div>
                      <div style={{ background: theme.t(0.03), border: `1px solid ${theme.t(0.08)}`, borderRadius: "12px", padding: "20px" }}>
                        <div style={{ fontSize: "13px", color: theme.t(0.4), marginBottom: "16px" }}>定量評価</div>
                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: "12px" }}>
                          {Object.entries(monthData.定量).map(([key, val]) => (
                            <div key={key} style={{ background: theme.t(0.04), borderRadius: "8px", padding: "12px", textAlign: "center" }}>
                              <div style={{ fontSize: "13px", fontWeight: "600", color: theme.t(0.5), marginBottom: "6px" }}>{key}</div>
                              <div style={{ fontSize: "24px", fontWeight: "700", fontFamily: "monospace", color: "#FFB74D" }}>
                                {typeof val === "number" && key.includes("率") ? `${val}%` : val || "—"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === "edit" && (
                    <EditPanel students={students} student={selected} month={selectedMonth} monthData={monthData} subitemsConfig={configForSelectedMonth} onSave={handleStudentsUpdate} theme={theme} />
                  )}

                  {activeTab === "pdca" && (
                    <PDCAPanel
                      students={students}
                      student={selected}
                      month={selectedMonth}
                      monthData={monthData}
                      onSave={handleStudentsUpdate}
                      theme={theme}
                    />
                  )}

                  {activeTab === "trends" && (
                    <div style={{ background: theme.t(0.03), border: `1px solid ${theme.accentA(0.15)}`, borderRadius: "12px", padding: "24px" }}>
                      <div style={{ fontSize: "13px", color: theme.t(0.4), marginBottom: "20px" }}>合計スコア推移（全期間）</div>
                      <div style={{ overflowX: "auto" }}>
                      {(() => {
                        const w = Math.max(640, selected.months.length * 120), h = 150, padL = 44, padR = 24, padT = 24, padB = 30;
                        const iw = w - padL - padR, ih = h - padT - padB;
                        const vals = selected.months.map((m) => totalScore(m));
                        const xs = vals.map((_, i) => padL + (i / (vals.length - 1 || 1)) * iw);
                        const ys = vals.map((v) => padT + ih - (v / MAX_SCORE) * ih);
                        const path = vals.map((_, i) => `${i === 0 ? "M" : "L"} ${xs[i]} ${ys[i]}`).join(" ");
                        return (
                          <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", minWidth: "100%" }}>
                              {[0, 0.5, 1].map((level) => <line key={level} x1={padL} y1={padT + ih * (1 - level)} x2={w - padR} y2={padT + ih * (1 - level)} stroke={theme.t(0.06)} strokeWidth="1" />)}
                              <path d={path} fill="none" stroke={theme.accent} strokeWidth="3" strokeLinecap="round" />
                              <path d={`${path} L ${xs[xs.length - 1]} ${padT + ih} L ${xs[0]} ${padT + ih} Z`} fill={theme.accent} fillOpacity="0.08" />
                              {vals.map((v, i) => (
                                <g key={i}>
                                  <circle cx={xs[i]} cy={ys[i]} r={selected.months[i].month === selectedMonth ? 6 : 4.5} fill={selected.months[i].month === selectedMonth ? "#E8710A" : theme.accent} stroke={theme.bgSolid} strokeWidth="2" />
                                  <text x={xs[i]} y={ys[i] - 12} textAnchor="middle" fill={selected.months[i].month === selectedMonth ? "#E8710A" : theme.accent} fontSize="14" fontWeight="700" fontFamily="monospace">{v}</text>
                                  <text x={xs[i]} y={h - 8} textAnchor="middle" fill={theme.t(0.6)} fontSize="13" fontWeight="600">{monthLabel(selected.months[i].month)}</text>
                                </g>
                              ))}
                              <text x={padL - 6} y={padT + ih} textAnchor="end" fill={theme.t(0.45)} fontSize="12">0</text>
                              <text x={padL - 6} y={padT + 4} textAnchor="end" fill={theme.t(0.45)} fontSize="12">{MAX_SCORE}</text>
                          </svg>
                        );
                      })()}
                      </div>
                    </div>
                  )}

                  {activeTab === "ai" && (
                    <div>
                      <div style={{ background: theme.t(0.03), border: `1px solid ${theme.t(0.08)}`, borderRadius: "12px", padding: "20px", marginBottom: "16px" }}>
                        <div style={{ fontSize: "16px", color: theme.t(0.4), marginBottom: "12px" }}>
                          {monthLabel(selectedMonth)}の評価データをAIが分析し、面談前サマリーを生成します
                        </div>
                        <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
                          {[["claude", "Claude"], ["gemini", "Gemini（準備中）"]].map(([key, label]) => (
                            <button key={key} onClick={() => setAiProvider(key)} style={{ padding: "5px 12px", background: aiProvider === key ? theme.accentA(0.15) : "transparent", border: `1px solid ${aiProvider === key ? theme.accentA(0.5) : theme.t(0.12)}`, borderRadius: "20px", color: aiProvider === key ? theme.accent : theme.t(0.45), cursor: "pointer", fontSize: "13px" }}>{label}</button>
                          ))}
                        </div>
                        <button onClick={handleGenerateComment} disabled={loadingAI} style={{ padding: "10px 20px", background: theme.accentA(0.15), border: `1px solid ${theme.accentA(0.4)}`, borderRadius: "8px", color: theme.accent, cursor: loadingAI ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: "600", fontFamily: "'Noto Sans JP', sans-serif", display: "flex", alignItems: "center", gap: "8px" }}>
                          {loadingAI ? "分析中..." : "▶ AI分析を実行"}
                        </button>
                      </div>
                      {aiComment && (
                        <div style={{ background: theme.accentA(0.05), border: `1px solid ${theme.accentA(0.2)}`, borderRadius: "12px", padding: "20px", whiteSpace: "pre-wrap", lineHeight: "1.8", fontSize: "13px" }}>
                          <div style={{ fontSize: "16px", color: theme.accent, letterSpacing: "2px", marginBottom: "12px", fontFamily: "monospace" }}>AI ANALYSIS — {selected.name} / {monthLabel(selectedMonth)}</div>
                          {aiComment}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showInput && (
        <DataInputModal students={students} configHistory={configHistory} onClose={() => setShowInput(false)} onSave={handleStudentsUpdate} theme={theme} />
      )}
      {showAdmin && (
        <AdminModal configHistory={configHistory} onSave={handleConfigSave} onClose={() => setShowAdmin(false)} theme={theme} />
      )}

      <style>{`
        * { box-sizing: border-box; }
        html, body { overflow-x: hidden; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${theme.t(0.1)}; border-radius: 2px; }
      `}</style>
    </div>
  );
}
