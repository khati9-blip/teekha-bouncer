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

// ── Snatch helpers ────────────────────────────────────────────────────────────

function snatchStatus(pid, teamId, snatch) {
  const a = snatch?.active, h = snatch?.history || [];
  if (a?.pid === pid && a?.fromTeamId === teamId) return "away";
  if (a?.pid === pid && a?.byTeamId   === teamId) return "in";
  if (h.find(x => x.pid === pid && x.fromTeamId === teamId)) return "hist-away";
  if (h.find(x => x.pid === pid && x.byTeamId   === teamId)) return "hist-in";
  return null;
}

// All player IDs that belong to a team (current + snatch history)
function teamPids(teamId, players, assignments, snatch) {
  const set = new Set(players.filter(p => assignments[p.id] === teamId).map(p => p.id));
  const a = snatch?.active;
  if (a?.fromTeamId === teamId) set.add(a.pid); // snatched away — still theirs
  for (const h of (snatch?.history || [])) {
    if (h.fromTeamId === teamId) set.add(h.pid); // historically snatched away
    if (h.byTeamId   === teamId) set.add(h.pid); // historically loaned in
  }
  return [...set];
}

// Base pts for a player attributed to a specific team, snatch-aware
function snatchPts(pid, teamId, points, matches, snatch) {
  const a = snatch?.active, h = snatch?.history || [];
  const allPts = points[pid] || {};

  const sumMatches = (filter) =>
    Object.entries(allPts).reduce((s, [mid, d]) => {
      const m = matches.find(x => x.id === mid);
      return m && filter(m.date) ? s + (d?.base || 0) : s;
    }, 0);

  // Currently snatched away from this team → only pre-snatch pts
  if (a?.pid === pid && a?.fromTeamId === teamId) {
    const sd = a.startDate?.split("T")[0] || "9999";
    return sumMatches(date => date < sd);
  }
  // Currently loaned into this team → only loan-period pts
  if (a?.pid === pid && a?.byTeamId === teamId) {
    const sd = a.startDate?.split("T")[0] || "0000";
    return sumMatches(date => date >= sd);
  }
  // Historically snatched away → all pts except snatch window
  const ha = h.find(x => x.pid === pid && x.fromTeamId === teamId);
  if (ha) {
    const s = ha.startDate?.split("T")[0]  || "9999";
    const e = ha.returnDate?.split("T")[0] || "9999";
    return sumMatches(date => date < s || date > e);
  }
  // Historically loaned in → only loan-window pts
  const hi = h.find(x => x.pid === pid && x.byTeamId === teamId);
  if (hi) {
    const s = hi.startDate?.split("T")[0]  || "0000";
    const e = hi.returnDate?.split("T")[0] || "9999";
    return sumMatches(date => date >= s && date <= e);
  }
  // Normal → all pts
  return sumMatches(() => true);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AllTimeXI({ teams, players, assignments, points, matches, snatch, onClose }) {
  const [selectedTeamId, setSelectedTeamId] = useState(teams[0]?.id || "");
  const [showBench, setShowBench] = useState(false);

  const team = teams.find(t => t.id === selectedTeamId);

  const ranked = useMemo(() => {
    if (!selectedTeamId) return [];
    return teamPids(selectedTeamId, players, assignments, snatch)
      .map(pid => {
        const p = players.find(x => x.id === pid);
        if (!p) return null;
        const status     = snatchStatus(pid, selectedTeamId, snatch);
        const basePts    = snatchPts(pid, selectedTeamId, points, matches, snatch);
        const matchCount = Object.keys(points[pid] || {}).length;
        return { ...p, basePts, matchCount, status };
      })
      .filter(Boolean)
      .sort((a, b) => b.basePts - a.basePts);
  }, [selectedTeamId, players, assignments, points, matches, snatch]);

  // ── Balanced XI selection ─────────────────────────────────────────────────
  // Rules: min 4 Batters, 1 All-Rounder, 1 Wicket-Keeper, 3 Bowlers, 2 flex
  const { xi, bench } = useMemo(() => {
    if (ranked.length === 0) return { xi: [], bench: [] };

    const byRole = (role) => ranked.filter(p => p.role === role);
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

    // Mandatory slots — best available per role
    pick(byRole("Batsman"),       4);
    pick(byRole("Bowler"),        3);
    pick(byRole("Wicket-Keeper"), 1);
    pick(byRole("All-Rounder"),   1);

    // 2 flex spots — best remaining players regardless of role
    pick(ranked, 2);

    // Sort XI by pts descending
    xiList.sort((a, b) => b.basePts - a.basePts);

    const benchList = ranked.filter(p => !selected.has(p.id));
    return { xi: xiList, bench: benchList };
  }, [ranked]);

  const xiPts = xi.reduce((s, p) => s + p.basePts, 0);
  const maxPts = xi[0]?.basePts || 1;
  const medals = ["🥇", "🥈", "🥉"];

  const SnatchBadge = ({ status }) => {
    if (!status) return null;
    const map = {
      "away":      { label: "⚡ SNATCHED",   color: T.purple,  bg: T.purpleBg  },
      "in":        { label: "⚡ ON LOAN",     color: T.success, bg: T.successBg },
      "hist-away": { label: "↩ RETURNED",    color: T.muted,   bg: T.border    },
      "hist-in":   { label: "↩ LOAN ENDED",  color: T.muted,   bg: T.border    },
    };
    const b = map[status]; if (!b) return null;
    return (
      <span style={{ fontFamily: fonts.display, fontSize: 8, fontWeight: 700, color: b.color, background: b.bg, border: `1px solid ${b.color}33`, borderRadius: 4, padding: "1px 5px", letterSpacing: 0.5 }}>
        {b.label}
      </span>
    );
  };

  const ptsLabel = (status) => {
    if (status === "away")      return "PRE-SNATCH";
    if (status === "in")        return "LOAN PTS";
    if (status === "hist-away") return "BASE PTS";
    if (status === "hist-in")   return "LOAN PTS";
    return "BASE PTS";
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(5,8,16,0.97)", zIndex: 500, display: "flex", flexDirection: "column", fontFamily: fonts.body }}>
      <style>{`@import url('${FONT_URL}');`}</style>

      {/* Header */}
      <div style={{ background: T.card, borderBottom: `1px solid ${T.border}`, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 20, color: T.accent, letterSpacing: 2 }}>🏏 ALL TIME XI</div>
          <div style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted, marginTop: 2 }}>Top 11 by base points · no captain multiplier</div>
        </div>
        <button onClick={onClose} style={{ background: T.border, border: "none", borderRadius: 8, width: 30, height: 30, color: T.sub, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>

      {/* Team tabs */}
      <div style={{ display: "flex", gap: 6, padding: "12px 16px", overflowX: "auto", flexShrink: 0, background: T.bg, borderBottom: `1px solid ${T.border}` }}>
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
        {ranked.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: T.muted }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏏</div>
            <div style={{ fontFamily: fonts.body, fontSize: 14 }}>No players assigned to this team yet.</div>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {[
                { label: "XI TOTAL PTS", value: xiPts.toLocaleString(), color: team?.color || T.accent },
                { label: "SQUAD SIZE",   value: ranked.length,           color: T.info },
                { label: "ON BENCH",     value: bench.length,            color: T.muted },
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
                { role: "Batsman",       short: "BAT", color: "#4F8EF7", min: 4 },
                { role: "Bowler",        short: "BOWL", color: "#FF3D5A", min: 3 },
                { role: "All-Rounder",   short: "AR",  color: "#2ECC71", min: 1 },
                { role: "Wicket-Keeper", short: "WK",  color: "#C9A84C", min: 1 },
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
            <div style={{ fontFamily: fonts.display, fontSize: 9, letterSpacing: 2, fontWeight: 700, color: team?.color || T.accent, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
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
                const isSnatched = p.status === "away" || p.status === "in";

                return (
                  <div key={p.id + (p.status || "")} style={{ background: T.card, borderRadius: 10, overflow: "hidden", border: `1px solid ${isSnatched ? T.purple + "44" : i === 0 ? (team?.color || T.accentBorder) : T.border}`, position: "relative", opacity: p.status === "away" ? 0.85 : 1 }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: barPct + "%", background: (team?.color || T.accent) + "0D", borderRight: `1px solid ${(team?.color || T.accent) + "15"}`, pointerEvents: "none" }} />
                    <div style={{ position: "relative", display: "flex", alignItems: "center", padding: "11px 14px", gap: 12 }}>
                      <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: i < 3 ? 18 : 13, color: rankColor, minWidth: 28, textAlign: "center", flexShrink: 0 }}>
                        {medals[i] || `#${i + 1}`}
                      </div>
                      <PlayerImage player={p} size={36} borderRadius={9} teamColor={team?.color} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontFamily: fonts.body, fontWeight: 700, fontSize: 14, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                          <SnatchBadge status={p.status} />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                          <span style={{ fontFamily: fonts.display, fontSize: 9, fontWeight: 700, color: roleColor, background: roleColor + "18", border: `1px solid ${roleColor}33`, borderRadius: 4, padding: "1px 5px" }}>{ROLE_SHORT[p.role] || p.role}</span>
                          {p.iplTeam && <span style={{ fontFamily: fonts.body, fontSize: 10, color: T.muted }}>{p.iplTeam}</span>}
                          {p.matchCount > 0 && <span style={{ fontFamily: fonts.body, fontSize: 10, color: T.muted }}>· {p.matchCount}m</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 22, color: p.status === "away" ? T.purple : p.status === "in" ? T.success : i === 0 ? (team?.color || T.accent) : T.text, lineHeight: 1 }}>
                          {p.basePts}
                        </div>
                        <div style={{ fontFamily: fonts.display, fontSize: 8, color: T.muted, letterSpacing: 1, marginTop: 2 }}>{ptsLabel(p.status)}</div>
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
