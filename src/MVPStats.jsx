import React, { useState, useMemo } from "react";
import { T, fonts, FONT_URL } from "./Theme";

const ROLE_COLORS = { Batsman: T.accent, Bowler: T.info, "All-Rounder": T.success, "Wicket-Keeper": T.purple };
const TIER_COLORS = { platinum:"#B0BEC5", gold:"#F5A623", silver:"#94A3B8", bronze:"#CD7F32" };
const TIER_BG    = { platinum:"#4A5E7833", gold:"#F5A62322", silver:"#94A3B822", bronze:"#CD7F3222" };
const TIER_BORDER= { platinum:"#4A5E7866", gold:"#F5A62366", silver:"#94A3B855", bronze:"#CD7F3255" };

// ── Snatch helpers ────────────────────────────────────────────────────────────

function getSnatchStatus(pid, teamId, snatch) {
  const a = snatch?.active, h = snatch?.history || [];
  if (a?.pid === pid && a?.fromTeamId === teamId) return "away";
  if (a?.pid === pid && a?.byTeamId   === teamId) return "in";
  if (h.find(x => x.pid === pid && x.fromTeamId === teamId)) return "hist-away";
  if (h.find(x => x.pid === pid && x.byTeamId   === teamId)) return "hist-in";
  return null;
}

// All pids that belong to this team including snatch history
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

// Base pts for a player attributed to a team, respecting snatch windows AND ownershipLog (trades)
function getPtsForTeam(pid, teamId, points, matches, snatch, ownershipLog, filterMatchIds, assignments) {
  const a = snatch?.active, h = snatch?.history || [];
  const allPts = points[pid] || {};
  const periods = ownershipLog?.[pid] || [];

  const sum = (dateOk) =>
    Object.entries(allPts).reduce((s, [mid, d]) => {
      if (filterMatchIds && !filterMatchIds.has(mid)) return s;
      const m = matches.find(x => x.id === mid);
      return m && dateOk(m.date) ? s + (d?.base || 0) : s;
    }, 0);

  // Helper: Check if team owned player on a specific date based on ownershipLog
  const teamOwnedOnDate = (date) => {
    // If no ownership periods, fall back to current assignments
    if (periods.length === 0) return assignments[pid] === teamId;
    
    // Check if any ownership period covers this date for this team
    const owned = periods.some(period => {
      if (period.teamId !== teamId) return false;
      const from = period.from?.split("T")[0] || "0000";
      const to = period.to?.split("T")[0] || "9999";
      return date >= from && date <= to;
    });
    
    // If no period covers this date, player was NOT owned by this team
    // (Don't fall back to current assignments for historical dates)
    return owned;
  };

  // Snatch logic takes priority over ownership log
  if (a?.pid === pid && a?.fromTeamId === teamId) {
    const sd = a.startDate?.split("T")[0] || "9999";
    return sum(date => date < sd && teamOwnedOnDate(date));
  }
  if (a?.pid === pid && a?.byTeamId === teamId) {
    const sd = a.startDate?.split("T")[0] || "0000";
    return sum(date => date >= sd);
  }
  const ha = h.find(x => x.pid === pid && x.fromTeamId === teamId);
  if (ha) {
    const s = ha.startDate?.split("T")[0]  || "9999";
    const e = ha.returnDate?.split("T")[0] || "9999";
    return sum(date => (date < s || date > e) && teamOwnedOnDate(date));
  }
  const hi = h.find(x => x.pid === pid && x.byTeamId === teamId);
  if (hi) {
    const s = hi.startDate?.split("T")[0]  || "0000";
    const e = hi.returnDate?.split("T")[0] || "9999";
    return sum(date => date >= s && date <= e);
  }
  
  // No snatch involvement - use ownershipLog only
  return sum(date => teamOwnedOnDate(date));
}

// Which team "owns" a player's points for a given match date?
function getOwningTeam(pid, matchDate, assignments, snatch, teams, ownershipLog) {
  const a = snatch?.active, h = snatch?.history || [];
  
  // Snatch takes priority
  if (a?.pid === pid) {
    const sd = a.startDate?.split("T")[0] || "9999";
    if (matchDate >= sd) return teams.find(t => t.id === a.byTeamId);
    return teams.find(t => t.id === a.fromTeamId);
  }
  for (const hh of h) {
    if (hh.pid !== pid) continue;
    const s = hh.startDate?.split("T")[0]  || "9999";
    const e = hh.returnDate?.split("T")[0] || "9999";
    if (matchDate >= s && matchDate <= e) return teams.find(t => t.id === hh.byTeamId);
  }
  
  // Check ownershipLog for trades
  const periods = ownershipLog?.[pid] || [];
  for (const period of periods) {
    const from = period.from?.split("T")[0] || "0000";
    const to = period.to?.split("T")[0] || "9999";
    if (matchDate >= from && matchDate <= to) {
      return teams.find(t => t.id === period.teamId);
    }
  }
  
  // If no ownership period covers this date AND ownershipLog exists,
  // this player was unowned (unsold pool) on this date
  if (periods.length > 0) {
    return null; // Don't show in any team's stats
  }
  
  // Fall back to current assignment only if no ownershipLog exists
  return teams.find(t => t.id === assignments[pid]);
}

// ─────────────────────────────────────────────────────────────────────────────

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

export default function MVPStats({ players, teams, assignments, points, captains, matches, snatch, ownershipLog, onClose }) {
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
        // Use the team that owns this player's points for THIS match date
        const team = getOwningTeam(player.id, match.date, assignments, snatch, teams, ownershipLog);
        if (!team) continue;
        rows.push({ player, team, match, pts: d.base, matchLabel: match.team1 + " vs " + match.team2, matchDate: match.date });
      }
    }
    return rows.sort((a, b) => b.pts - a.pts);
  }, [weekMatches, players, points, teams, assignments, snatch, ownershipLog]);

  const allTimeRows = useMemo(() => {
    const rows = [];
    for (const team of teams) {
      for (const pid of getTeamPids(team.id, players, assignments, snatch)) {
        const player = players.find(p => p.id === pid);
        if (!player) continue;
        const total  = getPtsForTeam(pid, team.id, points, matches, snatch, ownershipLog, null, assignments);
        const status = getSnatchStatus(pid, team.id, snatch);
        if (total > 0 || status) rows.push({ player, team, total, status });
      }
    }
    return rows.sort((a, b) => b.total - a.total);
  }, [players, teams, assignments, points, matches, snatch, ownershipLog]);

  const teamPerformance = useMemo(() => {
    const weekMatchIds = new Set(weekMatches.map(m => m.id));
    return teams.map(team => {
      let total = 0, best = { name: "—", pts: 0 };
      for (const pid of getTeamPids(team.id, players, assignments, snatch)) {
        const player = players.find(p => p.id === pid);
        if (!player) continue;
        const playerTotal = getPtsForTeam(pid, team.id, points, matches, snatch, ownershipLog, weekMatchIds, assignments);
        total += playerTotal;
        if (playerTotal > best.pts) best = { name: player.name, pts: playerTotal };
      }
      return { team, total, best };
    }).sort((a, b) => b.total - a.total);
  }, [teams, players, assignments, points, matches, snatch, ownershipLog, weekMatches]);

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

      <div style={{ padding: "16px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>

        {/* Match stats */}
        {view === "weekly" && (
          <div>
            <div style={{ fontFamily: fonts.display, fontSize: 9, color: T.muted, letterSpacing: 2, marginBottom: 12 }}>PLAYER PERFORMANCE (BASE POINTS)</div>
            {matchRows.length === 0 ? emptyMsg : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {matchRows.map((row, idx) => (
                  <div key={row.player.id + row.match.id} className="mvp-card" style={{ position: "relative", borderRadius: 16, overflow: "hidden", border: `3px solid ${row.team.color}`, boxShadow: `0 8px 24px ${row.team.color}33`, background: T.bg, height: 380, cursor: "pointer", transition: "transform 0.3s ease" }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
                  >
                    <style>{`.mvp-card .mvp-stats-panel{transform:translateY(100%);transition:transform 0.4s cubic-bezier(0.4,0,0.2,1)}.mvp-card:hover .mvp-stats-panel{transform:translateY(0)}.mvp-card .mvp-overlay{opacity:0.15;transition:opacity 0.4s ease}.mvp-card:hover .mvp-overlay{opacity:0.75}.mvp-card .mvp-name-badge{opacity:1;transition:opacity 0.3s ease}.mvp-card:hover .mvp-name-badge{opacity:0}`}</style>
                    {/* Image */}
                    <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
                      <img src={`https://rmcxhorijitrhqyrvvkn.supabase.co/storage/v1/object/public/player-images/${row.player.id}.png`} alt={row.player.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }} onError={e => { e.target.style.display = "none"; }} />
                      <div className="mvp-overlay" style={{ position: "absolute", inset: 0, background: "rgba(10,14,20,0.75)" }} />
                    </div>
                    {/* Rank + pts badge top */}
                    <div style={{ position: "relative", zIndex: 1, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ background: "rgba(10,14,20,0.8)", backdropFilter: "blur(8px)", border: `2px solid ${medalColor(idx+1)}`, borderRadius: 24, padding: "4px 12px", fontFamily: fonts.display, fontSize: 13, fontWeight: 800, color: medalColor(idx+1) }}>#{idx+1}</div>
                      <div style={{ background: `${row.team.color}dd`, backdropFilter: "blur(8px)", border: `2px solid ${row.team.color}`, borderRadius: 24, padding: "4px 12px", fontFamily: fonts.display, fontSize: 14, fontWeight: 800, color: "#fff" }}>{row.pts} pts</div>
                    </div>
                    {/* Name badge default */}
                    <div className="mvp-name-badge" style={{ position: "absolute", bottom: 16, left: 16, right: 16, background: "rgba(10,14,20,0.85)", backdropFilter: "blur(12px)", borderRadius: 12, padding: "12px 14px", border: `2px solid ${row.team.color}`, zIndex: 1 }}>
                      <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 16, letterSpacing: 0.5, textTransform: "uppercase", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 4 }}>{row.player.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: fonts.body, fontSize: 10, color: row.team.color, background: `${row.team.color}33`, padding: "2px 8px", borderRadius: 8, fontWeight: 700, border: `1px solid ${row.team.color}66` }}>{row.team.name}</span>
                        <span style={{ fontFamily: fonts.body, fontSize: 10, color: "#94A3B8" }}>{row.player.role}</span>
                      </div>
                    </div>
                    {/* Stats panel on hover */}
                    <div className="mvp-stats-panel" style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(10,14,20,0.95)", backdropFilter: "blur(16px)", borderTop: `3px solid ${row.team.color}`, padding: "16px 14px", zIndex: 1 }}>
                      <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 16, textTransform: "uppercase", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 4 }}>{row.player.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                        <TierBadge tier={row.player.tier} />
                        <span style={{ fontFamily: fonts.body, fontSize: 10, color: row.team.color, fontWeight: 700 }}>{row.team.name}</span>
                        <span style={{ fontFamily: fonts.body, fontSize: 10, color: "#94A3B8" }}>{row.player.role}</span>
                      </div>
                      <div style={{ textAlign: "center", padding: "10px 0", borderTop: `1px solid ${row.team.color}44`, borderBottom: `1px solid ${row.team.color}44`, marginBottom: 10 }}>
                        <div style={{ fontFamily: fonts.display, fontSize: 36, fontWeight: 900, color: row.team.color, lineHeight: 1, textShadow: `0 0 24px ${row.team.color}aa` }}>{row.pts}</div>
                        <div style={{ fontFamily: fonts.display, fontSize: 9, color: "#64748B", letterSpacing: 1.5, marginTop: 4 }}>MATCH POINTS</div>
                      </div>
                      <div style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted, textAlign: "center" }}>{row.matchLabel}</div>
                      <div style={{ fontFamily: fonts.body, fontSize: 10, color: T.muted, textAlign: "center", marginTop: 2 }}>{row.matchDate}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* All time */}
        {view === "alltime" && (
          <div>
            <div style={{ fontFamily: fonts.display, fontSize: 9, color: T.muted, letterSpacing: 2, marginBottom: 12 }}>ALL TIME BASE POINTS</div>
            {allTimeRows.length === 0 ? emptyMsg : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {allTimeRows.map((row, idx) => (
                  <div key={row.player.id + row.team.id} className="mvp-card" style={{ position: "relative", borderRadius: 16, overflow: "hidden", border: `3px solid ${row.team.color}`, boxShadow: `0 8px 24px ${row.team.color}33`, background: T.bg, height: 380, cursor: "pointer", transition: "transform 0.3s ease" }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
                  >
                    {/* Image */}
                    <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
                      <img src={`https://rmcxhorijitrhqyrvvkn.supabase.co/storage/v1/object/public/player-images/${row.player.id}.png`} alt={row.player.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }} onError={e => { e.target.style.display = "none"; }} />
                      <div className="mvp-overlay" style={{ position: "absolute", inset: 0, background: "rgba(10,14,20,0.75)" }} />
                    </div>
                    {/* Rank badge top */}
                    <div style={{ position: "relative", zIndex: 1, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ background: "rgba(10,14,20,0.8)", backdropFilter: "blur(8px)", border: `2px solid ${medalColor(idx+1)}`, borderRadius: 24, padding: "4px 12px", fontFamily: fonts.display, fontSize: 13, fontWeight: 800, color: medalColor(idx+1) }}>#{idx+1}</div>
                      <div style={{ background: `${row.team.color}dd`, backdropFilter: "blur(8px)", border: `2px solid ${row.team.color}`, borderRadius: 24, padding: "4px 12px", fontFamily: fonts.display, fontSize: 14, fontWeight: 800, color: "#fff" }}>{row.total} pts</div>
                    </div>
                    {/* Name badge default */}
                    <div className="mvp-name-badge" style={{ position: "absolute", bottom: 16, left: 16, right: 16, background: "rgba(10,14,20,0.85)", backdropFilter: "blur(12px)", borderRadius: 12, padding: "12px 14px", border: `2px solid ${row.team.color}`, zIndex: 1 }}>
                      <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 16, letterSpacing: 0.5, textTransform: "uppercase", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 4 }}>{row.player.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: fonts.body, fontSize: 10, color: row.team.color, background: `${row.team.color}33`, padding: "2px 8px", borderRadius: 8, fontWeight: 700, border: `1px solid ${row.team.color}66` }}>{row.team.name}</span>
                        <span style={{ fontFamily: fonts.body, fontSize: 10, color: "#94A3B8" }}>{row.player.role}</span>
                      </div>
                    </div>
                    {/* Stats panel on hover */}
                    <div className="mvp-stats-panel" style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(10,14,20,0.95)", backdropFilter: "blur(16px)", borderTop: `3px solid ${row.team.color}`, padding: "16px 14px", zIndex: 1 }}>
                      <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 16, textTransform: "uppercase", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 4 }}>{row.player.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                        <TierBadge tier={row.player.tier} />
                        <span style={{ fontFamily: fonts.body, fontSize: 10, color: row.team.color, fontWeight: 700 }}>{row.team.name}</span>
                        <span style={{ fontFamily: fonts.body, fontSize: 10, color: "#94A3B8" }}>{row.player.role}</span>
                        {row.status === "away" && <span style={{ fontFamily: fonts.display, fontSize: 8, fontWeight: 700, color: T.purple, background: T.purpleBg, border: `1px solid ${T.purple}33`, borderRadius: 4, padding: "1px 5px" }}>⚡ SNATCHED</span>}
                        {row.status === "in" && <span style={{ fontFamily: fonts.display, fontSize: 8, fontWeight: 700, color: T.success, background: T.successBg, border: `1px solid ${T.success}33`, borderRadius: 4, padding: "1px 5px" }}>⚡ ON LOAN</span>}
                      </div>
                      <div style={{ textAlign: "center", padding: "10px 0", borderTop: `1px solid ${row.team.color}44`, borderBottom: `1px solid ${row.team.color}44`, marginBottom: 10 }}>
                        <div style={{ fontFamily: fonts.display, fontSize: 36, fontWeight: 900, color: row.team.color, lineHeight: 1, textShadow: `0 0 24px ${row.team.color}aa` }}>{row.total}</div>
                        <div style={{ fontFamily: fonts.display, fontSize: 9, color: "#64748B", letterSpacing: 1.5, marginTop: 4 }}>TOTAL POINTS</div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {[["IPL TEAM", row.player.iplTeam], ["MATCHES", Object.keys(points[row.player.id] || {}).length]].map(([l, v]) => (
                          <div key={l} style={{ textAlign: "center" }}>
                            <div style={{ fontFamily: fonts.display, fontSize: 18, fontWeight: 800, color: "#fff" }}>{v}</div>
                            <div style={{ fontFamily: fonts.display, fontSize: 8, color: "#64748B", letterSpacing: 0.5 }}>{l}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
