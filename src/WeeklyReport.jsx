import React, { useState } from "react";
import { T, fonts, FONT_URL } from "./Theme";

const ROLE_COLOR = {
  "Batsman":       "#4F8EF7",
  "Bowler":        "#FF3D5A",
  "All-Rounder":   "#2ECC71",
  "Wicket-Keeper": "#C9A84C",
};

// Polished letter avatar — role-coloured ring + gradient background
function PlayerImage({ player, size = 44, borderRadius = 11, teamColor }) {
  const roleColor = ROLE_COLOR[player?.role] || T.accent;
  const ringColor = teamColor || roleColor;
  const fontSize  = Math.round(size * 0.38);
  const initials  = (player?.name || "?")
    .split(" ").slice(0, 2)
    .map(w => w.charAt(0).toUpperCase()).join("");

  return (
    <div style={{
      width: size, height: size, borderRadius, flexShrink: 0,
      background: `linear-gradient(135deg, ${roleColor}28 0%, ${ringColor}14 100%)`,
      border: `2px solid ${ringColor}55`,
      boxShadow: `0 0 0 1px ${ringColor}22`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: fonts.display, fontWeight: 800,
      fontSize, color: roleColor, letterSpacing: -0.5,
      position: "relative", overflow: "hidden",
    }}>
      {/* Subtle sheen */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "45%",
        background: "rgba(255,255,255,0.06)", borderRadius: `${borderRadius}px ${borderRadius}px 0 0`,
        pointerEvents: "none",
      }} />
      {initials}
    </div>
  );
}

function getWeekRange(offset = 0) {
  // Weeks run Saturday 12:00 AM IST → Friday 11:58 PM IST,
  // matching the snatch window cycle. All calculations in IST.
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + new Date().getTimezoneOffset() * 60000 + IST_OFFSET);
  const day = nowIST.getUTCDay(); // 0=Sun, 6=Sat
  // Days since last Saturday (0 if today is Saturday)
  const daysSinceSat = day === 6 ? 0 : day + 1;
  const sat = new Date(nowIST);
  sat.setUTCDate(nowIST.getUTCDate() - daysSinceSat - offset * 7);
  const fri = new Date(sat);
  fri.setUTCDate(sat.getUTCDate() + 6);
  const fmt = d => d.toISOString().split("T")[0];
  const fmtLabel = d => new Date(fmt(d)).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return {
    startStr: fmt(sat),
    endStr: fmt(fri),
    label: fmtLabel(sat) + " – " + fmtLabel(fri),
  };
}

function getWeekMatches(matches, week) {
  return matches.filter(m => m.status === "completed" && m.date && m.date >= week.startStr && m.date <= week.endStr);
}

function getTeamWeekPts(teamId, weekMatches, points, captains, players, assignments, ownershipLog) {
  let total = 0;
  const allPids = new Set([...players.filter(p => assignments[p.id] === teamId).map(p => p.id), ...Object.entries(ownershipLog || {}).filter(([, periods]) => periods.some(o => o.teamId === teamId)).map(([pid]) => pid)]);
  for (const pid of allPids) {
    const periods = (ownershipLog?.[pid] || []).filter(o => o.teamId === teamId);
    for (const m of weekMatches) {
      const d = points?.[pid]?.[m.id]; if (!d) continue;
      const matchDate = new Date(m.date);
      const owned = periods.length === 0 ? assignments[pid] === teamId : periods.some(o => matchDate >= new Date(o.from) && matchDate <= (o.to ? new Date(o.to) : new Date("2099-01-01")));
      if (!owned) continue;
      const cap = captains?.[m.id + "_" + teamId] || {};
      let pts = d.base;
      if (cap.captain === pid) pts *= 2; else if (cap.vc === pid) pts *= 1.5;
      total += Math.round(pts);
    }
  }
  return total;
}

function getStatLeaders(weekMatches, points, players) {
  let topSixes = { player: null, count: 0 }, topWickets = { player: null, count: 0 };
  let bestEco = { player: null, eco: 999 }, longestSix = { player: null, found: false };
  for (const [pid, matchPts] of Object.entries(points)) {
    const p = players.find(x => x.id === pid); if (!p) continue;
    let sixes = 0, wickets = 0, totalOvers = 0, hasLongest = false;
    // For economy: track weighted average across matches (runs conceded / overs)
    let totalRunsConceded = 0;
    for (const m of weekMatches) {
      const d = matchPts[m.id]; if (!d?.stats) continue;
      sixes   += +d.stats.sixes   || 0;
      wickets += +d.stats.wickets || 0;
      const ovs = +d.stats.overs  || 0;
      totalOvers += ovs;
      // economy is stored directly (runs conceded per over) — use it to back-calculate runs conceded
      const eco = d.stats.economy !== "" && d.stats.economy != null ? +d.stats.economy : null;
      if (eco !== null && ovs > 0) totalRunsConceded += eco * ovs;
      if (d.stats.longestSix) hasLongest = true;
    }
    if (sixes > topSixes.count) topSixes = { player: p, count: sixes };
    if (wickets > topWickets.count) topWickets = { player: p, count: wickets };
    // Only qualify if bowled at least 2 overs across the week
    if (totalOvers >= 2) {
      const weekEco = Math.round((totalRunsConceded / totalOvers) * 100) / 100;
      if (weekEco < bestEco.eco) bestEco = { player: p, eco: weekEco };
    }
    if (hasLongest && !longestSix.found) longestSix = { player: p, found: true };
  }
  return { topSixes, topWickets, bestEco, longestSix };
}

function generateHeadline(weekTeams, weekMatches, isCurrentWeek) {
  if (weekMatches.length === 0) return isCurrentWeek ? "No matches played yet this week." : "No matches were played last week.";
  const top = weekTeams[0], bottom = weekTeams[weekTeams.length - 1];
  const gap = top.weekPts - bottom.weekPts;
  if (gap > 500) return `${top.name} absolutely dominated with ${top.weekPts} pts — a ${gap} pt gap over ${bottom.name}.`;
  if (gap < 100) return `Incredibly tight week — just ${gap} pts separated ${top.name} and ${bottom.name}.`;
  return `${top.name} led the week with ${top.weekPts} pts while ${bottom.name} had a quieter outing at ${bottom.weekPts}.`;
}

// ── calcBreakdown helper ─────────────────────────────────────────────────────
function calcBreakdown(s) {
  if (!s) return [];
  const runs   = +s.runs      || 0;
  const fours  = +s.fours     || 0;
  const sixes  = +s.sixes     || 0;
  const wkts   = +s.wickets   || 0;
  const eco    = s.economy !== "" && s.economy != null ? +s.economy : null;
  const ovs    = +s.overs     || 0;
  const catches= +s.catches   || 0;
  const stump  = +s.stumpings || 0;
  const ro     = +s.runouts   || 0;
  const items  = [];
  if (runs)    items.push(`${runs} runs +${runs}`);
  if (fours)   items.push(`${fours}×4 +${fours * 8}`);
  if (sixes)   items.push(`${sixes}×6 +${sixes * 12}`);
  if (runs >= 100) items.push("Century +20");
  else if (runs >= 50) items.push("50+ bonus +10");
  if (wkts)    items.push(`${wkts} wkt${wkts > 1 ? "s" : ""} +${wkts * 25}`);
  if (wkts >= 5) items.push("5-wkt haul +15");
  else if (wkts >= 4) items.push("4-wkt haul +8");
  if (ovs >= 2 && eco !== null && eco < 6) items.push("Eco <6 +10");
  if (catches) items.push(`${catches} catch${catches > 1 ? "es" : ""} +${catches * 8}`);
  if (stump)   items.push(`${stump} stumping${stump > 1 ? "s" : ""} +${stump * 12}`);
  if (ro)      items.push(`${ro} run-out${ro > 1 ? "s" : ""} +${ro * 12}`);
  if (runs >= 30 && wkts >= 2) items.push("All-round bonus +15");
  if (s.longestSix) items.push("Longest six +50");
  return items;
}

// ── Player breakdown drawer ───────────────────────────────────────────────────
function PlayerBreakdownDrawer({ player, weekMatches, points, captains, teams, assignments, onClose }) {
  if (!player) return null;
  const team = teams.find(t => t.id === assignments[player.id]);
  const matchRows = weekMatches.map(m => {
    const d = points[player.id]?.[m.id];
    if (!d) return null;
    const cap = captains[m.id + "_" + (assignments[player.id] || "")] || {};
    let pts = d.base, mult = 1, role = "";
    if (cap.captain === player.id) { pts = Math.round(d.base * 2); mult = 2; role = "C"; }
    else if (cap.vc === player.id) { pts = Math.round(d.base * 1.5); mult = 1.5; role = "VC"; }
    return { match: m, base: d.base, pts, mult, role, breakdown: calcBreakdown(d.stats) };
  }).filter(Boolean);
  const totalPts = matchRows.reduce((s, r) => s + r.pts, 0);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(5,8,16,0.7)", zIndex: 600, backdropFilter: "blur(3px)" }} />
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 700, background: T.card, borderRadius: "18px 18px 0 0", border: `1px solid ${T.border}`, maxHeight: "75vh", display: "flex", flexDirection: "column", animation: "wrSlideUp 0.28s cubic-bezier(0.25,0.46,0.45,0.94) both" }}>
        <style>{`@keyframes wrSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
        <div style={{ flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border }} />
          </div>
          <div style={{ padding: "10px 20px 14px", display: "flex", alignItems: "center", gap: 12, borderBottom: `1px solid ${T.border}` }}>
            <PlayerImage player={player} size={46} borderRadius={12} teamColor={team?.color} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 16, color: T.text }}>{player.name}</div>
              <div style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted, marginTop: 1 }}>
                {player.role}{team && <span style={{ color: team.color }}> · {team.name}</span>}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 24, color: T.accent }}>{totalPts}</div>
              <div style={{ fontFamily: fonts.display, fontSize: 8, color: T.muted, letterSpacing: 1 }}>WEEK TOTAL</div>
            </div>
            <button onClick={onClose} style={{ background: T.border, border: "none", borderRadius: 8, width: 28, height: 28, color: T.sub, fontSize: 13, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>
        </div>
        <div style={{ overflowY: "auto", flex: 1, padding: "10px 20px 24px" }}>
          {matchRows.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: T.muted, fontFamily: fonts.body, fontSize: 13 }}>No stats recorded for this player this week.</div>
          ) : matchRows.map(r => (
            <div key={r.match.id} style={{ background: T.bg, borderRadius: 10, border: `1px solid ${T.border}`, padding: "12px 14px", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <div style={{ fontFamily: fonts.body, fontWeight: 700, fontSize: 13, color: T.text }}>{r.match.team1} vs {r.match.team2}</div>
                  <div style={{ fontFamily: fonts.body, fontSize: 10, color: T.muted, marginTop: 1 }}>M{r.match.matchNum} · {r.match.date}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 22, color: r.pts > 0 ? T.accent : T.muted }}>{r.pts}</div>
                  {r.mult > 1 && <div style={{ fontFamily: fonts.display, fontSize: 9, color: r.mult === 2 ? T.accent : "#94A3B8", letterSpacing: 0.5 }}>{r.role} · base {r.base} ×{r.mult}</div>}
                </div>
              </div>
              {r.role && (
                <div style={{ display: "inline-block", background: r.mult === 2 ? T.accentBg : "#94A3B822", border: `1px solid ${r.mult === 2 ? T.accentBorder : "#94A3B844"}`, borderRadius: 6, padding: "2px 8px", fontFamily: fonts.display, fontSize: 9, fontWeight: 700, color: r.mult === 2 ? T.accent : "#94A3B8", letterSpacing: 1, marginBottom: 8 }}>
                  {r.mult === 2 ? "⭐ CAPTAIN 2×" : "🥈 VICE CAPTAIN 1.5×"}
                </div>
              )}
              {r.breakdown.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {r.breakdown.map((item, j) => (
                    <div key={j} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: "3px 8px", fontFamily: fonts.body, fontSize: 11, color: T.sub }}>{item}</div>
                  ))}
                </div>
              ) : (
                <div style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted, fontStyle: "italic" }}>No contributions recorded</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function StatPill({ emoji, label, name, value, unit, color, onClick, player }) {
  return (
    <div onClick={onClick} style={{ background: color + "12", border: `1px solid ${color}33`, borderRadius: 10, padding: "10px 12px", cursor: onClick ? "pointer" : "default" }}>
      <div style={{ fontFamily: fonts.display, fontSize: 9, fontWeight: 700, color, letterSpacing: 1.5, marginBottom: 7 }}>{emoji} {label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
        {player && <PlayerImage player={player} size={32} borderRadius={8} />}
        <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 18, color }}>
          {value} <span style={{ fontSize: 10, fontWeight: 400, color: T.muted }}>{unit}</span>
        </div>
        {onClick && <div style={{ fontFamily: fonts.display, fontSize: 8, color, opacity: 0.6, letterSpacing: 0.5 }}>TAP ▸</div>}
      </div>
    </div>
  );
}

function WeekCard({ week, weekMatches, teams, players, assignments, points, captains, ownershipLog, isCurrentWeek, weekOffset }) {
  const [expanded, setExpanded] = useState(isCurrentWeek);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const weekLabel = isCurrentWeek ? "📅 THIS WEEK" : weekOffset === 1 ? "📋 LAST WEEK" : `📋 ${weekOffset} WEEKS AGO`;
  const weekTeams = teams.map(t => ({ ...t, weekPts: getTeamWeekPts(t.id, weekMatches, points, captains, players, assignments, ownershipLog) })).sort((a, b) => b.weekPts - a.weekPts);
  const totalLeaguePts = weekTeams.reduce((s, t) => s + t.weekPts, 0);
  const { topSixes, topWickets, bestEco, longestSix } = getStatLeaders(weekMatches, points, players);
  const medals = ["🥇", "🥈", "🥉", "#4"];

  let topScorer = null, topScorerPts = 0;
  for (const [pid, matchPts] of Object.entries(points)) {
    const pts = weekMatches.reduce((s, m) => s + (matchPts[m.id]?.base || 0), 0);
    if (pts > topScorerPts) { topScorerPts = pts; topScorer = players.find(p => p.id === pid); }
  }
  const topScorerTeam = topScorer ? teams.find(t => t.id === assignments[topScorer.id]) : null;
  const headline = generateHeadline(weekTeams, weekMatches, isCurrentWeek);

  return (
    <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${isCurrentWeek ? T.accentBorder : T.border}`, overflow: "hidden", marginBottom: 14 }}>
      {selectedPlayer && (
        <PlayerBreakdownDrawer
          player={selectedPlayer}
          weekMatches={weekMatches}
          points={points}
          captains={captains}
          teams={teams}
          assignments={assignments}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
      <div onClick={() => setExpanded(e => !e)} style={{ padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", background: isCurrentWeek ? T.accentBg : "transparent" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 16, color: isCurrentWeek ? T.accent : T.text, letterSpacing: 0.5 }}>
              {weekLabel}
            </div>
            {isCurrentWeek && <span style={{ fontFamily: fonts.display, fontSize: 8, fontWeight: 700, letterSpacing: 1, background: T.successBg, border: `1px solid ${T.success}33`, color: T.success, borderRadius: 4, padding: "2px 6px" }}>IN PROGRESS</span>}
          </div>
          <div style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted }}>{week.label} · {weekMatches.length} match{weekMatches.length !== 1 ? "es" : ""}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 19, color: T.text }}>{totalLeaguePts.toLocaleString()}</div>
            <div style={{ fontFamily: fonts.display, fontSize: 9, color: T.muted, letterSpacing: 1 }}>TOTAL PTS</div>
          </div>
          <div style={{ color: T.muted, fontSize: 10, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.25s" }}>▼</div>
        </div>
      </div>

      {expanded && weekMatches.length === 0 && (
        <div style={{ padding: "18px", textAlign: "center", fontFamily: fonts.body, color: T.muted, fontSize: 13, borderTop: `1px solid ${T.border}` }}>
          {isCurrentWeek ? "No matches yet this week — check back soon." : "No matches were played last week."}
        </div>
      )}

      {expanded && weekMatches.length > 0 && (
        <div style={{ borderTop: `1px solid ${T.border}` }}>
          {/* Headline */}
          <div style={{ margin: "14px 18px 0", background: T.accentBg, border: `1px solid ${T.accentBorder}`, borderRadius: 9, padding: "11px 14px" }}>
            <div style={{ fontFamily: fonts.body, fontSize: 13, color: T.accent, lineHeight: 1.5, fontStyle: "italic" }}>"{headline}"</div>
          </div>

          {/* Matches */}
          <div style={{ padding: "13px 18px 0" }}>
            <div style={{ fontFamily: fonts.display, fontSize: 9, color: T.muted, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>MATCHES THIS WEEK</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {weekMatches.map(m => (
                <div key={m.id} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, padding: "4px 10px", fontFamily: fonts.body, fontSize: 11, color: T.sub }}>
                  {m.team1} vs {m.team2} <span style={{ color: T.muted }}>· {m.date}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Team standings */}
          <div style={{ padding: "13px 18px 0" }}>
            <div style={{ fontFamily: fonts.display, fontSize: 9, color: T.muted, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>WEEKLY TEAM STANDINGS</div>
            {weekTeams.map((team, i) => {
              const maxPts = weekTeams[0].weekPts || 1;
              return (
                <div key={team.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < weekTeams.length - 1 ? `1px solid ${T.border}22` : "none", position: "relative" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(team.weekPts / maxPts) * 100}%`, background: team.color + "0A", borderRight: `1px solid ${team.color}22` }} />
                  <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
                    <div style={{ fontSize: 15, minWidth: 26 }}>{medals[i]}</div>
                    <div style={{ flex: 1, fontFamily: fonts.display, fontWeight: 700, fontSize: 13, color: team.color }}>{team.name}</div>
                    <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 17, color: T.text }}>{team.weekPts.toLocaleString()} <span style={{ fontFamily: fonts.body, fontSize: 10, color: T.muted, fontWeight: 400 }}>pts</span></div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Player highlights */}
          <div style={{ padding: "13px 18px 0" }}>
            <div style={{ fontFamily: fonts.display, fontSize: 9, color: T.muted, letterSpacing: 2, fontWeight: 700, marginBottom: 10 }}>PLAYER HIGHLIGHTS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {topScorer && (
                <div onClick={() => setSelectedPlayer(topScorer)} style={{ gridColumn: "1 / -1", background: T.accentBg, border: `1px solid ${T.accentBorder}`, borderRadius: 10, padding: "11px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                  <PlayerImage player={topScorer} size={44} borderRadius={11} teamColor={topScorerTeam?.color} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: fonts.display, fontSize: 9, fontWeight: 700, color: T.accent, letterSpacing: 1.5, marginBottom: 2 }}>⭐ TOP SCORER</div>
                    <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 14, color: T.text }}>{topScorer.name}</div>
                    <div style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted }}>{topScorer.role}{topScorerTeam && <span style={{ color: topScorerTeam.color }}> · {topScorerTeam.name}</span>}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 22, color: T.accent }}>{topScorerPts}</div>
                    <div style={{ fontFamily: fonts.display, fontSize: 9, color: T.muted }}>BASE PTS</div>
                  </div>
                </div>
              )}
              {topSixes.player && topSixes.count > 0 && <StatPill emoji="💥" label="MOST SIXES" name={topSixes.player.name} value={topSixes.count} unit="6s" color="#F97316" player={topSixes.player} onClick={() => setSelectedPlayer(topSixes.player)} />}
              {topWickets.player && topWickets.count > 0 && <StatPill emoji="🎳" label="MOST WICKETS" name={topWickets.player.name} value={topWickets.count} unit="wkts" color={T.info} player={topWickets.player} onClick={() => setSelectedPlayer(topWickets.player)} />}
              {bestEco.player && bestEco.eco < 999 && <StatPill emoji="📐" label="BEST ECONOMY" name={bestEco.player.name} value={bestEco.eco} unit="eco" color={T.success} player={bestEco.player} onClick={() => setSelectedPlayer(bestEco.player)} />}
              {longestSix.player && <StatPill emoji="🚀" label="LONGEST SIX" name={longestSix.player.name} value="🏆" unit="" color={T.purple} player={longestSix.player} onClick={() => setSelectedPlayer(longestSix.player)} />}
            </div>
          </div>

          {/* Form bars */}
          <div style={{ padding: "13px 18px 16px" }}>
            <div style={{ fontFamily: fonts.display, fontSize: 9, color: T.muted, letterSpacing: 2, fontWeight: 700, marginBottom: 10 }}>FORM (LAST 3 MATCHES)</div>
            {teams.map(team => {
              const streak = weekMatches.slice(-3).map(m => getTeamWeekPts(team.id, [m], points, captains, players, assignments, ownershipLog));
              const maxStreak = Math.max(...streak, 1);
              return (
                <div key={team.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 90, fontFamily: fonts.display, fontWeight: 700, fontSize: 11, color: team.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{team.name}</div>
                  <div style={{ flex: 1, display: "flex", gap: 4 }}>
                    {streak.length === 0 ? <span style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted }}>No data</span> : streak.map((pts, i) => (
                      <div key={i} style={{ flex: 1, background: T.bg, borderRadius: 5, overflow: "hidden", height: 26, position: "relative" }}>
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${(pts / maxStreak) * 100}%`, background: team.color + "88", borderRadius: "3px 3px 0 0" }} />
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fonts.display, fontSize: 9, fontWeight: 700, color: T.text }}>{pts}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function WeeklyReport({ teams, players, assignments, points, captains, matches, ownershipLog, onClose }) {
  const sharedProps = { teams, players, assignments, points, captains, ownershipLog };

  // Build list of weeks: current + all past weeks that have completed matches.
  // offset=0 → this Sat–Fri week, offset=1 → last week, offset=2 → week before, etc.
  const weeks = [];
  for (let offset = 0; offset <= 12; offset++) {
    const week = getWeekRange(offset);
    const wm = getWeekMatches(matches, week);
    if (offset === 0 || wm.length > 0) {
      weeks.push({ week, weekMatches: wm, isCurrentWeek: offset === 0 });
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(5,8,16,0.97)", zIndex: 400, display: "flex", flexDirection: "column", fontFamily: fonts.body }}>
      <style>{`@import url('${FONT_URL}');`}</style>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: T.card, flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 20, color: T.accent, letterSpacing: 1 }}>📋 WEEKLY REPORT</div>
          <div style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted, marginTop: 2 }}>League summary · Sat–Fri IST</div>
        </div>
        <button onClick={onClose} style={{ background: T.border, border: "none", borderRadius: 8, width: 30, height: 30, color: T.sub, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
        {weeks.map(({ week, weekMatches, isCurrentWeek }, idx) => (
          <WeekCard key={week.startStr} week={week} weekMatches={weekMatches} isCurrentWeek={isCurrentWeek} weekOffset={idx} {...sharedProps} />
        ))}
      </div>
    </div>
  );
}
