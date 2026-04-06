import React, { useState, useEffect, useRef } from "react";

const SB_URL = "https://rmcxhorijitrhqyrvvkn.supabase.co/rest/v1/league_data";
const SB_KEY = "sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm";
const sbGet = async (key) => {
  try {
    const res = await fetch(SB_URL + "?key=eq." + encodeURIComponent(key), {
      headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY },
    });
    const d = await res.json();
    return d[0]?.value;
  } catch { return null; }
};

function calcPoints(stats, cfg = {}) {
  const c = { run:1, four:8, six:12, fifty:10, century:20, wicket:25, catch:8, stumping:12, runout:12, economy:10, allround:15, ...cfg };
  const runs = +stats.runs || 0, fours = +stats.fours || 0, sixes = +stats.sixes || 0;
  const wkts = +stats.wickets || 0, catches = +stats.catches || 0;
  const stumpings = +stats.stumpings || 0, runouts = +stats.runouts || 0;
  const overs = +stats.overs || 0;
  let p = runs * c.run + fours * c.four + sixes * c.six;
  if (runs >= 100) p += c.century;
  else if (runs >= 50) p += c.fifty;
  p += wkts * c.wicket;
  if (wkts >= 5) p += 15; else if (wkts >= 4) p += 8;
  if (overs > 0) { const eco = runs / overs; if (eco < 6) p += c.economy; }
  p += catches * c.catch + stumpings * c.stumping + runouts * c.runout;
  if (runs >= 30 && wkts >= 2) p += c.allround;
  if (stats.longestSix) p += 50;
  return Math.round(p);
}

// ── LIVE COUNTDOWN ─────────────────────────────────────────────────────────
function LiveCountdown({ matches }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const upcoming = matches
    .filter(m => m.status !== "completed" && m.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const live = matches.filter(m => m.status === "live");
  const next = upcoming[0];

  if (live.length > 0) {
    const m = live[0];
    return (
      <div style={cardStyle("#FF3D5A")}>
        <div style={pulsingDot("#FF3D5A")} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: "#FF3D5A", letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>🔴 LIVE NOW</div>
          <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 20, fontWeight: 800, color: "#E2EAF4", letterSpacing: 1 }}>
            {m.team1} <span style={{ color: "#4A5E78" }}>vs</span> {m.team2}
          </div>
          {m.venue && <div style={{ fontSize: 11, color: "#4A5E78", marginTop: 2 }}>{m.venue}</div>}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 28, fontWeight: 800, color: "#FF3D5A" }}>LIVE</div>
        </div>
      </div>
    );
  }

  if (!next) return (
    <div style={cardStyle("#4A5E78")}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: "#4A5E78", letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>NEXT MATCH</div>
        <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 18, fontWeight: 700, color: "#4A5E78" }}>No upcoming matches scheduled</div>
      </div>
    </div>
  );

  // Parse match datetime
  const matchTime = next.time
    ? new Date(next.date + "T" + (next.time.length === 5 ? next.time + ":00" : next.time))
    : new Date(next.date + "T14:00:00"); // default 2PM if no time
  const diff = matchTime - now;
  const isToday = new Date(next.date).toDateString() === new Date().toDateString();
  const isTomorrow = new Date(next.date).toDateString() === new Date(Date.now() + 86400000).toDateString();

  let timeLabel = "";
  if (diff < 0) timeLabel = "Starting soon";
  else if (diff < 3600000) {
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    timeLabel = `${m}m ${s}s`;
  } else if (diff < 86400000) {
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    timeLabel = `${h}h ${m}m`;
  } else {
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    timeLabel = `${d}d ${h}h`;
  }

  const dayLabel = diff < 0 ? "STARTING" : isToday ? "TODAY" : isTomorrow ? "TOMORROW" : new Date(next.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }).toUpperCase();

  return (
    <div style={cardStyle("#F5A623")}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ fontSize: 10, color: "#F5A623", letterSpacing: 2, fontWeight: 700 }}>🏏 NEXT MATCH</div>
          <div style={{ fontSize: 9, background: "#F5A62322", border: "1px solid #F5A62344", borderRadius: 4, padding: "1px 6px", color: "#F5A623", fontWeight: 700 }}>{dayLabel}</div>
        </div>
        <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 20, fontWeight: 800, color: "#E2EAF4", letterSpacing: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {next.team1} <span style={{ color: "#4A5E78" }}>vs</span> {next.team2}
        </div>
        {next.venue && <div style={{ fontSize: 11, color: "#4A5E78", marginTop: 2 }}>{next.venue}</div>}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
        <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: diff < 3600000 && diff > 0 ? 22 : 28, fontWeight: 800, color: diff < 3600000 && diff > 0 ? "#FF3D5A" : "#F5A623", letterSpacing: 1 }}>{timeLabel}</div>
        <div style={{ fontSize: 9, color: "#4A5E78", letterSpacing: 1 }}>UNTIL MATCH</div>
      </div>
    </div>
  );
}

// ── LEADERBOARD SNAPSHOT ────────────────────────────────────────────────────
function LeaderboardSnapshot({ leaderboard, totalMatches }) {
  const medals = ["🥇", "🥈", "🥉"];
  const max = leaderboard[0]?.total || 1;

  return (
    <div style={{ background: "#0E1521", borderRadius: 14, border: "1px solid #1E2D45", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #1E2D45", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 15, color: "#F5A623", letterSpacing: 2 }}>🏆 LEADERBOARD</div>
        <div style={{ fontSize: 11, color: "#4A5E78" }}>{totalMatches} match{totalMatches !== 1 ? "es" : ""} played</div>
      </div>
      {leaderboard.length === 0 ? (
        <div style={{ padding: "24px", textAlign: "center", color: "#4A5E78", fontSize: 13 }}>No data yet</div>
      ) : leaderboard.map((team, i) => {
        const barPct = max > 0 ? (team.total / max) * 100 : 0;
        const prev = team.prevRank || i + 1;
        const curr = i + 1;
        const trend = prev > curr ? "↑" : prev < curr ? "↓" : "—";
        const trendColor = prev > curr ? "#2ECC71" : prev < curr ? "#FF3D5A" : "#4A5E78";
        return (
          <div key={team.id} style={{ padding: "12px 18px", borderBottom: i < leaderboard.length - 1 ? "1px solid #1E2D4533" : "none", position: "relative" }}>
            {/* Progress bar bg */}
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: barPct + "%", background: team.color + "08", transition: "width 0.8s ease", borderRight: "1px solid " + team.color + "22" }} />
            <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 22, minWidth: 30 }}>{medals[i] || "#" + (i + 1)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 15, color: team.color, letterSpacing: 0.5 }}>{team.name}</div>
              </div>
              <div style={{ fontSize: 11, color: trendColor, fontWeight: 700, minWidth: 16, textAlign: "center" }}>{trend}</div>
              <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 22, color: "#E2EAF4", minWidth: 60, textAlign: "right" }}>
                {team.total.toLocaleString()}
                <span style={{ fontSize: 10, color: "#4A5E78", fontWeight: 400, marginLeft: 3 }}>pts</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── ACTIVITY FEED ───────────────────────────────────────────────────────────
function ActivityFeed({ activities }) {
  if (activities.length === 0) return (
    <div style={{ background: "#0E1521", borderRadius: 14, border: "1px solid #1E2D45", padding: "24px", textAlign: "center", color: "#4A5E78", fontSize: 13 }}>
      Activity will appear here as the season progresses
    </div>
  );

  return (
    <div style={{ background: "#0E1521", borderRadius: 14, border: "1px solid #1E2D45", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #1E2D45" }}>
        <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 15, color: "#4F8EF7", letterSpacing: 2 }}>⚡ ACTIVITY FEED</div>
      </div>
      <div style={{ maxHeight: 320, overflowY: "auto" }}>
        {activities.map((act, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 18px", borderBottom: i < activities.length - 1 ? "1px solid #1E2D4522" : "none", background: i === 0 ? "#4F8EF708" : "transparent" }}>
            <div style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{act.emoji}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "#E2EAF4", lineHeight: 1.4 }} dangerouslySetInnerHTML={{ __html: act.text }} />
              <div style={{ fontSize: 10, color: "#4A5E78", marginTop: 3 }}>{act.time}</div>
            </div>
            {act.badge && (
              <div style={{ fontSize: 9, background: act.badgeColor + "22", border: "1px solid " + act.badgeColor + "44", color: act.badgeColor, borderRadius: 4, padding: "2px 6px", fontWeight: 700, letterSpacing: 0.5, flexShrink: 0 }}>
                {act.badge}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MAIN HomeHub ─────────────────────────────────────────────────────────────
export default function HomeHub({ pitchId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pitchId) return;
    (async () => {
      try {
        const [teams, players, assignments, matches, points, captains, transfers, snatch, ownershipLog, pointsConfig] = await Promise.all([
          sbGet(pitchId + "_teams"),
          sbGet(pitchId + "_players"),
          sbGet(pitchId + "_assignments"),
          sbGet(pitchId + "_matches"),
          sbGet(pitchId + "_points"),
          sbGet(pitchId + "_captains"),
          sbGet(pitchId + "_transfers"),
          sbGet(pitchId + "_snatch"),
          sbGet(pitchId + "_ownershipLog"),
          sbGet(pitchId + "_pointsConfig"),
        ]);
        setData({ teams: teams||[], players: players||[], assignments: assignments||{}, matches: matches||[], points: points||{}, captains: captains||{}, transfers: transfers||{}, snatch: snatch||{}, ownershipLog: ownershipLog||{}, pointsConfig: pointsConfig||{} });
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [pitchId]);

  if (!pitchId) return null;

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ fontSize: 13, color: "#4A5E78", letterSpacing: 2 }}>LOADING LEAGUE DATA…</div>
    </div>
  );

  if (!data || !data.teams?.length) return null;

  const { teams, players, assignments, matches, points, captains, transfers, snatch, ownershipLog, pointsConfig } = data;

  // ── Compute leaderboard ──
  const getTeamTotal = (teamId) => {
    let total = 0;
    const allPids = new Set(players.filter(p => assignments[p.id] === teamId).map(p => p.id));
    Object.entries(ownershipLog).forEach(([pid, periods]) => {
      if (periods.some(o => o.teamId === teamId)) allPids.add(pid);
    });
    for (const pid of allPids) {
      const periods = (ownershipLog[pid] || []).filter(o => o.teamId === teamId);
      for (const [mid, d] of Object.entries(points[pid] || {})) {
        const m = matches.find(x => x.id === mid);
        if (!m) continue;
        const matchDate = new Date(m.date);
        const owned = periods.length === 0
          ? assignments[pid] === teamId
          : periods.some(o => {
              const from = new Date(o.from);
              const to = o.to ? new Date(o.to) : new Date("2099-01-01");
              return matchDate >= from && matchDate <= to;
            });
        if (!owned) continue;
        const cap = captains[mid + "_" + teamId] || {};
        let pts = d.base;
        if (cap.captain === pid) pts *= 2;
        else if (cap.vc === pid) pts *= 1.5;
        total += Math.round(pts);
      }
    }
    return total;
  };

  const leaderboard = [...teams]
    .map(t => ({ ...t, total: getTeamTotal(t.id) }))
    .sort((a, b) => b.total - a.total);

  const completedMatches = matches.filter(m => m.status === "completed");
  const totalMatches = completedMatches.length;

  // ── Build activity feed ──
  const activities = [];
  const timeAgo = (dateStr) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const d = Math.floor(diff / 86400000);
    const h = Math.floor(diff / 3600000);
    const m = Math.floor(diff / 60000);
    if (d > 0) return d + "d ago";
    if (h > 0) return h + "h ago";
    if (m > 0) return m + "m ago";
    return "just now";
  };

  // Completed matches
  const recentMatches = [...completedMatches]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 3);

  for (const m of recentMatches) {
    // Find top scorer across all teams for this match
    let topPid = null, topPts = 0;
    for (const [pid, matchPts] of Object.entries(points)) {
      if (matchPts[m.id] && matchPts[m.id].base > topPts) {
        topPts = matchPts[m.id].base;
        topPid = pid;
      }
    }
    const topPlayer = topPid ? players.find(p => p.id === topPid) : null;
    const topTeam = topPlayer ? teams.find(t => t.id === assignments[topPlayer.id]) : null;
    const winTeam = leaderboard[0];

    // Per-team scores for this match
    const teamScores = teams.map(team => {
      let total = 0;
      players.filter(p => assignments[p.id] === team.id || (ownershipLog[p.id]||[]).some(o=>o.teamId===team.id)).forEach(p => {
        if (points[p.id]?.[m.id]) {
          const cap = captains[m.id + "_" + team.id] || {};
          let pts = points[p.id][m.id].base;
          if (cap.captain === p.id) pts *= 2;
          else if (cap.vc === p.id) pts *= 1.5;
          total += Math.round(pts);
        }
      });
      return { ...team, matchPts: total };
    }).sort((a, b) => b.matchPts - a.matchPts);

    const matchWinner = teamScores[0];

    activities.push({
      emoji: "📊",
      text: `<strong style="color:#E2EAF4">M${m.matchNum || ""} ${m.team1} vs ${m.team2}</strong> completed${matchWinner ? ` — <span style="color:${matchWinner.color}">${matchWinner.name}</span> topped with <strong>${matchWinner.matchPts} pts</strong>` : ""}${topPlayer ? `. ⭐ ${topPlayer.name} (${topPts} base pts)` : ""}`,
      time: m.date,
      emoji: "🏏",
      badge: "RESULT",
      badgeColor: "#2ECC71",
    });
  }

  // Transfer activity
  const allTradePairs = [
    ...(transfers.tradedPairs || []),
    ...((transfers.history || []).flatMap(w => w.tradedPairs || [])),
  ];
  for (const pr of allTradePairs.slice(-3).reverse()) {
    const outPlayer = players.find(p => p.id === pr.releasedPid);
    const inPlayer = players.find(p => p.id === pr.pickedPid);
    const team = teams.find(t => t.id === pr.teamId);
    if (!outPlayer || !inPlayer || !team) continue;
    activities.push({
      emoji: "🔄",
      text: `<span style="color:${team.color}">${team.name}</span> traded <span style="color:#FF3D5A;text-decoration:line-through">${outPlayer.name}</span> → <span style="color:#2ECC71">${inPlayer.name}</span>`,
      time: pr.timestamp ? timeAgo(pr.timestamp) : `Week ${pr.week || ""}`,
      badge: "TRANSFER",
      badgeColor: "#F5A623",
    });
  }

  // Snatch activity
  if (snatch.active) {
    const sp = players.find(p => p.id === snatch.active.pid);
    const bt = teams.find(t => t.id === snatch.active.byTeamId);
    const ft = teams.find(t => t.id === snatch.active.fromTeamId);
    if (sp && bt && ft) {
      activities.push({
        emoji: "⚡",
        text: `<span style="color:${bt.color}">${bt.name}</span> snatched <strong style="color:#E2EAF4">${sp.name}</strong> from <span style="color:${ft.color}">${ft.name}</span> — on loan this week`,
        time: timeAgo(snatch.active.startDate),
        badge: "ACTIVE",
        badgeColor: "#A855F7",
      });
    }
  }
  for (const h of [...(snatch.history || [])].reverse().slice(0, 2)) {
    const sp = players.find(p => p.id === h.pid);
    const bt = teams.find(t => t.id === h.byTeamId);
    const ft = teams.find(t => t.id === h.fromTeamId);
    if (sp && bt && ft) {
      activities.push({
        emoji: "↩️",
        text: `<strong style="color:#E2EAF4">${sp.name}</strong> returned to <span style="color:${ft.color}">${ft.name}</span> after loan at <span style="color:${bt.color}">${bt.name}</span> — now <span style="color:#2ECC71">🛡 SAFE</span>`,
        time: timeAgo(h.returnDate),
        badge: "RETURNED",
        badgeColor: "#4A5E78",
      });
    }
  }

  // Sort by recency (rough)
  activities.sort((a, b) => {
    const timeA = a.time?.includes("ago") || a.time?.includes("just") ? 0 : 999;
    const timeB = b.time?.includes("ago") || b.time?.includes("just") ? 0 : 999;
    return timeA - timeB;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 0 16px" }}>
      <LiveCountdown matches={matches} />
      <LeaderboardSnapshot leaderboard={leaderboard} totalMatches={totalMatches} />
      <ActivityFeed activities={activities.slice(0, 8)} />
    </div>
  );
}

// ── Shared styles ────────────────────────────────────────────────────────────
function cardStyle(color) {
  return {
    background: "#0E1521",
    borderRadius: 14,
    border: "1px solid " + color + "33",
    padding: "16px 18px",
    display: "flex",
    alignItems: "center",
    gap: 14,
    position: "relative",
    overflow: "hidden",
  };
}

function pulsingDot(color) {
  return {
    width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0,
    boxShadow: "0 0 0 0 " + color + "66",
    animation: "pulse 1.5s ease infinite",
  };
}
