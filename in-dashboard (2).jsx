import { useState } from "react";

const MOCK_STUDENTS = [
  {
    id: "1",
    name: "山田 太郎",
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
    months: [
      { month: "2025-01", 定性: { 稼働: 30, 人間力: 45, 思考力: 30, 強み: 50, 当たり前基準: 15 }, 定量: { 営業pt: 32.0, KPI達成率: 18.0 } },
      { month: "2025-02", 定性: { 稼働: 33, 人間力: 48, 思考力: 33, 強み: 54, 当たり前基準: 18 }, 定量: { 営業pt: 35.0, KPI達成率: 22.0 } },
      { month: "2025-03", 定性: { 稼働: 38, 人間力: 52, 思考力: 37, 強み: 58, 当たり前基準: 20 }, 定量: { 営業pt: 38.5, KPI達成率: 26.0 } },
    ],
  },
  {
    id: "3",
    name: "田中 健太",
    months: [
      { month: "2025-02", 定性: { 稼働: 28, 人間力: 40, 思考力: 28, 強み: 45, 当たり前基準: 14 }, 定量: { 営業pt: 28.0, KPI達成率: 15.0 } },
      { month: "2025-03", 定性: { 稼働: 35, 人間力: 50, 思考力: 35, 強み: 55, 当たり前基準: 18 }, 定量: { 営業pt: 36.0, KPI達成率: 22.0 } },
      { month: "2025-04", 定性: { 稼働: 42, 人間力: 58, 思考力: 40, 強み: 62, 当たり前基準: 22 }, 定量: { 営業pt: 44.0, KPI達成率: 30.0 } },
    ],
  },
];

const CATEGORY_MAX = { 稼働: 60, 人間力: 80, 思考力: 50, 強み: 80, 当たり前基準: 30 };
const CATEGORY_COLORS = { 稼働: "#4FC3F7", 人間力: "#81C784", 思考力: "#FFB74D", 強み: "#F06292", 当たり前基準: "#CE93D8" };
const MAX_SCORE = Object.values(CATEGORY_MAX).reduce((a, b) => a + b, 0);
const MONTH_LABELS = {
  "2025-01": "1月", "2025-02": "2月", "2025-03": "3月", "2025-04": "4月",
  "2025-05": "5月", "2025-06": "6月", "2025-07": "7月", "2025-08": "8月",
  "2025-09": "9月", "2025-10": "10月", "2025-11": "11月", "2025-12": "12月",
};

// 全月リスト取得
function getAllMonths(students) {
  const set = new Set();
  students.forEach(s => s.months.forEach(m => set.add(m.month)));
  return Array.from(set).sort();
}

// 合計スコア計算
function totalScore(monthData) {
  return Object.values(monthData.定性).reduce((a, b) => a + b, 0);
}

async function generateAIComment(student, targetMonth) {
  const monthData = student.months.find(m => m.month === targetMonth);
  const idx = student.months.findIndex(m => m.month === targetMonth);
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

【対象者】${student.name}（${MONTH_LABELS[targetMonth]}）
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
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  return data.content?.map((b) => b.text || "").join("") || "コメント生成に失敗しました";
}

// ミニ折れ線グラフ（一覧用）
function MiniLineChart({ student }) {
  const w = 80, h = 32, pad = 4;
  const vals = student.months.map(m => totalScore(m));
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const xs = vals.map((_, i) => pad + (i / (vals.length - 1 || 1)) * (w - pad * 2));
  const ys = vals.map(v => pad + (1 - (v - min) / range) * (h - pad * 2));
  const path = vals.map((_, i) => `${i === 0 ? "M" : "L"} ${xs[i]} ${ys[i]}`).join(" ");
  const last = vals[vals.length - 1];
  const prev = vals[vals.length - 2];
  const trend = prev !== undefined ? last - prev : 0;
  const color = trend > 0 ? "#81C784" : trend < 0 ? "#F06292" : "#4FC3F7";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <svg width={w} height={h}>
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={xs[xs.length-1]} cy={ys[ys.length-1]} r="2.5" fill={color} />
      </svg>
      <span style={{ fontSize: "10px", color, fontFamily: "monospace" }}>
        {trend > 0 ? `+${trend}` : trend}
      </span>
    </div>
  );
}

// 全員比較バーチャート
function AllStudentsChart({ students, selectedMonth }) {
  const data = students.map(s => {
    const m = s.months.find(m => m.month === selectedMonth);
    const prevIdx = s.months.findIndex(m => m.month === selectedMonth) - 1;
    const prev = prevIdx >= 0 ? s.months[prevIdx] : null;
    if (!m) return null;
    const score = totalScore(m);
    const prevScore = prev ? totalScore(prev) : null;
    const diff = prevScore !== null ? score - prevScore : null;
    return { name: s.name, score, diff, pct: Math.round((score / MAX_SCORE) * 100) };
  }).filter(Boolean);

  data.sort((a, b) => b.score - a.score);

  return (
    <div>
      {data.map((d, i) => (
        <div key={i} style={{ marginBottom: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
            <div style={{ fontSize: "13px", fontWeight: "500" }}>{d.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {d.diff !== null && (
                <span style={{ fontSize: "11px", color: d.diff > 0 ? "#81C784" : d.diff < 0 ? "#F06292" : "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>
                  {d.diff > 0 ? `+${d.diff}` : d.diff}
                </span>
              )}
              <span style={{ fontSize: "13px", fontFamily: "monospace", color: "#4FC3F7" }}>
                {d.score}<span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>/{MAX_SCORE}</span>
              </span>
            </div>
          </div>
          <div style={{ height: "6px", background: "rgba(255,255,255,0.08)", borderRadius: "3px" }}>
            <div style={{ width: `${d.pct}%`, height: "100%", background: `linear-gradient(90deg, #4FC3F7, #81C784)`, borderRadius: "3px", transition: "width 0.5s" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// レーダーチャート
function RadarChart({ data, size = 180 }) {
  const categories = Object.keys(CATEGORY_MAX);
  const n = categories.length;
  const cx = size / 2, cy = size / 2, r = size * 0.36;
  const getPoint = (i, val, max, radius) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: cx + Math.cos(angle) * radius * (val / max), y: cy + Math.sin(angle) * radius * (val / max) };
  };
  return (
    <svg width={size} height={size} style={{ overflow: "visible" }}>
      {[0.25, 0.5, 0.75, 1.0].map(level => {
        const pts = categories.map((_, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
          return `${cx + Math.cos(angle) * r * level},${cy + Math.sin(angle) * r * level}`;
        });
        return <polygon key={level} points={pts.join(" ")} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />;
      })}
      {categories.map((_, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        return <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(angle) * r} y2={cy + Math.sin(angle) * r} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />;
      })}
      {data.map((monthData, mi) => {
        const pts = categories.map((cat, i) => getPoint(i, monthData.定性[cat], CATEGORY_MAX[cat], r));
        const color = mi === data.length - 1 ? "#4FC3F7" : "#ffffff";
        return <polygon key={mi} points={pts.map(p => `${p.x},${p.y}`).join(" ")} fill={color} fillOpacity={mi === data.length - 1 ? 0.3 : 0.05} stroke={color} strokeOpacity={mi === data.length - 1 ? 1 : 0.3} strokeWidth={mi === data.length - 1 ? 2 : 1} />;
      })}
      {categories.map((cat, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        return <text key={cat} x={cx + Math.cos(angle) * (r + 20)} y={cy + Math.sin(angle) * (r + 20)} textAnchor="middle" dominantBaseline="middle" fill={CATEGORY_COLORS[cat]} fontSize="8" fontWeight="600">{cat}</text>;
      })}
    </svg>
  );
}

export default function INDashboard() {
  const [students] = useState(MOCK_STUDENTS);
  const allMonths = getAllMonths(students);
  const [activeView, setActiveView] = useState("overview"); // overview | detail
  const [selected, setSelected] = useState(students[0]);
  const [selectedMonth, setSelectedMonth] = useState(allMonths[allMonths.length - 1]);
  const [activeTab, setActiveTab] = useState("overview");
  const [aiComment, setAiComment] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);

  const monthData = selected.months.find(m => m.month === selectedMonth);
  const monthIdx = selected.months.findIndex(m => m.month === selectedMonth);
  const prevData = monthIdx > 0 ? selected.months[monthIdx - 1] : null;

  const score = monthData ? totalScore(monthData) : null;
  const prevScore = prevData ? totalScore(prevData) : null;
  const scoreDiff = score !== null && prevScore !== null ? score - prevScore : null;

  const handleGenerateComment = async () => {
    if (!monthData) return;
    setLoadingAI(true);
    setAiComment("");
    try {
      const comment = await generateAIComment(selected, selectedMonth);
      setAiComment(comment);
    } catch {
      setAiComment("※ APIキーを設定するとAI分析が使えます");
    }
    setLoadingAI(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0d0d1a 0%, #0a1628 50%, #0d0d1a 100%)", fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif", color: "#e8e8f0" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      {/* ヘッダー */}
      <div style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "10px", color: "#4FC3F7", letterSpacing: "3px", fontFamily: "monospace", marginBottom: "3px" }}>PM DASHBOARD</div>
          <div style={{ fontSize: "18px", fontWeight: "700" }}>IN 評価分析システム</div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {[["overview", "全員一覧"], ["detail", "個人詳細"]].map(([key, label]) => (
            <button key={key} onClick={() => setActiveView(key)} style={{ padding: "7px 16px", background: activeView === key ? "rgba(79,195,247,0.15)" : "transparent", border: `1px solid ${activeView === key ? "rgba(79,195,247,0.5)" : "rgba(255,255,255,0.1)"}`, borderRadius: "6px", color: activeView === key ? "#4FC3F7" : "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: "12px", fontFamily: "'Noto Sans JP', sans-serif" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 月選択バー */}
      <div style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "10px 24px", display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginRight: "4px" }}>月選択</div>
        {allMonths.map(m => (
          <button key={m} onClick={() => { setSelectedMonth(m); setAiComment(""); }} style={{ padding: "5px 12px", background: selectedMonth === m ? "rgba(79,195,247,0.2)" : "transparent", border: `1px solid ${selectedMonth === m ? "rgba(79,195,247,0.6)" : "rgba(255,255,255,0.1)"}`, borderRadius: "20px", color: selectedMonth === m ? "#4FC3F7" : "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: "12px", fontFamily: "monospace" }}>
            {MONTH_LABELS[m]}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 115px)" }}>

        {/* サイドバー */}
        <div style={{ width: "210px", borderRight: "1px solid rgba(255,255,255,0.06)", padding: "16px 0", overflowY: "auto", flexShrink: 0 }}>
          <div style={{ padding: "0 16px 10px", fontSize: "10px", color: "rgba(255,255,255,0.3)", letterSpacing: "2px" }}>IN メンバー</div>
          {students.map(s => {
            const m = s.months.find(m => m.month === selectedMonth);
            const sc = m ? totalScore(m) : null;
            const pct = sc !== null ? Math.round((sc / MAX_SCORE) * 100) : 0;
            const isSelected = selected.id === s.id;
            const hasData = !!m;
            return (
              <div key={s.id} onClick={() => { setSelected(s); setAiComment(""); setActiveTab("overview"); if (!m) setActiveView("overview"); else setActiveView("detail"); }}
                style={{ padding: "12px 16px", cursor: "pointer", background: isSelected ? "rgba(79,195,247,0.08)" : "transparent", borderLeft: isSelected ? "2px solid #4FC3F7" : "2px solid transparent", opacity: hasData ? 1 : 0.4 }}>
                <div style={{ fontSize: "13px", fontWeight: isSelected ? "600" : "400", marginBottom: "6px" }}>{s.name}</div>
                <MiniLineChart student={s} />
                {hasData && (
                  <div style={{ marginTop: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                      <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>{MONTH_LABELS[selectedMonth]}</span>
                      <span style={{ fontSize: "10px", color: "#4FC3F7", fontFamily: "monospace" }}>{pct}%</span>
                    </div>
                    <div style={{ height: "3px", background: "rgba(255,255,255,0.1)", borderRadius: "2px" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "#4FC3F7", borderRadius: "2px" }} />
                    </div>
                  </div>
                )}
                {!hasData && <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>データなし</div>}
              </div>
            );
          })}
        </div>

        {/* メインエリア */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

          {/* 全員一覧ビュー */}
          {activeView === "overview" && (
            <div>
              <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", marginBottom: "20px" }}>
                {MONTH_LABELS[selectedMonth]} — 全員の合計スコア比較
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "24px", marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "20px" }}>合計スコアランキング（先月比）</div>
                <AllStudentsChart students={students} selectedMonth={selectedMonth} />
              </div>

              {/* 全員の推移を重ねて表示 */}
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(79,195,247,0.15)", borderRadius: "12px", padding: "24px" }}>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "20px" }}>全員の合計スコア推移</div>
                <svg width="100%" viewBox="0 0 580 120">
                  {(() => {
                    const w = 580, h = 120, padL = 40, padR = 20, padT = 10, padB = 25;
                    const iw = w - padL - padR, ih = h - padT - padB;
                    const colors = ["#4FC3F7", "#81C784", "#FFB74D", "#F06292", "#CE93D8"];
                    return (
                      <>
                        {[0, 0.5, 1].map(level => (
                          <line key={level} x1={padL} y1={padT + ih * (1 - level)} x2={w - padR} y2={padT + ih * (1 - level)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                        ))}
                        {students.map((s, si) => {
                          const color = colors[si % colors.length];
                          const vals = allMonths.map(m => {
                            const md = s.months.find(mm => mm.month === m);
                            return md ? totalScore(md) : null;
                          });
                          const segments = [];
                          let seg = [];
                          vals.forEach((v, i) => {
                            if (v !== null) { seg.push({ i, v }); }
                            else { if (seg.length) segments.push(seg); seg = []; }
                          });
                          if (seg.length) segments.push(seg);
                          return segments.map((seg, segi) => {
                            const xs = seg.map(p => padL + (p.i / (allMonths.length - 1 || 1)) * iw);
                            const ys = seg.map(p => padT + ih - (p.v / MAX_SCORE) * ih);
                            const path = seg.map((_, j) => `${j === 0 ? "M" : "L"} ${xs[j]} ${ys[j]}`).join(" ");
                            return (
                              <g key={`${si}-${segi}`}>
                                <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                {seg.map((p, j) => (
                                  <circle key={j} cx={xs[j]} cy={ys[j]} r="3" fill={color} stroke="#0d0d1a" strokeWidth="1.5" />
                                ))}
                              </g>
                            );
                          });
                        })}
                        {allMonths.map((m, i) => (
                          <text key={m} x={padL + (i / (allMonths.length - 1 || 1)) * iw} y={h - 4} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8">{MONTH_LABELS[m]}</text>
                        ))}
                        <text x={padL - 4} y={padT + ih} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize="7">0</text>
                        <text x={padL - 4} y={padT + 4} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize="7">{MAX_SCORE}</text>
                      </>
                    );
                  })()}
                </svg>
                {/* 凡例 */}
                <div style={{ display: "flex", gap: "16px", marginTop: "12px", flexWrap: "wrap" }}>
                  {students.map((s, i) => {
                    const colors = ["#4FC3F7", "#81C784", "#FFB74D", "#F06292", "#CE93D8"];
                    return (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div style={{ width: "12px", height: "3px", background: colors[i % colors.length], borderRadius: "2px" }} />
                        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>{s.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 個人詳細ビュー */}
          {activeView === "detail" && (
            <div>
              {!monthData ? (
                <div style={{ textAlign: "center", padding: "60px", color: "rgba(255,255,255,0.3)" }}>
                  {selected.name} の {MONTH_LABELS[selectedMonth]} のデータはありません
                </div>
              ) : (
                <>
                  {/* ヘッダー */}
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "20px" }}>
                    <div>
                      <div style={{ fontSize: "22px", fontWeight: "700", marginBottom: "2px" }}>{selected.name}</div>
                      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>{MONTH_LABELS[selectedMonth]} の評価</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", marginBottom: "2px" }}>合計スコア</div>
                      <div style={{ fontSize: "28px", fontWeight: "700", fontFamily: "monospace", color: "#4FC3F7" }}>
                        {score}<span style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)" }}>/{MAX_SCORE}</span>
                        {scoreDiff !== null && (
                          <span style={{ fontSize: "14px", color: scoreDiff > 0 ? "#81C784" : "#F06292", marginLeft: "8px" }}>
                            {scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* タブ */}
                  <div style={{ display: "flex", gap: "4px", marginBottom: "20px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    {[["overview", "概要"], ["trends", "推移"], ["ai", "AI分析"]].map(([key, label]) => (
                      <button key={key} onClick={() => setActiveTab(key)} style={{ padding: "8px 16px", background: "transparent", border: "none", borderBottom: activeTab === key ? "2px solid #4FC3F7" : "2px solid transparent", color: activeTab === key ? "#4FC3F7" : "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: "13px", fontWeight: activeTab === key ? "600" : "400", fontFamily: "'Noto Sans JP', sans-serif", marginBottom: "-1px" }}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {activeTab === "overview" && (
                    <div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "12px", alignSelf: "flex-start" }}>定性評価レーダー</div>
                          <RadarChart data={selected.months.filter((_, i) => i <= monthIdx)} size={200} />
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "20px" }}>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "16px" }}>カテゴリ別スコア</div>
                          {Object.entries(monthData.定性).map(([cat, val]) => {
                            const diff = prevData ? val - prevData.定性[cat] : null;
                            const pct = Math.round((val / CATEGORY_MAX[cat]) * 100);
                            return (
                              <div key={cat} style={{ marginBottom: "12px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                                  <div style={{ fontSize: "12px", color: CATEGORY_COLORS[cat], fontWeight: "500" }}>{cat}</div>
                                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                    {diff !== null && <span style={{ fontSize: "10px", color: diff > 0 ? "#81C784" : diff < 0 ? "#F06292" : "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>{diff > 0 ? `+${diff}` : diff}</span>}
                                    <span style={{ fontSize: "11px", fontFamily: "monospace" }}>{val}<span style={{ color: "rgba(255,255,255,0.3)" }}>/{CATEGORY_MAX[cat]}</span></span>
                                  </div>
                                </div>
                                <div style={{ height: "5px", background: "rgba(255,255,255,0.08)", borderRadius: "3px" }}>
                                  <div style={{ width: `${pct}%`, height: "100%", background: CATEGORY_COLORS[cat], borderRadius: "3px" }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "20px" }}>
                        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "16px" }}>定量評価</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
                          {Object.entries(monthData.定量).map(([key, val]) => (
                            <div key={key} style={{ background: "rgba(255,255,255,0.04)", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
                              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", marginBottom: "6px" }}>{key}</div>
                              <div style={{ fontSize: "20px", fontWeight: "700", fontFamily: "monospace", color: "#FFB74D" }}>
                                {typeof val === "number" && key.includes("率") ? `${val}%` : val || "—"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === "trends" && (
                    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(79,195,247,0.15)", borderRadius: "12px", padding: "24px" }}>
                      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "20px" }}>合計スコア推移（全期間）</div>
                      <svg width="100%" viewBox="0 0 580 100">
                        {(() => {
                          const w = 580, h = 100, padL = 40, padR = 20, padT = 10, padB = 25;
                          const iw = w - padL - padR, ih = h - padT - padB;
                          const vals = selected.months.map(m => totalScore(m));
                          const xs = vals.map((_, i) => padL + (i / (vals.length - 1 || 1)) * iw);
                          const ys = vals.map(v => padT + ih - (v / MAX_SCORE) * ih);
                          const path = vals.map((_, i) => `${i === 0 ? "M" : "L"} ${xs[i]} ${ys[i]}`).join(" ");
                          return (
                            <>
                              {[0, 0.5, 1].map(level => <line key={level} x1={padL} y1={padT + ih * (1 - level)} x2={w - padR} y2={padT + ih * (1 - level)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />)}
                              <path d={path} fill="none" stroke="#4FC3F7" strokeWidth="2.5" strokeLinecap="round" />
                              <path d={`${path} L ${xs[xs.length-1]} ${padT+ih} L ${xs[0]} ${padT+ih} Z`} fill="#4FC3F7" fillOpacity="0.06" />
                              {vals.map((v, i) => (
                                <g key={i}>
                                  <circle cx={xs[i]} cy={ys[i]} r={selected.months[i].month === selectedMonth ? 5 : 3.5} fill={selected.months[i].month === selectedMonth ? "#FFB74D" : "#4FC3F7"} stroke="#0d0d1a" strokeWidth="2" />
                                  <text x={xs[i]} y={ys[i] - 9} textAnchor="middle" fill={selected.months[i].month === selectedMonth ? "#FFB74D" : "#4FC3F7"} fontSize="9" fontFamily="monospace">{v}</text>
                                  <text x={xs[i]} y={h - 4} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8">{MONTH_LABELS[selected.months[i].month]}</text>
                                </g>
                              ))}
                              <text x={padL - 4} y={padT + ih} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize="7">0</text>
                              <text x={padL - 4} y={padT + 4} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize="7">{MAX_SCORE}</text>
                            </>
                          );
                        })()}
                      </svg>
                    </div>
                  )}

                  {activeTab === "ai" && (
                    <div>
                      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "20px", marginBottom: "16px" }}>
                        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: "16px" }}>
                          {MONTH_LABELS[selectedMonth]}の評価データをAIが分析し、面談前サマリーを生成します
                        </div>
                        <button onClick={handleGenerateComment} disabled={loadingAI} style={{ padding: "10px 20px", background: "rgba(79,195,247,0.15)", border: "1px solid rgba(79,195,247,0.4)", borderRadius: "8px", color: "#4FC3F7", cursor: loadingAI ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: "600", fontFamily: "'Noto Sans JP', sans-serif", display: "flex", alignItems: "center", gap: "8px" }}>
                          {loadingAI ? "分析中..." : "▶ AI分析を実行"}
                        </button>
                      </div>
                      {aiComment && (
                        <div style={{ background: "rgba(79,195,247,0.05)", border: "1px solid rgba(79,195,247,0.2)", borderRadius: "12px", padding: "20px", whiteSpace: "pre-wrap", lineHeight: "1.8", fontSize: "13px" }}>
                          <div style={{ fontSize: "10px", color: "#4FC3F7", letterSpacing: "2px", marginBottom: "12px", fontFamily: "monospace" }}>AI ANALYSIS — {selected.name} / {MONTH_LABELS[selectedMonth]}</div>
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

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>
    </div>
  );
}
