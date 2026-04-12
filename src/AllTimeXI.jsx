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

function PlayerImage({ player, size = 36, borderRadius = 9, teamColor }) {
  const roleColor = ROLE_COLOR[player?.role] || T.accent;
  const ringColor = teamColor || roleColor;
  const fontSize  = Math.round(size * 0.38);
  const initials  = (player?.name || "?")
    .split(" ").slice(0, 2).map(w => w.charAt(0).toUpperCase()).join("");
  return (
    <div style={{
      width: size, height: size, borderRadius, flexShrink: 0,
      background: `linear-gradient(135deg, ${roleColor}28 0%, ${ringColor}14 100%)`,
      border: `2px solid ${ringColor}55`, boxShadow: `0 0 0 1px ${ringColor}22`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: fonts.display, fontWeight: 800, fontSize, color: roleColor,
      letterSpacing: -0.5, position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "45%", background: "rgba(255,255,255,0.06)", borderRadius: `${borderRadius}px ${borderRadius}px 0 0`, pointerEvents: "none" }} />
      {initials}
    </div>
  );
}

// ── Simple point helpers ──────────────────────────────────────────────────────

function getAllBasePts(pid, points) {
  return Object.values(points[pid] || {}).reduce((s, d) => s + (d?.base || 0), 0);
}

// Returns the TRUE home team of a player — original owner even if currently snatched
function getTrueTeamId(pid, assignments, snatch) {
  const a = snatch?.active;
  // If currently snatched away, their true team is fromTeamId not current assignment
  if (a?.pid === pid) return a.fromTeamId;
  // Check history — if they were snatched and returned, assignment is already back correct
  return assignments[pid];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AllTimeXI({ teams, players, assignments, points, snatch, onClose }) {
  const [selectedTeamId, setSelectedTeamId] = useState("best");
  const [showBench, setShowBench] = useState(false);

  const isBestOfLeague = selectedTeamId === "best";
  const team = teams.find(t => t.id === selectedTeamId);

  // ── Per-team ranked list ──────────────────────────────────────────────────
  const ranked = useMemo(() => {
    if (isBestOfLeague) return [];
    return players
      .filter(p => getTrueTeamId(p.id, assignments, snatch) === selectedTeamId)
      .map(p => ({
        ...p,
        basePts:    getAllBasePts(p.id, points),
        matchCount: Object.keys(points[p.id] || {}).length,
        teamColor:  team?.color,
        teamName:   team?.name,
      }))
      .sort((a, b) => b.basePts - a.basePts);
  }, [selectedTeamId, isBestOfLeague, players, assignments, points, snatch]);

  // ── League-wide ranked list (Best of League) ──────────────────────────────
  const leagueRanked = useMemo(() => {
    if (!isBestOfLeague) return [];
    return players
      .filter(p => getTrueTeamId(p.id, assignments, snatch))
      .map(p => {
        const trueTeamId = getTrueTeamId(p.id, assignments, snatch);
        const t = teams.find(x => x.id === trueTeamId);
        return {
          ...p,
          basePts:    getAllBasePts(p.id, points),
          matchCount: Object.keys(points[p.id] || {}).length,
          teamColor:  t?.color || T.muted,
          teamName:   t?.name  || "",
        };
      })
      .sort((a, b) => b.basePts - a.basePts);
  }, [isBestOfLeague, players, assignments, points, teams, snatch]);

  const activePool = isBestOfLeague ? leagueRanked : ranked;

  // ── Balanced XI selection ─────────────────────────────────────────────────
  const { xi, bench } = useMemo(() => {
    if (activePool.length === 0) return { xi: [], bench: [] };

    const byRole = (role) => activePool.filter(p => p.role === role);
    const selected = new Set();
    const xiList = [];

    const pick = (pool, count) => {
      let picked = 0;
      for (const p of pool) {
        if (picked >= count) break;
        if (selected.has(p.id)) continue;
        xiList.push({ ...p, xiSlot: true });
        selected.add(p.id);
        picked++;
      }
    };

    pick(byRole("Batsman"),       4);
    pick(byRole("Bowler"),        3);
    pick(byRole("Wicket-Keeper"), 1);
    pick(byRole("All-Rounder"),   2);
    pick(activePool,              1); // 1 flex

    xiList.sort((a, b) => b.basePts - a.basePts);
    const benchList = activePool.filter(p => !selected.has(p.id));
    return { xi: xiList, bench: benchList };
  }, [activePool]);

  const xiPts = xi.reduce((s, p) => s + p.basePts, 0);
  const maxPts = xi[0]?.basePts || 1;
  const medals = ["🥇", "🥈", "🥉"];
  const accentColor = isBestOfLeague ? T.accent : (team?.color || T.accent);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(5,8,16,0.97)", zIndex: 500, display: "flex", flexDirection: "column", fontFamily: fonts.body }}>
      <style>{`@import url('${FONT_URL}');`}</style>

      {/* Header */}
      <div style={{ background: T.card, borderBottom: `1px solid ${T.border}`, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 20, color: T.accent, letterSpacing: 2 }}>🏏 ALL TIME XI</div>
          <div style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted, marginTop: 2 }}>Top 11 by base points · min 4 BAT, 3 BOWL, 2 AR, 1 WK · no captain multiplier</div>
        </div>
        <button onClick={onClose} style={{ background: T.border, border: "none", borderRadius: 8, width: 30, height: 30, color: T.sub, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>

      {/* Team tabs */}
      <div style={{ display: "flex", gap: 6, padding: "12px 16px", overflowX: "auto", flexShrink: 0, background: T.bg, borderBottom: `1px solid ${T.border}` }}>
        {/* Best of League tab */}
        <button onClick={() => { setSelectedTeamId("best"); setShowBench(false); }}
          style={{ flexShrink: 0, padding: "7px 16px", borderRadius: 20, border: `1px solid ${isBestOfLeague ? T.accent : T.border}`, background: isBestOfLeague ? T.accentBg : "transparent", color: isBestOfLeague ? T.accent : T.muted, fontFamily: fonts.display, fontWeight: 700, fontSize: 12, cursor: "pointer", letterSpacing: 0.5, whiteSpace: "nowrap", transition: "all 0.15s" }}>
          🏆 BEST OF LEAGUE
        </button>
        {/* Divider */}
        <div style={{ width: 1, background: T.border, flexShrink: 0, margin: "6px 0" }} />
        {teams.map(t => {
          const active = t.id === selectedTeamId;
          return (
            <button key={t.id} onClick={() => { setSelectedTeamId(t.id); setShowBench(false); }}
              style={{ flexShrink: 0, padding: "7px 16px", borderRadius: 20, border: `1px solid ${active ? t.color : T.border}`, background: active ? t.color + "22" : "transparent", color: active ? t.color : T.muted, fontFamily: fonts.display, fontWeight: 700, fontSize: 12, cursor: "pointer", letterSpacing: 0.5, whiteSpace: "nowrap", transition: "all 0.15s" }}>
              {t.name}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
        {activePool.length === 0 && xi.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: T.muted }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏏</div>
            <div style={{ fontFamily: fonts.body, fontSize: 14 }}>
              {isBestOfLeague ? "No player data yet across the league." : "No players assigned to this team yet."}
            </div>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {[
                { label: "XI TOTAL PTS", value: xiPts.toLocaleString(), color: accentColor },
                { label: isBestOfLeague ? "LEAGUE PLAYERS" : "SQUAD SIZE", value: activePool.length, color: T.info },
                { label: isBestOfLeague ? "NOT SELECTED" : "ON BENCH", value: bench.length, color: T.muted },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, background: T.card, borderRadius: 10, border: `1px solid ${T.border}`, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 20, color: s.color }}>{s.value}</div>
                  <div style={{ fontFamily: fonts.display, fontSize: 7, color: T.muted, letterSpacing: 1.5, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Role composition pills */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {[
                { role: "Batsman",       short: "BAT",  color: "#4F8EF7", min: 4 },
                { role: "Bowler",        short: "BOWL", color: "#FF3D5A", min: 3 },
                { role: "All-Rounder",   short: "AR",   color: "#2ECC71", min: 2 },
                { role: "Wicket-Keeper", short: "WK",   color: "#C9A84C", min: 1 },
              ].map(r => {
                const count = xi.filter(p => p.role === r.role).length;
                return (
                  <div key={r.role} style={{ display: "flex", alignItems: "center", gap: 5, background: r.color + "14", border: `1px solid ${r.color}33`, borderRadius: 8, padding: "4px 10px" }}>
                    <span style={{ fontFamily: fonts.display, fontSize: 11, fontWeight: 800, color: r.color }}>{count}</span>
                    <span style={{ fontFamily: fonts.display, fontSize: 9, color: r.color, letterSpacing: 0.5 }}>{r.short}</span>
                  </div>
                );
              })}
            </div>

            {/* Divider */}
            <div style={{ fontFamily: fonts.display, fontSize: 9, letterSpacing: 2, fontWeight: 700, color: accentColor, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, height: 1, background: accentColor + "33" }} />
              {isBestOfLeague ? "🏆 BEST OF LEAGUE XI" : "PLAYING XI"}
              <div style={{ flex: 1, height: 1, background: accentColor + "33" }} />
            </div>

            {/* XI rows */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {xi.map((p, i) => {
                const barPct    = maxPts > 0 ? (p.basePts / maxPts) * 100 : 0;
                const roleColor = ROLE_COLOR[p.role] || T.muted;
                const rankColor = i === 0 ? T.accent : i === 1 ? "#94A3B8" : i === 2 ? "#CD7F32" : T.muted;
                const cardColor = isBestOfLeague ? (p.teamColor || T.accent) : (team?.color || T.accent);

                return (
                  <div key={p.id} style={{ background: T.card, borderRadius: 10, overflow: "hidden", border: `1px solid ${i === 0 ? cardColor + "66" : T.border}`, position: "relative" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: barPct + "%", background: cardColor + "0D", borderRight: `1px solid ${cardColor + "15"}`, pointerEvents: "none" }} />
                    <div style={{ position: "relative", display: "flex", alignItems: "center", padding: "11px 14px", gap: 12 }}>
                      <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: i < 3 ? 18 : 13, color: rankColor, minWidth: 28, textAlign: "center", flexShrink: 0 }}>
                        {medals[i] || `#${i + 1}`}
                      </div>
                      <PlayerImage player={p} size={36} borderRadius={9} teamColor={cardColor} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontFamily: fonts.body, fontWeight: 700, fontSize: 14, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                          {/* Show team badge in Best of League view */}
                          {isBestOfLeague && p.teamName && (
                            <span style={{ fontFamily: fonts.display, fontSize: 9, fontWeight: 700, color: p.teamColor, background: p.teamColor + "18", border: `1px solid ${p.teamColor}33`, borderRadius: 10, padding: "1px 7px" }}>{p.teamName}</span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                          <span style={{ fontFamily: fonts.display, fontSize: 9, fontWeight: 700, color: roleColor, background: roleColor + "18", border: `1px solid ${roleColor}33`, borderRadius: 4, padding: "1px 5px" }}>{ROLE_SHORT[p.role] || p.role}</span>
                          {p.iplTeam && <span style={{ fontFamily: fonts.body, fontSize: 10, color: T.muted }}>{p.iplTeam}</span>}
                          {p.matchCount > 0 && <span style={{ fontFamily: fonts.body, fontSize: 10, color: T.muted }}>· {p.matchCount}m</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 22, color: i === 0 ? cardColor : T.text, lineHeight: 1 }}>
                          {p.basePts}
                        </div>
                        <div style={{ fontFamily: fonts.display, fontSize: 8, color: T.muted, letterSpacing: 1, marginTop: 2 }}>BASE PTS</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bench */}
            {bench.length > 0 && (
              <>
                <button onClick={() => setShowBench(b => !b)} style={{ width: "100%", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px", fontFamily: fonts.display, fontWeight: 700, fontSize: 12, color: T.muted, cursor: "pointer", letterSpacing: 1, marginBottom: showBench ? 10 : 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <span>{showBench ? "▲" : "▼"}</span>BENCH — {bench.length} player{bench.length !== 1 ? "s" : ""}
                </button>
                {showBench && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 20 }}>
                    {bench.map((p, i) => {
                      const roleColor = ROLE_COLOR[p.role] || T.muted;
                      return (
                        <div key={p.id} style={{ background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, padding: "8px 14px", display: "flex", alignItems: "center", gap: 10, opacity: 0.65 }}>
                          <div style={{ fontFamily: fonts.display, fontSize: 11, color: T.muted, minWidth: 28, textAlign: "center" }}>#{i + 12}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: fonts.body, fontWeight: 600, fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
                              <span style={{ fontFamily: fonts.display, fontSize: 8, fontWeight: 700, color: roleColor, background: roleColor + "14", border: `1px solid ${roleColor}22`, borderRadius: 4, padding: "1px 4px" }}>{ROLE_SHORT[p.role] || p.role}</span>
                              {p.iplTeam && <span style={{ fontFamily: fonts.body, fontSize: 10, color: T.muted }}>{p.iplTeam}</span>}
                            </div>
                          </div>
                          <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 16, color: T.muted }}>
                            {p.basePts}<span style={{ fontFamily: fonts.body, fontSize: 9, color: T.muted, fontWeight: 400, marginLeft: 3 }}>pts</span>
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
