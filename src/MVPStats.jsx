import React, { useState, useMemo } from "react";
import { T, fonts, FONT_URL } from "./Theme";
import { getOwnershipPts, getAllTeamPids, getSnatchStatus } from "./pointsUtils";

const ROLE_COLORS = { Batsman: T.accent, Bowler: T.info, "All-Rounder": T.success, "Wicket-Keeper": T.purple };
const TIER_COLORS = { platinum:"#B0BEC5", gold:"#F5A623", silver:"#94A3B8", bronze:"#CD7F32" };
const TIER_BG    = { platinum:"#4A5E7833", gold:"#F5A62322", silver:"#94A3B822", bronze:"#CD7F3222" };
const TIER_BORDER= { platinum:"#4A5E7866", gold:"#F5A62366", silver:"#94A3B855", bronze:"#CD7F3255" };

function TierBadge({ tier }) {
  if (!tier) return null;
  return (
    <span style={{ fontFamily: fonts.display, fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: "1px 5px", borderRadius: 4, textTransform: "uppercase", background: TIER_BG[tier]||"transparent", border: "1px solid "+(TIER_BORDER[tier]||T.border), color: TIER_COLORS[tier]||T.muted }}>
      {tier==="platinum"?"PLAT":tier==="gold"?"GOLD":tier==="silver"?"SILV":"BRNZ"}
    </span>
  );
}

function getWeekBounds(weekOffset) {
  const utcMs = Date.now() + new Date().getTimezoneOffset() * 60000;
  const nowIST = new Date(utcMs + 5.5 * 60 * 60 * 1000);
  const day = nowIST.getUTCDay();
  const daysSinceSat = day === 6 ? 0 : day + 1;
  const sat = new Date(nowIST);
  sat.setUTCDate(nowIST.getUTCDate() - daysSinceSat - weekOffset * 7);
  const fri = new Date(sat);
  fri.setUTCDate(sat.getUTCDate() + 6);
  const fmt = d => d.toISOString().split("T")[0];
  return { satStr: fmt(sat), friStr: fmt(fri), label: sat.toLocaleDateString("en-IN",{day:"numeric",month:"short"}) + " — " + fri.toLocaleDateString("en-IN",{day:"numeric",month:"short"}) };
}

function medalColor(rank) {
  if (rank === 1) return T.accent;
  if (rank === 2) return "#94A3B8";
  if (rank === 3) return "#CD7F32";
  return T.muted;
}

export default function MVPStats({ players, teams, assignments, points, captains, matches, ownershipLog, snatch, onClose }) {
  const [view, setView] = useState("weekly");
  const [weekOffset, setWeekOffset] = useState(0);
  const week = useMemo(() => getWeekBounds(weekOffset), [weekOffset]);

  const allStatsMatches = useMemo(() =>
    matches.filter(m => players.some(p => points[p.id]?.[m.id])),
    [matches, players, points]
  );

  const weekMatches = useMemo(() => {
    if (weekOffset === -1) return allStatsMatches;
    return allStatsMatches.filter(m => m.date >= week.satStr && m.date <= week.friStr);
  }, [allStatsMatches, week, weekOffset]);

  const matchRows = useMemo(() => {
    const rows = [];
    for (const match of weekMatches) {
      for (const player of players) {
        const d = points[player.id]?.[match.id];
        if (!d || !d.base) continue;
        const team = teams.find(t => t.id === assignments[player.id]);
        if (!team) continue;
        rows.push({ player, team, match, pts: d.base, matchLabel: match.team1 + " vs " + match.team2, matchDate: match.date });
      }
    }
    return rows.sort((a, b) => b.pts - a.pts);
  }, [weekMatches, players, points, teams, assignments]);

  const allTimeRows = useMemo(() => {
    const rows = [];
    for (const team of teams) {
      const pids = getAllTeamPids(team.id, players, assignments, ownershipLog, snatch);
      for (const pid of pids) {
        const player = players.find(p => p.id === pid);
        if (!player) continue;
        const total = getOwnershipPts(pid, team.id, points, captains, matches, ownershipLog, snatch, null, false);
        if (total > 0) {
          const snatchStatus = getSnatchStatus(pid, team.id, snatch);
          rows.push({ player, team, total, snatchStatus });
        }
      }
    }
    return rows.sort((a, b) => b.total - a.total);
  }, [players, teams, assignments, points, captains, matches, ownershipLog, snatch]);

  const teamPerformance = useMemo(() => {
    return teams.map(team => {
      const weekMatchIds = weekMatches.map(m => m.id);
      const pids = getAllTeamPids(team.id, players, assignments, ownershipLog, snatch);
      let total = 0, best = { name: "—", pts: 0 };
      for (const pid of pids) {
        const player = players.find(p => p.id === pid);
        if (!player) continue;
        const playerTotal = getOwnershipPts(pid, team.id, points, captains, matches, ownershipLog, snatch, weekMatchIds, false);
        total += playerTotal;
        if (playerTotal > best.pts) best = { name: player.name, pts: playerTotal };
      }
      return { team, total, best };
    }).sort((a, b) => b.total - a.total);
  }, [teams, players, assignments, points, captains, matches, ownershipLog, snatch, weekMatches]);

  const maxTeamPts = teamPerformance[0]?.total || 1;

  const tabBtn = (active) => ({
    background: active ? T.accentBg : "transparent",
    border: `1px solid ${active ? T.accentBorder : T.border}`,
    borderRadius: 8, padding: "6px 14px",
    color: active ? T.accent : T.muted,
    fontFamily: fonts.display, fontWeight: 700, fontSize: 12,
    cursor: "pointer", letterSpacing: 1,
  });

  const emptyMsg = (
    <div style={{ textAlign: "center", padding: 48, color: T.muted }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
      <div style={{ fontFamily: fonts.body, fontSize: 14 }}>No stats synced for this period</div>
      <div style={{ fontFamily: fonts.body, fontSize: 12, marginTop: 4 }}>{weekOffset === -1 ? "All time" : week.label}</div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(8,12,20,0.98)", zIndex: 600, display: "flex", flexDirection: "column", fontFamily: fonts.body, overflowY: "auto" }}>
      <style>{`@import url('${FONT_URL}');`}</style>

      {/* Header */}
      <div style={{ background: T.card, borderBottom: `1px solid ${T.border}`, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div>
          <div style={{ fontFamily: fonts.display, fontSize: 20, fontWeight: 800, color: T.accent, letterSpacing: 2 }}>MVP STATS</div>
          <div style={{ fontFamily: fonts.body, fontSize: 10, color: T.muted, marginTop: 2 }}>
            {weekOffset === -1 ? "All time" : week.label} · {weekMatches.length} match{weekMatches.length !== 1 ? "es" : ""}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setWeekOffset(w => w === -1 ? 0 : w + 1)}
            style={{ background: "transparent", border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 10px", color: T.muted, cursor: "pointer", fontSize: 13 }}>‹</button>
          <span style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted, minWidth: 72, textAlign: "center" }}>
            {weekOffset === -1 ? "All time" : weekOffset === 0 ? "This week" : weekOffset === 1 ? "Last week" : weekOffset + " wks ago"}
          </span>
          <button onClick={() => setWeekOffset(w => w === 0 ? -1 : Math.max(-1, w - 1))}
            style={{ background: "transparent", border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 10px", color: T.muted, cursor: "pointer", fontSize: 13 }}>›</button>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: T.muted, fontSize: 22, cursor: "pointer", marginLeft: 4 }}>✕</button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderBottom: `1px solid ${T.border}`, background: T.bg }}>
        <button style={tabBtn(view === "weekly")} onClick={() => setView("weekly")}>MATCH STATS</button>
        <button style={tabBtn(view === "alltime")} onClick={() => setView("alltime")}>ALL TIME</button>
        <button style={tabBtn(view === "team")} onClick={() => setView("team")}>BY TEAM</button>
      </div>

      <div style={{ padding: "16px", maxWidth: 600, margin: "0 auto", width: "100%" }}>

        {/* Match stats */}
        {view === "weekly" && (
          <div>
            <div style={{ fontFamily: fonts.display, fontSize: 9, color: T.muted, letterSpacing: 2, marginBottom: 12 }}>PLAYER PERFORMANCE (BASE POINTS)</div>
            {matchRows.length === 0 ? emptyMsg : matchRows.map((row, idx) => (
              <div key={row.player.id + row.match.id} style={{ background: T.card, borderRadius: 10, border: `1px solid ${row.team.color}33`, padding: "10px 14px", marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontFamily: fonts.display, fontSize: 16, fontWeight: 700, color: medalColor(idx + 1), minWidth: 24, textAlign: "center" }}>{idx + 1}</div>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: row.team.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: fonts.body, fontWeight: 700, fontSize: 14, color: T.text }}>{row.player.name}</span>
                    <TierBadge tier={row.player.tier} />
                    <span style={{ fontFamily: fonts.display, fontSize: 10, color: row.team.color, fontWeight: 700 }}>{row.team.name}</span>
                  </div>
                  <div style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted, marginTop: 1 }}>
                    <span style={{ color: ROLE_COLORS[row.player.role] || T.muted }}>{row.player.role}</span>
                    <span style={{ marginLeft: 6 }}>{row.matchLabel}</span>
                    <span style={{ marginLeft: 6 }}>{row.matchDate}</span>
                  </div>
                </div>
                <div style={{ fontFamily: fonts.display, fontSize: 22, fontWeight: 900, color: medalColor(idx + 1), minWidth: 48, textAlign: "right" }}>
                  {row.pts}<span style={{ fontFamily: fonts.body, fontSize: 10, color: T.muted, fontWeight: 400, marginLeft: 2 }}>pts</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* All time */}
        {view === "alltime" && (
          <div>
            <div style={{ fontFamily: fonts.display, fontSize: 9, color: T.muted, letterSpacing: 2, marginBottom: 12 }}>ALL TIME BASE POINTS</div>
            {allTimeRows.length === 0 ? emptyMsg : allTimeRows.map((row, idx) => (
              <div key={row.player.id + row.team.id} style={{ background: T.card, borderRadius: 10, border: `1px solid ${row.team.color}33`, padding: "10px 14px", marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontFamily: fonts.display, fontSize: 16, fontWeight: 700, color: medalColor(idx + 1), minWidth: 24, textAlign: "center" }}>{idx + 1}</div>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: row.team.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: fonts.body, fontWeight: 700, fontSize: 14, color: T.text }}>{row.player.name}</span>
                    <TierBadge tier={row.player.tier} />
                    <span style={{ fontFamily: fonts.display, fontSize: 10, color: row.team.color, fontWeight: 700 }}>{row.team.name}</span>
                    {row.snatchStatus === "active-away" && <span style={{ fontFamily: fonts.display, fontSize: 8, fontWeight: 700, color: T.purple, background: T.purpleBg, border: `1px solid ${T.purple}33`, borderRadius: 4, padding: "1px 5px" }}>⚡ SNATCHED</span>}
                    {row.snatchStatus === "active-in"   && <span style={{ fontFamily: fonts.display, fontSize: 8, fontWeight: 700, color: T.success, background: T.successBg, border: `1px solid ${T.success}33`, borderRadius: 4, padding: "1px 5px" }}>⚡ ON LOAN</span>}
                    {row.snatchStatus === "hist-away"   && <span style={{ fontFamily: fonts.display, fontSize: 8, fontWeight: 700, color: T.muted, background: T.border, borderRadius: 4, padding: "1px 5px" }}>↩ RETURNED</span>}
                    {row.snatchStatus === "hist-in"     && <span style={{ fontFamily: fonts.display, fontSize: 8, fontWeight: 700, color: T.muted, background: T.border, borderRadius: 4, padding: "1px 5px" }}>↩ LOAN ENDED</span>}
                  </div>
                  <div style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted, marginTop: 1 }}>
                    <span style={{ color: ROLE_COLORS[row.player.role] || T.muted }}>{row.player.role}</span>
                    <span style={{ marginLeft: 6 }}>{row.player.iplTeam}</span>
                    <span style={{ marginLeft: 6, color: T.muted }}>{Object.keys(points[row.player.id] || {}).length} matches</span>
                  </div>
                </div>
                <div style={{ fontFamily: fonts.display, fontSize: 22, fontWeight: 900, color: medalColor(idx + 1), minWidth: 48, textAlign: "right" }}>
                  {row.total}<span style={{ fontFamily: fonts.body, fontSize: 10, color: T.muted, fontWeight: 400, marginLeft: 2 }}>pts</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Team performance */}
        {view === "team" && (
          <div>
            <div style={{ fontFamily: fonts.display, fontSize: 9, color: T.muted, letterSpacing: 2, marginBottom: 12 }}>TEAM WEEKLY PERFORMANCE (BASE POINTS)</div>
            {teamPerformance.every(t => t.total === 0) ? emptyMsg : teamPerformance.map((tp, idx) => (
              <div key={tp.team.id} style={{ background: T.card, borderRadius: 12, border: `1px solid ${tp.team.color}33`, padding: 16, marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ fontFamily: fonts.display, fontSize: 16, fontWeight: 800, color: medalColor(idx + 1), minWidth: 24 }}>{idx + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: fonts.display, fontSize: 15, fontWeight: 700, color: tp.team.color }}>{tp.team.name}</div>
                  </div>
                  <div style={{ fontFamily: fonts.display, fontSize: 26, fontWeight: 900, color: tp.team.color }}>
                    {tp.total}<span style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted, fontWeight: 400, marginLeft: 2 }}>pts</span>
                  </div>
                </div>
                <div style={{ background: T.bg, borderRadius: 6, height: 6, marginBottom: 8, overflow: "hidden" }}>
                  <div style={{ background: tp.team.color, height: "100%", borderRadius: 6, width: (tp.total / maxTeamPts * 100) + "%" }} />
                </div>
                {tp.best.pts > 0 && (
                  <div style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted }}>
                    Top player: <span style={{ color: T.text, fontWeight: 700 }}>{tp.best.name}</span>
                    <span style={{ color: tp.team.color, marginLeft: 4 }}>{tp.best.pts} pts</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
