import React, { useState, useMemo } from "react";
import { T, fonts } from "./Theme";

// ── Snatch helpers (same pattern as AllTimeXI/MVPStats) ───────────────────────

function getSnatchStatus(pid, teamId, snatch) {
  const a = snatch?.active, h = snatch?.history || [];
  if (a?.pid === pid && a?.fromTeamId === teamId) return "away";
  if (a?.pid === pid && a?.byTeamId   === teamId) return "in";
  if (h.find(x => x.pid === pid && x.fromTeamId === teamId)) return "hist-away";
  if (h.find(x => x.pid === pid && x.byTeamId   === teamId)) return "hist-in";
  return null;
}

// Returns sorted array of { date, base } for matches attributed to this team
function getTeamMatchPts(pid, teamId, points, matches, snatch) {
  const a = snatch?.active, h = snatch?.history || [];
  const allPts = points[pid] || {};

  const inWindow = (date) => {
    if (a?.pid === pid && a?.fromTeamId === teamId) {
      return date < (a.startDate?.split("T")[0] || "9999");
    }
    if (a?.pid === pid && a?.byTeamId === teamId) {
      return date >= (a.startDate?.split("T")[0] || "0000");
    }
    const ha = h.find(x => x.pid === pid && x.fromTeamId === teamId);
    if (ha) {
      const s = ha.startDate?.split("T")[0]  || "9999";
      const e = ha.returnDate?.split("T")[0] || "9999";
      return date < s || date > e;
    }
    const hi = h.find(x => x.pid === pid && x.byTeamId === teamId);
    if (hi) {
      const s = hi.startDate?.split("T")[0]  || "0000";
      const e = hi.returnDate?.split("T")[0] || "9999";
      return date >= s && date <= e;
    }
    return true;
  };

  return Object.entries(allPts)
    .map(([mid, d]) => {
      const m = matches.find(x => x.id === mid);
      return m && inWindow(m.date) ? { date: m.date, base: d.base || 0 } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// All pids for a team including snatch
function getTeamPids(teamId, players, assignments, snatch) {
  const set = new Set(players.filter(p => assignments[p.id] === teamId).map(p => p.id));
  const a = snatch?.active;
  if (a?.fromTeamId === teamId) set.add(a.pid);
  for (const h of (snatch?.history || [])) {
    if (h.fromTeamId === teamId) set.add(h.pid);
    if (h.byTeamId   === teamId) set.add(h.pid);
  }
  return [...set];
}

// ── Snatch badge ──────────────────────────────────────────────────────────────

function SnatchBadge({ status }) {
  if (!status) return null;
  const map = {
    "away":      { label: "⚡ SNATCHED",  color: T.purple,  bg: T.purpleBg  },
    "in":        { label: "⚡ ON LOAN",    color: T.success, bg: T.successBg },
    "hist-away": { label: "↩ RETURNED",   color: T.muted,   bg: T.border    },
    "hist-in":   { label: "↩ LOAN ENDED", color: T.muted,   bg: T.border    },
  };
  const b = map[status]; if (!b) return null;
  return (
    <span style={{ fontFamily: fonts.display, fontSize: 8, fontWeight: 700, color: b.color, background: b.bg, border: `1px solid ${b.color}33`, borderRadius: 4, padding: "1px 5px", letterSpacing: 0.5 }}>
      {b.label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function FormChart({ players, assignments, points, teams, matches, snatch }) {
  const [filter, setFilter] = useState("all");

  const stats = useMemo(() => {
    const rows = [];
    for (const team of teams) {
      const pids = getTeamPids(team.id, players, assignments, snatch);
      for (const pid of pids) {
        const p = players.find(x => x.id === pid);
        if (!p) continue;
        const matchPts = getTeamMatchPts(pid, team.id, points, matches, snatch);
        if (matchPts.length === 0) continue;
        const arr    = matchPts.map(m => m.base);
        const total  = arr.reduce((s, n) => s + n, 0);
        const played = arr.length;
        const avg    = played > 0 ? Math.round(total / played) : 0;
        const best   = arr.reduce((mx, n) => n > mx ? n : mx, 0);
        const last5  = arr.slice(-5);
        const status = getSnatchStatus(pid, team.id, snatch);
        rows.push({
          ...p,
          total, played, avg, best, last5,
          tc: team.color, tn: team.name, tid: team.id,
          status,
        });
      }
    }
    return rows.sort((a, b) => b.total - a.total);
  }, [players, assignments, points, teams, matches, snatch]);

  const filtered = filter === "all" ? stats : stats.filter(p => p.tid === filter);

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

      {/* Team filter tabs */}
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

      {/* Player cards in grid - Interactive hover design */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
        {filtered.map((p, idx) => {
          const mx = Math.max(...p.last5, 1);
          const last = p.last5[p.last5.length - 1] || 0;
          const prev = p.last5[p.last5.length - 2] || 0;
          const diff = last - prev;
          const trendIcon = diff > 0 ? "▲" : diff < 0 ? "▼" : "—";
          const trendColor = diff > 0 ? T.success : diff < 0 ? T.danger : T.muted;
          const empty = 5 - p.last5.length;
          const isSnatched = p.status === "away" || p.status === "in";

          return (
            <div 
              key={p.id + p.tid} 
              className="player-card"
              style={{ 
                position: "relative",
                borderRadius: 16, 
                overflow: "hidden",
                border: `3px solid ${p.tc}`,
                boxShadow: `0 8px 24px ${p.tc}33`,
                background: T.bg,
                height: 420,
                cursor: "pointer",
                transition: "transform 0.3s ease, box-shadow 0.3s ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.boxShadow = `0 12px 32px ${p.tc}55`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = `0 8px 24px ${p.tc}33`;
              }}
            >
              <style>
                {`
                  .player-card .stats-panel {
                    transform: translateY(100%);
                    transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                  }
                  .player-card:hover .stats-panel {
                    transform: translateY(0);
                  }
                  .player-card .image-overlay {
                    opacity: 0.15;
                    transition: opacity 0.4s ease;
                  }
                  .player-card:hover .image-overlay {
                    opacity: 0.75;
                  }
                  .player-card .player-name-badge {
                    opacity: 1;
                    transition: opacity 0.3s ease;
                  }
                  .player-card:hover .player-name-badge {
                    opacity: 0;
                  }
                `}
              </style>

              {/* Full player image background */}
              <div style={{ 
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 0
              }}>
                <img 
                  src={`https://rmcxhorijitrhqyrvvkn.supabase.co/storage/v1/object/public/player-images/${p.id}.png`}
                  alt={p.name}
                  style={{ 
                    width: "100%", 
                    height: "100%", 
                    objectFit: "cover",
                    objectPosition: "top center"
                  }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
                {/* Dark overlay - intensifies on hover */}
                <div 
                  className="image-overlay"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "rgba(10, 14, 20, 0.75)"
                  }} 
                />
              </div>

              {/* Overlaid content */}
              <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column" }}>
                
                {/* Top badges - Always visible */}
                <div style={{ padding: "12px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  {/* Snatch badge */}
                  {isSnatched && <SnatchBadge status={p.status} />}
                  <div style={{ flex: 1 }} />
                  
                  {/* Trend badge */}
                  <div style={{
                    background: `${trendColor}dd`,
                    backdropFilter: "blur(8px)",
                    border: `2px solid ${trendColor}`,
                    borderRadius: 24,
                    padding: "6px 14px",
                    fontFamily: fonts.display,
                    fontSize: 14,
                    fontWeight: 800,
                    color: "#FFFFFF",
                    boxShadow: `0 4px 12px ${trendColor}66`
                  }}>
                    {trendIcon} {Math.abs(diff)}
                  </div>
                </div>

                {/* Spacer */}
                <div style={{ flex: 1 }} />

                {/* Player name badge - Visible when NOT hovering */}
                <div 
                  className="player-name-badge"
                  style={{
                    position: "absolute",
                    bottom: 16,
                    left: 16,
                    right: 16,
                    background: "rgba(10, 14, 20, 0.85)",
                    backdropFilter: "blur(12px)",
                    borderRadius: 12,
                    padding: "12px 14px",
                    border: `2px solid ${p.tc}`,
                    pointerEvents: "none"
                  }}
                >
                  <div style={{ 
                    fontFamily: fonts.display, 
                    fontWeight: 900, 
                    fontSize: 18, 
                    letterSpacing: 0.5, 
                    textTransform: "uppercase", 
                    color: "#FFFFFF",
                    textShadow: `0 2px 8px ${p.tc}88`,
                    marginBottom: 4,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }}>
                    {p.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ 
                      fontFamily: fonts.body, 
                      fontSize: 11, 
                      color: p.tc, 
                      background: `${p.tc}33`, 
                      padding: "2px 8px", 
                      borderRadius: 8,
                      fontWeight: 700,
                      border: `1px solid ${p.tc}66`
                    }}>
                      {p.tn}
                    </span>
                    <span style={{ 
                      fontFamily: fonts.body, 
                      fontSize: 11, 
                      color: "#94A3B8"
                    }}>
                      {p.role}
                    </span>
                  </div>
                </div>

                {/* Stats panel - Slides up on hover */}
                <div 
                  className="stats-panel"
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: "rgba(10, 14, 20, 0.95)",
                    backdropFilter: "blur(16px)",
                    borderTop: `3px solid ${p.tc}`,
                    padding: "16px 14px"
                  }}
                >
                  {/* Player name and team */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ 
                      fontFamily: fonts.display, 
                      fontWeight: 900, 
                      fontSize: 18, 
                      letterSpacing: 0.5, 
                      textTransform: "uppercase", 
                      color: "#FFFFFF",
                      textShadow: `0 2px 8px ${p.tc}88`,
                      marginBottom: 4,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}>
                      {p.name}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ 
                        fontFamily: fonts.body, 
                        fontSize: 11, 
                        color: p.tc, 
                        background: `${p.tc}33`, 
                        padding: "3px 10px", 
                        borderRadius: 10,
                        fontWeight: 700,
                        border: `1px solid ${p.tc}66`
                      }}>
                        {p.tn}
                      </span>
                      <span style={{ 
                        fontFamily: fonts.body, 
                        fontSize: 11, 
                        color: "#94A3B8"
                      }}>
                        {p.role}
                      </span>
                    </div>
                  </div>

                  {/* Total points */}
                  <div style={{ 
                    textAlign: "center", 
                    padding: "10px 0",
                    marginBottom: 10,
                    borderTop: `1px solid ${p.tc}44`,
                    borderBottom: `1px solid ${p.tc}44`
                  }}>
                    <div style={{ 
                      fontFamily: fonts.display, 
                      fontSize: 36, 
                      fontWeight: 900, 
                      color: p.tc,
                      lineHeight: 1,
                      textShadow: `0 0 24px ${p.tc}aa`
                    }}>
                      {p.total}
                    </div>
                    <div style={{ 
                      fontFamily: fonts.display, 
                      fontSize: 9, 
                      color: "#64748B", 
                      letterSpacing: 1.5,
                      marginTop: 4,
                      fontWeight: 600
                    }}>
                      TOTAL POINTS
                    </div>
                  </div>

                  {/* Last 5 matches bar chart */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ 
                      fontFamily: fonts.display, 
                      fontSize: 8, 
                      color: "#64748B", 
                      letterSpacing: 1,
                      marginBottom: 6,
                      fontWeight: 600
                    }}>
                      LAST 5 MATCHES
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 40 }}>
                      {Array.from({ length: empty }).map((_, i) => (
                        <div key={"e" + i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <span style={{ fontSize: 8, color: "#334155" }}>-</span>
                          <div style={{ width: "100%", background: "#1E293B", borderRadius: "2px 2px 0 0", height: "4px" }} />
                        </div>
                      ))}
                      {p.last5.map((v, i) => {
                        const pct = mx > 0 ? v / mx : 0;
                        const h = Math.max(4, Math.round(pct * 40));
                        const bg = v > 0 ? (i === p.last5.length - 1 ? T.accent : p.tc) : "#1E293B";
                        return (
                          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                            <span style={{ fontFamily: fonts.display, fontSize: 9, color: i === p.last5.length - 1 ? T.accent : "#94A3B8", fontWeight: i === p.last5.length - 1 ? 700 : 400 }}>{v}</span>
                            <div style={{ width: "100%", background: bg, borderRadius: "2px 2px 0 0", height: h + "px", opacity: i === p.last5.length - 1 ? 1 : 0.7 }} />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div style={{ 
                    display: "grid", 
                    gridTemplateColumns: "1fr 1fr 1fr", 
                    gap: 8,
                    paddingTop: 10,
                    borderTop: `1px solid ${p.tc}33`
                  }}>
                    {[
                      ["MATCHES", p.played],
                      ["AVG", p.avg],
                      ["BEST", p.best]
                    ].map(([l, v]) => (
                      <div key={l} style={{ textAlign: "center" }}>
                        <div style={{ 
                          fontFamily: fonts.display, 
                          fontSize: 18, 
                          fontWeight: 800, 
                          color: "#FFFFFF" 
                        }}>
                          {v}
                        </div>
                        <div style={{ 
                          fontFamily: fonts.display, 
                          fontSize: 8, 
                          color: "#64748B", 
                          letterSpacing: 0.5,
                          fontWeight: 600
                        }}>
                          {l}
                        </div>
                      </div>
                    ))}
                  </div>
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
