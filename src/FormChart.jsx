import React, { useState } from "react";

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
      return {
        ...p,
        total, played, avg, best, last5,
        tc: team ? team.color : "#4A5E78",
        tn: team ? team.name : "",
        tid: assignments[p.id]
      };
    })
    .filter(p => p.played > 0)
    .sort((a, b) => b.total - a.total);

  const filtered = filter === "all" ? stats : stats.filter(p => p.tid === filter);

  const Bar = ({ val, max, color, isLast }) => {
    const pct = max > 0 ? val / max : 0;
    const h = Math.max(4, Math.round(pct * 44));
    const bg = val > 0 ? (isLast ? "#F5A623" : color) : "#1E2D45";
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <span style={{ fontSize: 9, color: isLast ? "#F5A623" : "#4A5E78", fontWeight: isLast ? 700 : 400 }}>{val}</span>
        <div style={{ width: "100%", background: bg, borderRadius: "3px 3px 0 0", height: h + "px", opacity: isLast ? 1 : 0.65 }} />
      </div>
    );
  };

  if (stats.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 60, color: "#4A5E78" }}>
        <div style={{ fontSize: 48 }}>📈</div>
        <div style={{ marginTop: 12, fontSize: 15 }}>No match data yet. Sync stats from Matches tab first.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 28, color: "#F5A623", letterSpacing: 2 }}>PLAYER FORM</h2>
        <div style={{ fontSize: 12, color: "#4A5E78" }}>Last 5 matches</div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
        <button onClick={() => setFilter("all")}
          style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 20, border: "1px solid " + (filter === "all" ? "#F5A623" : "#1E2D45"), background: filter === "all" ? "#F5A62322" : "transparent", color: filter === "all" ? "#F5A623" : "#4A5E78", fontSize: 12, fontFamily: "Barlow Condensed,sans-serif", fontWeight: 700, cursor: "pointer" }}>
          ALL
        </button>
        {teams.map(t => (
          <button key={t.id} onClick={() => setFilter(t.id)}
            style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 20, border: "1px solid " + (filter === t.id ? t.color : "#1E2D45"), background: filter === t.id ? t.color + "22" : "transparent", color: filter === t.id ? t.color : "#4A5E78", fontSize: 12, fontFamily: "Barlow Condensed,sans-serif", fontWeight: 700, cursor: "pointer" }}>
            {t.name}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map(p => {
          const mx = Math.max.apply(null, p.last5.concat([1]));
          const last = p.last5[p.last5.length - 1] || 0;
          const prev = p.last5[p.last5.length - 2] || 0;
          const diff = last - prev;
          const trendIcon = diff > 0 ? "▲" : diff < 0 ? "▼" : "—";
          const trendColor = diff > 0 ? "#2ECC71" : diff < 0 ? "#FF3D5A" : "#4A5E78";
          const empty = 5 - p.last5.length;

          return (
            <div key={p.id} style={{ background: "#0E1521", borderRadius: 12, padding: "14px 16px", border: "1px solid #1E2D45" }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: "#E2EAF4" }}>{p.name}</span>
                    <span style={{ fontSize: 11, color: p.tc, background: p.tc + "22", padding: "2px 8px", borderRadius: 10 }}>{p.tn}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#4A5E78", marginTop: 2 }}>{p.role}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, color: trendColor, fontWeight: 700 }}>{trendIcon}</span>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 22, fontWeight: 800, color: "#F5A623", lineHeight: 1 }}>{p.total}</div>
                    <div style={{ fontSize: 9, color: "#4A5E78", letterSpacing: 1 }}>TOTAL</div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 54 }}>
                {Array.from({ length: empty }).map((_, i) => (
                  <div key={"e" + i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <span style={{ fontSize: 9, color: "#2D3E52" }}>-</span>
                    <div style={{ width: "100%", background: "#1E2D4533", borderRadius: "3px 3px 0 0", height: "4px" }} />
                  </div>
                ))}
                {p.last5.map((v, i) => (
                  <Bar key={i} val={v} max={mx} color={p.tc} isLast={i === p.last5.length - 1} />
                ))}
              </div>

              <div style={{ display: "flex", gap: 16, marginTop: 10, paddingTop: 10, borderTop: "1px solid #1E2D4544" }}>
                {[["MATCHES", p.played], ["AVG", p.avg], ["BEST", p.best]].map(([l, v]) => (
                  <div key={l} style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 16, fontWeight: 700, color: "#E2EAF4" }}>{v}</div>
                    <div style={{ fontSize: 9, color: "#4A5E78", letterSpacing: 1 }}>{l}</div>
                  </div>
                ))}
                <div style={{ flex: 1, textAlign: "right" }}>
                  <div style={{ fontSize: 9, color: "#4A5E78", letterSpacing: 1, marginBottom: 2 }}>LAST MATCH TREND</div>
                  <div style={{ fontSize: 12, color: trendColor, fontWeight: 700 }}>{trendIcon} {Math.abs(diff)} pts</div>
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
