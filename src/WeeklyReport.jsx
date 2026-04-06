import React, { useState } from "react";

// Get Monday of a given week offset (0 = current, -1 = last week)
function getWeekRange(offset = 0) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return {
    start: monday,
    end: sunday,
    startStr: monday.toISOString().split("T")[0],
    endStr: sunday.toISOString().split("T")[0],
    label: monday.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) +
      " – " + sunday.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
  };
}

function getWeekMatches(matches, week) {
  return matches.filter(m =>
    m.status === "completed" && m.date &&
    m.date >= week.startStr && m.date <= week.endStr
  );
}

function getTeamWeekPts(teamId, weekMatches, points, captains, players, assignments, ownershipLog) {
  let total = 0;
  const allPids = new Set([
    ...players.filter(p => assignments[p.id] === teamId).map(p => p.id),
    ...Object.entries(ownershipLog || {}).filter(([, periods]) => periods.some(o => o.teamId === teamId)).map(([pid]) => pid),
  ]);
  for (const pid of allPids) {
    const periods = (ownershipLog?.[pid] || []).filter(o => o.teamId === teamId);
    for (const m of weekMatches) {
      const d = points?.[pid]?.[m.id];
      if (!d) continue;
      const matchDate = new Date(m.date);
      const owned = periods.length === 0
        ? assignments[pid] === teamId
        : periods.some(o => matchDate >= new Date(o.from) && matchDate <= (o.to ? new Date(o.to) : new Date("2099-01-01")));
      if (!owned) continue;
      const cap = captains?.[m.id + "_" + teamId] || {};
      let pts = d.base;
      if (cap.captain === pid) pts *= 2;
      else if (cap.vc === pid) pts *= 1.5;
      total += Math.round(pts);
    }
  }
  return total;
}

function getPlayerWeekPts(pid, weekMatches, points) {
  return weekMatches.reduce((s, m) => s + (points?.[pid]?.[m.id]?.base || 0), 0);
}

function getStatLeaders(weekMatches, points, players) {
  let topSixes = { player: null, count: 0 };
  let topWickets = { player: null, count: 0 };
  let bestEco = { player: null, eco: 999, overs: 0 };
  let longestSix = { player: null, found: false };

  for (const [pid, matchPts] of Object.entries(points)) {
    const p = players.find(x => x.id === pid);
    if (!p) continue;
    let sixes = 0, wickets = 0, runs = 0, overs = 0, hasLongest = false;
    for (const m of weekMatches) {
      const d = matchPts[m.id];
      if (!d?.stats) continue;
      sixes += +d.stats.sixes || 0;
      wickets += +d.stats.wickets || 0;
      runs += +d.stats.runs || 0;
      overs += +d.stats.overs || 0;
      if (d.stats.longestSix) hasLongest = true;
    }
    if (sixes > topSixes.count) { topSixes = { player: p, count: sixes }; }
    if (wickets > topWickets.count) { topWickets = { player: p, count: wickets }; }
    if (overs >= 2) {
      const eco = runs / overs;
      if (eco < bestEco.eco) { bestEco = { player: p, eco: Math.round(eco * 100) / 100, overs }; }
    }
    if (hasLongest && !longestSix.found) { longestSix = { player: p, found: true }; }
  }
  return { topSixes, topWickets, bestEco, longestSix };
}

function getFormStreak(teamId, matches, points, captains, players, assignments, ownershipLog) {
  const completed = [...matches].filter(m => m.status === "completed").sort((a, b) => b.date.localeCompare(a.date));
  const last3 = completed.slice(0, 3);
  return last3.map(m => {
    const pts = getTeamWeekPts(teamId, [m], points, captains, players, assignments, ownershipLog);
    return pts;
  });
}

function generateHeadline(weekTeams, weekMatches, isCurrentWeek) {
  if (weekMatches.length === 0) return isCurrentWeek ? "No matches played yet this week." : "No matches were played last week.";
  const top = weekTeams[0];
  const bottom = weekTeams[weekTeams.length - 1];
  const gap = top.weekPts - bottom.weekPts;
  if (gap > 500) return `${top.name} absolutely dominated with ${top.weekPts} pts — a ${gap} pt gap over ${bottom.name}.`;
  if (gap < 100) return `Incredibly tight week — just ${gap} pts separated ${top.name} and ${bottom.name}.`;
  return `${top.name} led the week with ${top.weekPts} pts while ${bottom.name} had a quieter outing at ${bottom.weekPts}.`;
}

// ── WEEK CARD ───────────────────────────────────────────────────────────────
function WeekCard({ week, weekMatches, teams, players, assignments, points, captains, ownershipLog, isCurrentWeek }) {
  const [expanded, setExpanded] = useState(isCurrentWeek);

  const weekTeams = teams.map(t => ({
    ...t,
    weekPts: getTeamWeekPts(t.id, weekMatches, points, captains, players, assignments, ownershipLog),
  })).sort((a, b) => b.weekPts - a.weekPts);

  const totalLeaguePts = weekTeams.reduce((s, t) => s + t.weekPts, 0);
  const { topSixes, topWickets, bestEco, longestSix } = getStatLeaders(weekMatches, points, players);

  // Top scorer this week
  let topScorer = null, topScorerPts = 0;
  for (const [pid, matchPts] of Object.entries(points)) {
    const pts = getPlayerWeekPts(pid, weekMatches, matchPts);
    if (pts > topScorerPts) { topScorerPts = pts; topScorer = players.find(p => p.id === pid); }
  }
  const topScorerTeam = topScorer ? teams.find(t => t.id === assignments[topScorer.id]) : null;

  const headline = generateHeadline(weekTeams, weekMatches, isCurrentWeek);
  const medals = ["🥇", "🥈", "🥉", "#4"];

  return (
    <div style={{ background: "#0A0F1A", borderRadius: 16, border: `1px solid ${isCurrentWeek ? "#F5A62344" : "#1E2D45"}`, overflow: "hidden", marginBottom: 16 }}>
      {/* Week header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", background: isCurrentWeek ? "#F5A62308" : "transparent" }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 18, color: isCurrentWeek ? "#F5A623" : "#E2EAF4", letterSpacing: 1 }}>
              {isCurrentWeek ? "📅 THIS WEEK" : "📋 LAST WEEK"}
            </div>
            {isCurrentWeek && <span style={{ fontSize: 9, background: "#2ECC7122", border: "1px solid #2ECC7133", color: "#2ECC71", borderRadius: 4, padding: "2px 6px", fontWeight: 700 }}>IN PROGRESS</span>}
          </div>
          <div style={{ fontSize: 11, color: "#4A5E78" }}>{week.label} · {weekMatches.length} match{weekMatches.length !== 1 ? "es" : ""}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 20, color: "#E2EAF4" }}>{totalLeaguePts.toLocaleString()}</div>
            <div style={{ fontSize: 9, color: "#4A5E78", letterSpacing: 1 }}>TOTAL PTS</div>
          </div>
          <div style={{ color: "#4A5E78", fontSize: 12, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.25s" }}>▼</div>
        </div>
      </div>

      {expanded && weekMatches.length === 0 && (
        <div style={{ padding: "20px", textAlign: "center", color: "#4A5E78", fontSize: 13, borderTop: "1px solid #1E2D45" }}>
          {isCurrentWeek ? "No matches yet this week — check back soon." : "No matches were played last week."}
        </div>
      )}

      {expanded && weekMatches.length > 0 && (
        <div style={{ borderTop: "1px solid #1E2D45" }}>

          {/* Headline */}
          <div style={{ margin: "16px 20px 0", background: "#F5A62311", border: "1px solid #F5A62333", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 13, color: "#F5A623", lineHeight: 1.5, fontStyle: "italic" }}>"{headline}"</div>
          </div>

          {/* Matches played */}
          <div style={{ padding: "14px 20px 0" }}>
            <div style={{ fontSize: 10, color: "#4A5E78", letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>MATCHES THIS WEEK</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {weekMatches.map(m => (
                <div key={m.id} style={{ background: "#080C14", border: "1px solid #1E2D45", borderRadius: 8, padding: "5px 10px", fontSize: 11, color: "#94A3B8" }}>
                  {m.team1} vs {m.team2} <span style={{ color: "#4A5E78" }}>· {m.date}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Team Rankings this week */}
          <div style={{ padding: "14px 20px 0" }}>
            <div style={{ fontSize: 10, color: "#4A5E78", letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>WEEKLY TEAM STANDINGS</div>
            {weekTeams.map((team, i) => {
              const maxPts = weekTeams[0].weekPts || 1;
              return (
                <div key={team.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < weekTeams.length - 1 ? "1px solid #1E2D4433" : "none", position: "relative" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(team.weekPts / maxPts) * 100}%`, background: team.color + "0A", borderRight: `1px solid ${team.color}22` }} />
                  <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
                    <div style={{ fontSize: 16, minWidth: 28 }}>{medals[i]}</div>
                    <div style={{ flex: 1, fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 14, color: team.color }}>{team.name}</div>
                    <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 18, color: "#E2EAF4" }}>
                      {team.weekPts.toLocaleString()} <span style={{ fontSize: 10, color: "#4A5E78", fontWeight: 400 }}>pts</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Player Highlights */}
          <div style={{ padding: "14px 20px 0" }}>
            <div style={{ fontSize: 10, color: "#4A5E78", letterSpacing: 2, fontWeight: 700, marginBottom: 10 }}>PLAYER HIGHLIGHTS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>

              {/* Top scorer */}
              {topScorer && (
                <div style={{ gridColumn: "1 / -1", background: "#F5A62311", border: "1px solid #F5A62333", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: topScorerTeam ? topScorerTeam.color + "22" : "#F5A62322", border: `1px solid ${topScorerTeam ? topScorerTeam.color + "44" : "#F5A62344"}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 16, color: topScorerTeam?.color || "#F5A623", flexShrink: 0 }}>
                    {topScorer.name.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: "#F5A623", letterSpacing: 1, marginBottom: 2 }}>⭐ TOP SCORER</div>
                    <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 15, color: "#E2EAF4" }}>{topScorer.name}</div>
                    <div style={{ fontSize: 11, color: "#4A5E78" }}>{topScorer.role}{topScorerTeam && <span style={{ color: topScorerTeam.color }}> · {topScorerTeam.name}</span>}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 24, color: "#F5A623" }}>{topScorerPts}</div>
                    <div style={{ fontSize: 9, color: "#4A5E78" }}>BASE PTS</div>
                  </div>
                </div>
              )}

              {/* Most sixes */}
              {topSixes.player && topSixes.count > 0 && (
                <StatPill emoji="💥" label="MOST SIXES" name={topSixes.player.name} value={topSixes.count} unit="6s" color="#F97316" />
              )}

              {/* Most wickets */}
              {topWickets.player && topWickets.count > 0 && (
                <StatPill emoji="🎳" label="MOST WICKETS" name={topWickets.player.name} value={topWickets.count} unit="wkts" color="#4F8EF7" />
              )}

              {/* Best economy */}
              {bestEco.player && bestEco.eco < 999 && (
                <StatPill emoji="📐" label="BEST ECONOMY" name={bestEco.player.name} value={bestEco.eco} unit="eco" color="#2ECC71" />
              )}

              {/* Longest six */}
              {longestSix.player && (
                <StatPill emoji="🚀" label="LONGEST SIX" name={longestSix.player.name} value="🏆" unit="" color="#A855F7" />
              )}
            </div>
          </div>

          {/* Form streaks */}
          <div style={{ padding: "14px 20px 16px" }}>
            <div style={{ fontSize: 10, color: "#4A5E78", letterSpacing: 2, fontWeight: 700, marginBottom: 10 }}>FORM (LAST 3 MATCHES)</div>
            {teams.map(team => {
              const streak = getFormStreak(team.id, weekMatches, points, captains, players, assignments, ownershipLog);
              const maxStreak = Math.max(...streak, 1);
              return (
                <div key={team.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 90, fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 12, color: team.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{team.name}</div>
                  <div style={{ flex: 1, display: "flex", gap: 4 }}>
                    {streak.length === 0 ? <span style={{ fontSize: 11, color: "#4A5E78" }}>No data</span> : streak.map((pts, i) => (
                      <div key={i} style={{ flex: 1, background: "#080C14", borderRadius: 6, overflow: "hidden", height: 28, position: "relative" }}>
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${(pts / maxStreak) * 100}%`, background: team.color + "88", borderRadius: "4px 4px 0 0" }} />
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#E2EAF4", fontWeight: 700 }}>{pts}</div>
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

function StatPill({ emoji, label, name, value, unit, color }) {
  return (
    <div style={{ background: color + "11", border: `1px solid ${color}33`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, color: color, letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>{emoji} {label}</div>
      <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 13, color: "#E2EAF4", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
      <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 18, color }}>
        {value} <span style={{ fontSize: 10, fontWeight: 400, color: "#4A5E78" }}>{unit}</span>
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function WeeklyReport({ teams, players, assignments, points, captains, matches, ownershipLog, onClose }) {
  const currentWeek = getWeekRange(0);
  const lastWeek = getWeekRange(-1);
  const currentMatches = getWeekMatches(matches, currentWeek);
  const lastMatches = getWeekMatches(matches, lastWeek);

  const sharedProps = { teams, players, assignments, points, captains, ownershipLog };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(5,8,16,0.97)", zIndex: 400, display: "flex", flexDirection: "column", fontFamily: "Barlow Condensed,sans-serif" }}>
      {/* Header */}
      <div style={{ padding: "18px 20px", borderBottom: "1px solid #1E2D45", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#080C14", flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 22, color: "#F5A623", letterSpacing: 2 }}>📋 WEEKLY REPORT</div>
          <div style={{ fontSize: 11, color: "#4A5E78", marginTop: 2 }}>League summary week by week</div>
        </div>
        <button onClick={onClose} style={{ background: "#1E2D45", border: "none", borderRadius: 8, width: 32, height: 32, color: "#94A3B8", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        <WeekCard week={currentWeek} weekMatches={currentMatches} isCurrentWeek={true} {...sharedProps} />
        <WeekCard week={lastWeek} weekMatches={lastMatches} isCurrentWeek={false} {...sharedProps} />
      </div>
    </div>
  );
}
