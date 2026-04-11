import React, { useState, useMemo } from "react";
import { T, fonts, FONT_URL } from "./Theme";

const ROLE_COLOR = {
  "Batsman":       "#4F8EF7",
  "Bowler":        "#FF3D5A",
  "All-Rounder":   "#2ECC71",
  "Wicket-Keeper": "#C9A84C",
};

const ROLE_SHORT = {
  "Batsman":       "BAT",
  "Bowler":        "BOWL",
  "All-Rounder":   "AR",
  "Wicket-Keeper": "WK",
};

function getPlayerBasePts(pid, points) {
  return Object.values(points[pid] || {}).reduce((s, d) => s + (d?.base || 0), 0);
}

function getMatchCount(pid, points) {
  return Object.keys(points[pid] || {}).length;
}

export default function AllTimeXI({ teams, players, assignments, points, onClose }) {
  const [selectedTeamId, setSelectedTeamId] = useState(teams[0]?.id || "");
  const [showBench, setShowBench] = useState(false);

  const team = teams.find(t => t.id === selectedTeamId);

  const ranked = useMemo(() => {
    if (!selectedTeamId) return [];
    return players
      .filter(p => assignments[p.id] === selectedTeamId)
      .map(p => ({
        ...p,
        basePts:    getPlayerBasePts(p.id, points),
        matchCount: getMatchCount(p.id, points),
      }))
      .sort((a, b) => b.basePts - a.basePts);
  }, [selectedTeamId, players, assignments, points]);

  const xi    = ranked.slice(0, 11);
  const bench = ranked.slice(11);
  const xiPts = xi.reduce((s, p) => s + p.basePts, 0);
  const maxPts = xi[0]?.basePts || 1;

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(5,8,16,0.97)",
      zIndex: 500, display: "flex", flexDirection: "column", fontFamily: fonts.body,
    }}>
      <style>{`@import url('${FONT_URL}');`}</style>

      {/* Header */}
      <div style={{
        background: T.card, borderBottom: `1px solid ${T.border}`,
        padding: "14px 20px", display: "flex", alignItems: "center",
        justifyContent: "space-between", flexShrink: 0,
      }}>
        <div>
          <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 20, color: T.accent, letterSpacing: 2 }}>
            🏏 ALL TIME XI
          </div>
          <div style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted, marginTop: 2 }}>
            Top 11 by base points · no captain multiplier
          </div>
        </div>
        <button onClick={onClose} style={{
          background: T.border, border: "none", borderRadius: 8,
          width: 30, height: 30, color: T.sub, fontSize: 14,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }}>✕</button>
      </div>

      {/* Team selector */}
      <div style={{
        display: "flex", gap: 6, padding: "12px 16px",
        overflowX: "auto", flexShrink: 0, background: T.bg,
        borderBottom: `1px solid ${T.border}`,
      }}>
        {teams.map(t => {
          const active = t.id === selectedTeamId;
          return (
            <button key={t.id}
              onClick={() => { setSelectedTeamId(t.id); setShowBench(false); }}
              style={{
                flexShrink: 0, padding: "7px 16px", borderRadius: 20,
                border: `1px solid ${active ? t.color : T.border}`,
                background: active ? t.color + "22" : "transparent",
                color: active ? t.color : T.muted,
                fontFamily: fonts.display, fontWeight: 700, fontSize: 12,
                cursor: "pointer", letterSpacing: 0.5, whiteSpace: "nowrap",
                transition: "all 0.15s",
              }}>
              {t.name}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>

        {ranked.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: T.muted }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏏</div>
            <div style={{ fontFamily: fonts.body, fontSize: 14 }}>No players assigned to this team yet.</div>
          </div>
        ) : (
          <>
            {/* Summary strip */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {[
                { label: "XI TOTAL PTS", value: xiPts.toLocaleString(), color: team?.color || T.accent },
                { label: "SQUAD SIZE",   value: ranked.length,           color: T.info },
                { label: "ON BENCH",     value: bench.length,            color: T.muted },
              ].map(s => (
                <div key={s.label} style={{
                  flex: 1, background: T.card, borderRadius: 10,
                  border: `1px solid ${T.border}`, padding: "10px 8px", textAlign: "center",
                }}>
                  <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 20, color: s.color }}>
                    {s.value}
                  </div>
                  <div style={{ fontFamily: fonts.display, fontSize: 7, color: T.muted, letterSpacing: 1.5, marginTop: 2 }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Playing XI label */}
            <div style={{
              fontFamily: fonts.display, fontSize: 9, letterSpacing: 2, fontWeight: 700,
              color: team?.color || T.accent, marginBottom: 10,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <div style={{ flex: 1, height: 1, background: (team?.color || T.accent) + "33" }} />
              PLAYING XI
              <div style={{ flex: 1, height: 1, background: (team?.color || T.accent) + "33" }} />
            </div>

            {/* XI rows */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {xi.map((p, i) => {
                const barPct    = maxPts > 0 ? (p.basePts / maxPts) * 100 : 0;
                const roleColor = ROLE_COLOR[p.role] || T.muted;
                const rankColor = i === 0 ? T.accent : i === 1 ? "#94A3B8" : i === 2 ? "#CD7F32" : T.muted;

                return (
                  <div key={p.id} style={{
                    background: T.card, borderRadius: 10, overflow: "hidden",
                    border: `1px solid ${i === 0 ? (team?.color || T.accentBorder) : T.border}`,
                    position: "relative",
                  }}>
                    {/* Background progress bar */}
                    <div style={{
                      position: "absolute", left: 0, top: 0, bottom: 0,
                      width: barPct + "%",
                      background: (team?.color || T.accent) + "0D",
                      borderRight: `1px solid ${(team?.color || T.accent) + "15"}`,
                      pointerEvents: "none",
                    }} />

                    <div style={{
                      position: "relative", display: "flex",
                      alignItems: "center", padding: "11px 14px", gap: 12,
                    }}>
                      {/* Rank */}
                      <div style={{
                        fontFamily: fonts.display, fontWeight: 700,
                        fontSize: i < 3 ? 18 : 13, color: rankColor,
                        minWidth: 28, textAlign: "center", flexShrink: 0,
                      }}>
                        {medals[i] || `#${i + 1}`}
                      </div>

                      {/* Avatar */}
                      <div style={{
                        width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                        background: roleColor + "18", border: `1px solid ${roleColor}44`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: fonts.display, fontWeight: 800, fontSize: 15, color: roleColor,
                      }}>
                        {p.name.charAt(0)}
                      </div>

                      {/* Name + meta */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: fonts.body, fontWeight: 700, fontSize: 14,
                          color: T.text, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {p.name}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                          <span style={{
                            fontFamily: fonts.display, fontSize: 9, fontWeight: 700,
                            color: roleColor, background: roleColor + "18",
                            border: `1px solid ${roleColor}33`,
                            borderRadius: 4, padding: "1px 5px", letterSpacing: 0.5,
                          }}>
                            {ROLE_SHORT[p.role] || p.role}
                          </span>
                          {p.iplTeam && (
                            <span style={{ fontFamily: fonts.body, fontSize: 10, color: T.muted }}>
                              {p.iplTeam}
                            </span>
                          )}
                          {p.matchCount > 0 && (
                            <span style={{ fontFamily: fonts.body, fontSize: 10, color: T.muted }}>
                              · {p.matchCount} match{p.matchCount !== 1 ? "es" : ""}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Points */}
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{
                          fontFamily: fonts.display, fontWeight: 900, fontSize: 22,
                          color: i === 0 ? (team?.color || T.accent) : T.text, lineHeight: 1,
                        }}>
                          {p.basePts}
                        </div>
                        <div style={{
                          fontFamily: fonts.display, fontSize: 8,
                          color: T.muted, letterSpacing: 1, marginTop: 2,
                        }}>
                          BASE PTS
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bench toggle */}
            {bench.length > 0 && (
              <>
                <button onClick={() => setShowBench(b => !b)} style={{
                  width: "100%", background: "transparent",
                  border: `1px solid ${T.border}`, borderRadius: 10,
                  padding: "10px", fontFamily: fonts.display, fontWeight: 700,
                  fontSize: 12, color: T.muted, cursor: "pointer", letterSpacing: 1,
                  marginBottom: showBench ? 10 : 20,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                  <span>{showBench ? "▲" : "▼"}</span>
                  BENCH — {bench.length} player{bench.length !== 1 ? "s" : ""}
                </button>

                {showBench && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 20 }}>
                    {bench.map((p, i) => {
                      const roleColor = ROLE_COLOR[p.role] || T.muted;
                      return (
                        <div key={p.id} style={{
                          background: T.card, borderRadius: 8,
                          border: `1px solid ${T.border}`,
                          padding: "8px 14px", display: "flex",
                          alignItems: "center", gap: 10, opacity: 0.65,
                        }}>
                          <div style={{
                            fontFamily: fonts.display, fontSize: 11,
                            color: T.muted, minWidth: 28, textAlign: "center",
                          }}>
                            #{i + 12}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontFamily: fonts.body, fontWeight: 600,
                              fontSize: 13, color: T.text,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {p.name}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
                              <span style={{
                                fontFamily: fonts.display, fontSize: 8, fontWeight: 700,
                                color: roleColor, background: roleColor + "14",
                                border: `1px solid ${roleColor}22`,
                                borderRadius: 4, padding: "1px 4px",
                              }}>
                                {ROLE_SHORT[p.role] || p.role}
                              </span>
                              {p.iplTeam && (
                                <span style={{ fontFamily: fonts.body, fontSize: 10, color: T.muted }}>
                                  {p.iplTeam}
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{
                            fontFamily: fonts.display, fontWeight: 700,
                            fontSize: 16, color: T.muted,
                          }}>
                            {p.basePts}
                            <span style={{ fontFamily: fonts.body, fontSize: 9, color: T.muted, fontWeight: 400, marginLeft: 3 }}>pts</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
