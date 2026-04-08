import React, { useState } from "react";
import { T, fonts } from "./Theme";

function FormChart({ players, assignments, points, teams }) {
  const [filter, setFilter] = useState("all");

  const stats = players
    .filter(p => assignments[p.id])
    .map(p => {
      const arr = Object.entries(points[p.id] || {}).map(([mid, d]) => d.base);
      const total = arr.reduce((s, n) => s + n, 0);
      const played = arr.length;
      const avg = played > 0 ? Math.round(total / played) : 0;
      const best = arr.reduce((mx, n) => n > mx ? n : mx, 0);
      const last5 = arr.slice(-5);
      const team = teams.find(t => t.id === assignments[p.id]);
      return { ...p, total, played, avg, best, last5, tc: team ? team.color : T.muted, tn: team ? team.name : "", tid: assignments[p.id] };
    })
    .filter(p => p.played > 0)
    .sort((a, b) => b.total - a.total);

  const filtered = filter === "all" ? stats : stats.filter(p => p.tid === filter);

  const Bar = ({ val, max, color, isLast }) => {
    const pct = max > 0 ? val / max : 0;
    const h = Math.max(4, Math.round(pct * 44));
    const bg = val > 0 ? (isLast ? T.accent : color) : T.border;
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <span style={{ fontFamily: fonts.display, fontSize: 9, color: isLast ? T.accent : T.muted, fontWeight: isLast ? 700 : 400 }}>{val}</span>
        <div style={{ width: "100%", background: bg, borderRadius: "3px 3px 0 0", height: h + "px", opacity: isLast ? 1 : 0.65 }} />
      </div>
    );
  };

  if (stats.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 60, color: T.muted }}>
        <div style={{ fontSize: 48 }}>📈</div>
        <div style={{ fontFamily: fonts.body, marginTop: 12, fontSize: 14 }}>No match data yet. Sync stats from Matches tab first.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontFamily: fonts.display, fontSize: 26, color: T.accent, letterSpacing: 2, margin: 0 }}>PLAYER FORM</h2>
        <div style={{ fontFamily: fonts.body, fontSize: 12, color: T.muted }}>Last 5 matches</div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
        <button onClick={() => setFilter("all")}
          style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 20, border: `1px solid ${filter === "all" ? T.accent : T.border}`, background: filter === "all" ? T.accentBg : "transparent", color: filter === "all" ? T.accent : T.muted, fontFamily: fonts.display, fontWeight: 700, fontSize: 11, cursor: "pointer", letterSpacing: 0.5 }}>
          ALL
        </button>
        {teams.map(t => (
          <button key={t.id} onClick={() => setFilter(t.id)}
            style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 20, border: `1px solid ${filter === t.id ? t.color : T.border}`, background: filter === t.id ? t.color + "22" : "transparent", color: filter === t.id ? t.color : T.muted, fontFamily: fonts.display, fontWeight: 700, fontSize: 11, cursor: "pointer", letterSpacing: 0.5 }}>
            {t.name}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map(p => {
          const mx = Math.max(...p.last5, 1);
          const last = p.last5[p.last5.length - 1] || 0;
          const prev = p.last5[p.last5.length - 2] || 0;
          const diff = last - prev;
          const trendIcon = diff > 0 ? "▲" : diff < 0 ? "▼" : "—";
          const trendColor = diff > 0 ? T.success : diff < 0 ? T.danger : T.muted;
          const empty = 5 - p.last5.length;

          return (
            <div key={p.id} style={{ background: T.card, borderRadius: 12, padding: "14px 16px", border: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: fonts.body, fontWeight: 700, fontSize: 14, color: T.text }}>{p.name}</span>
                    <span style={{ fontFamily: fonts.body, fontSize: 11, color: p.tc, background: p.tc + "22", padding: "2px 8px", borderRadius: 10 }}>{p.tn}</span>
                  </div>
                  <div style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted, marginTop: 2 }}>{p.role}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: trendColor, fontWeight: 700 }}>{trendIcon}</span>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: fonts.display, fontSize: 22, fontWeight: 900, color: T.accent, lineHeight: 1 }}>{p.total}</div>
                    <div style={{ fontFamily: fonts.display, fontSize: 9, color: T.muted, letterSpacing: 1 }}>TOTAL</div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 54 }}>
                {Array.from({ length: empty }).map((_, i) => (
                  <div key={"e" + i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <span style={{ fontSize: 9, color: T.border }}>-</span>
                    <div style={{ width: "100%", background: T.border + "33", borderRadius: "3px 3px 0 0", height: "4px" }} />
                  </div>
                ))}
                {p.last5.map((v, i) => (
                  <Bar key={i} val={v} max={mx} color={p.tc} isLast={i === p.last5.length - 1} />
                ))}
              </div>

              <div style={{ display: "flex", gap: 16, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}44` }}>
                {[["MATCHES", p.played], ["AVG", p.avg], ["BEST", p.best]].map(([l, v]) => (
                  <div key={l} style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: fonts.display, fontSize: 16, fontWeight: 700, color: T.text }}>{v}</div>
                    <div style={{ fontFamily: fonts.display, fontSize: 9, color: T.muted, letterSpacing: 1 }}>{l}</div>
                  </div>
                ))}
                <div style={{ flex: 1, textAlign: "right" }}>
                  <div style={{ fontFamily: fonts.display, fontSize: 9, color: T.muted, letterSpacing: 1, marginBottom: 2 }}>LAST MATCH</div>
                  <div style={{ fontFamily: fonts.display, fontSize: 12, color: trendColor, fontWeight: 700 }}>{trendIcon} {Math.abs(diff)} pts</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FormChart;
