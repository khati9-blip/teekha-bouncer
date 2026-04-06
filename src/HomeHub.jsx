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

const TAGLINES = [
  "Where cricket gets personal.",
  "Your squad. Your strategy. Your glory.",
  "Eleven players. One obsession.",
  "May the best fantasy win.",
  "Cricket isn't just a sport here — it's war.",
  "Pick smart. Score big. Rule the league.",
];

const DARK = { bg:"#050810", card:"#0A0F1A", border:"#1E2D45", text:"#E2EAF4", sub:"#94A3B8", muted:"#4A5E78", accent:"#F5A623" };
const LIGHT = { bg:"#F5F0E8", card:"#FFFDF8", border:"#DDD5C0", text:"#1A1410", sub:"#5C4F3A", muted:"#9C8E78", accent:"#C47D00" };

function useTheme() {
  const [dark, setDark] = useState(() => { try { return localStorage.getItem("tb_theme") !== "light"; } catch { return true; } });
  const toggle = () => { const next = !dark; setDark(next); try { localStorage.setItem("tb_theme", next ? "dark" : "light"); } catch {} };
  return { t: dark ? DARK : LIGHT, dark, toggle };
}

function RotatingTagline({ t }) {
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);
  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => { setIdx(i => (i + 1) % TAGLINES.length); setFade(true); }, 400);
    }, 4000);
    return () => clearInterval(interval);
  }, []);
  return (
    <div style={{ fontSize: 12, color: t.sub, fontStyle: "italic", letterSpacing: 0.5, opacity: fade ? 1 : 0, transition: "opacity 0.4s ease", textAlign: "center", marginBottom: 16 }}>
      {TAGLINES[idx]}
    </div>
  );
}

function WelcomeBack({ user, leaderboard, myTeamId, t }) {
  if (!user?.email) return null;
  const username = user.email.split("@")[0];
  const myTeam = leaderboard.find(team => team.id === myTeamId);
  const rank = myTeam ? leaderboard.indexOf(myTeam) + 1 : null;
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div style={{ background: t.card, borderRadius: 14, border: `1px solid ${t.border}`, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: myTeam ? myTeam.color + "22" : t.accent + "22", border: `1px solid ${myTeam ? myTeam.color + "44" : t.accent + "44"}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 18, color: myTeam?.color || t.accent }}>
        {username.charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: t.muted, letterSpacing: 1 }}>WELCOME BACK</div>
        <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 17, color: t.text }}>
          {username}{myTeam && <span style={{ color: myTeam.color, marginLeft: 8, fontSize: 14 }}>· {myTeam.name}</span>}
        </div>
      </div>
      {rank && (
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 26, color: myTeam?.color || t.accent }}>{medals[rank - 1] || `#${rank}`}</div>
          <div style={{ fontSize: 9, color: t.muted, letterSpacing: 1 }}>RANK</div>
        </div>
      )}
    </div>
  );
}

function CountdownHero({ matches, t }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const live = matches.find(m => m.status === "live");
  const next = [...matches].filter(m => m.status !== "completed" && m.date).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (live) return (
    <div style={{ background: `linear-gradient(135deg,#FF3D5A18,${t.card})`, borderRadius: 16, border: "1px solid #FF3D5A44", padding: "18px 20px", marginBottom: 12, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg,#FF3D5A,transparent)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#FF3D5A", animation: "hbPulse 1.2s ease infinite" }} />
        <div style={{ fontSize: 10, color: "#FF3D5A", fontWeight: 700, letterSpacing: 2 }}>LIVE NOW</div>
      </div>
      <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 22, fontWeight: 800, color: t.text }}>{live.team1} <span style={{ color: t.muted }}>vs</span> {live.team2}</div>
    </div>
  );
  if (!next) return null;
  const matchTime = new Date(next.date + "T" + (next.time || "14:00:00"));
  const diff = matchTime - now;
  const isToday = new Date(next.date).toDateString() === new Date().toDateString();
  const isTomorrow = new Date(next.date).toDateString() === new Date(Date.now() + 86400000).toDateString();
  const urgent = diff > 0 && diff < 3600000;
  let countdown = "";
  if (diff <= 0) countdown = "Starting Soon";
  else if (diff < 3600000) { const m = Math.floor(diff / 60000), s = Math.floor((diff % 60000) / 1000); countdown = `${m}m ${s}s`; }
  else if (diff < 86400000) { const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000); countdown = `${h}h ${m}m`; }
  else { const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000); countdown = `${d}d ${h}h`; }
  const dayTag = isToday ? "TODAY" : isTomorrow ? "TOMORROW" : new Date(next.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }).toUpperCase();
  return (
    <div style={{ background: `linear-gradient(135deg,${t.accent}12,${t.card})`, borderRadius: 16, border: `1px solid ${t.accent}33`, padding: "18px 20px", marginBottom: 12, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${t.accent},transparent)` }} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: t.muted, letterSpacing: 2 }}>🏏 NEXT MATCH</div>
            <div style={{ fontSize: 9, background: t.accent + "22", border: `1px solid ${t.accent}44`, color: t.accent, borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>{dayTag}</div>
          </div>
          <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 20, fontWeight: 800, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {next.team1} <span style={{ color: t.muted }}>vs</span> {next.team2}
          </div>
          {next.venue && <div style={{ fontSize: 11, color: t.muted, marginTop: 3 }}>{next.venue}</div>}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: urgent ? 20 : 26, fontWeight: 800, color: urgent ? "#FF3D5A" : t.accent }}>{countdown}</div>
          <div style={{ fontSize: 9, color: t.muted, letterSpacing: 1 }}>UNTIL MATCH</div>
        </div>
      </div>
    </div>
  );
}

function MVPCard({ players, teams, assignments, points, matches, t }) {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const recentMatchIds = new Set(matches.filter(m => m.status === "completed" && (m.date || "") >= weekAgo).map(m => m.id));
  // Best SINGLE match performance this week (same as hamburger MVP)
  let topPid = null, topPts = 0, topMatch = null;
  for (const [pid, matchPts] of Object.entries(points)) {
    for (const [mid, d] of Object.entries(matchPts)) {
      if (recentMatchIds.has(mid) && d.base > topPts) {
        topPts = d.base;
        topPid = pid;
        topMatch = matches.find(m => m.id === mid);
      }
    }
  }
  if (!topPid || topPts === 0) return null;
  const player = players.find(p => p.id === topPid);
  if (!player) return null;
  const team = teams.find(t => t.id === assignments[topPid]);
  return (
    <div style={{ background: `linear-gradient(135deg,#F5A62315,${t.card})`, borderRadius: 14, border: "1px solid #F5A62333", padding: "14px 18px", marginBottom: 12, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg,#F5A623,#FF8C00,transparent)" }} />
      <div style={{ fontSize: 10, color: "#F5A623", letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>⭐ THIS WEEK'S MVP</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: team ? team.color + "22" : "#F5A62322", border: `1px solid ${team ? team.color + "44" : "#F5A62344"}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 18, color: team?.color || "#F5A623" }}>
          {player.name.charAt(0)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 17, color: t.text }}>{player.name}</div>
          <div style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>{player.role}{team && <span style={{ color: team.color }}> · {team.name}</span>}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 26, color: "#F5A623" }}>{topPts}</div>
          <div style={{ fontSize: 9, color: t.muted, letterSpacing: 1 }}>BASE PTS</div>
        </div>
      </div>
    </div>
  );
}

function LeaderboardSnapshot({ leaderboard, totalMatches, t }) {
  const medals = ["🥇", "🥈", "🥉"];
  const max = leaderboard[0]?.total || 1;
  return (
    <div style={{ background: t.card, borderRadius: 14, border: `1px solid ${t.border}`, overflow: "hidden", marginBottom: 12 }}>
      <div style={{ padding: "12px 18px", borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 14, color: t.accent, letterSpacing: 2 }}>🏆 STANDINGS</div>
        <div style={{ fontSize: 10, color: t.muted }}>{totalMatches} match{totalMatches !== 1 ? "es" : ""} played</div>
      </div>
      {leaderboard.length === 0 ? (
        <div style={{ padding: 20, textAlign: "center", color: t.muted, fontSize: 13 }}>No data yet</div>
      ) : leaderboard.map((team, i) => (
        <div key={team.id} style={{ padding: "10px 18px", borderBottom: i < leaderboard.length - 1 ? `1px solid ${t.border}33` : "none", position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(team.total / max) * 100}%`, background: team.color + "08", borderRight: `1px solid ${team.color}22` }} />
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 18, minWidth: 32, fontFamily: "Rajdhani,sans-serif", fontWeight: 700, color: i >= 3 ? t.sub : "inherit" }}>{medals[i] || <span style={{fontSize:14, color: t.sub}}>#{i + 1}</span>}</div>
            <div style={{ flex: 1 }}><div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 14, color: team.color }}>{team.name}</div></div>
            <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 20, color: t.text }}>{team.total.toLocaleString()}<span style={{ fontSize: 10, color: t.muted, fontWeight: 400, marginLeft: 3 }}>pts</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityStrip({ activities, t }) {
  const scrollRef = useRef(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || activities.length === 0) return;
    let x = 0; let raf;
    const animate = () => { x -= 0.5; if (x < -el.scrollWidth / 2) x = 0; el.style.transform = `translateX(${x}px)`; raf = requestAnimationFrame(animate); };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [activities.length]);
  if (activities.length === 0) return null;
  const doubled = [...activities, ...activities];
  return (
    <div style={{ marginBottom: 12, overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 24, background: `linear-gradient(90deg,${t.bg},transparent)`, zIndex: 1 }} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 24, background: `linear-gradient(270deg,${t.bg},transparent)`, zIndex: 1 }} />
      <div ref={scrollRef} style={{ display: "flex", gap: 8, width: "max-content", paddingBottom: 4 }}>
        {doubled.map((act, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: t.card, border: `1px solid ${t.border}`, borderRadius: 20, padding: "6px 12px", whiteSpace: "nowrap", flexShrink: 0 }}>
            <span style={{ fontSize: 13 }}>{act.emoji}</span>
            <span style={{ fontSize: 11, color: t.sub }}>{act.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotifBell({ notifications, t }) {
  const [open, setOpen] = useState(false);
  const unread = notifications.filter(n => !n.read).length;
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
        <span style={{ fontSize: 16 }}>🔔</span>
        {unread > 0 && <div style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "#FF3D5A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff" }}>{unread}</div>}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 100, width: 280, background: t.card, borderRadius: 12, border: `1px solid ${t.border}`, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${t.border}`, fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 13, color: t.text, letterSpacing: 1 }}>NOTIFICATIONS</div>
          {notifications.length === 0 ? (
            <div style={{ padding: "16px 14px", fontSize: 12, color: t.muted, textAlign: "center" }}>All caught up 🎉</div>
          ) : notifications.slice(0, 6).map((n, i) => (
            <div key={i} style={{ padding: "10px 14px", borderBottom: i < Math.min(notifications.length, 6) - 1 ? `1px solid ${t.border}33` : "none", display: "flex", gap: 10 }}>
              <span style={{ fontSize: 16 }}>{n.emoji || "📢"}</span>
              <div><div style={{ fontSize: 12, color: t.text, lineHeight: 1.4 }}>{n.text}</div><div style={{ fontSize: 10, color: t.muted, marginTop: 2 }}>{n.time}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HomeHub({ pitchId, user, savedTeamId }) {
  const { t, dark, toggle } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = async () => {
    if (!pitchId) return;
    try {
      const [teams, players, assignments, matches, points, captains, transfers, snatch, ownershipLog, notifications] = await Promise.all([
        sbGet(pitchId + "_teams"), sbGet(pitchId + "_players"), sbGet(pitchId + "_assignments"),
        sbGet(pitchId + "_matches"), sbGet(pitchId + "_points"), sbGet(pitchId + "_captains"),
        sbGet(pitchId + "_transfers"), sbGet(pitchId + "_snatch"), sbGet(pitchId + "_ownershipLog"),
        sbGet(pitchId + "_notifications"),
      ]);
      setData({ teams:teams||[], players:players||[], assignments:assignments||{}, matches:matches||[], points:points||{}, captains:captains||{}, transfers:transfers||{}, snatch:snatch||{}, ownershipLog:ownershipLog||{}, notifications:Array.isArray(notifications)?notifications:[] });
      setLastUpdated(new Date());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [pitchId]);

  if (!pitchId || loading) return <div style={{ padding: "24px 0", textAlign: "center", fontSize: 11, color: "#4A5E78", letterSpacing: 2 }}>LOADING…</div>;
  if (!data || !data.teams?.length) return null;

  const { teams, players, assignments, matches, points, captains, transfers, snatch, ownershipLog, notifications } = data;

  const getTeamTotal = (teamId) => {
    let total = 0;
    const allPids = new Set([...players.filter(p => assignments[p.id] === teamId).map(p => p.id), ...Object.entries(ownershipLog).filter(([, periods]) => periods.some(o => o.teamId === teamId)).map(([pid]) => pid)]);
    for (const pid of allPids) {
      const periods = (ownershipLog[pid] || []).filter(o => o.teamId === teamId);
      for (const [mid, d] of Object.entries(points[pid] || {})) {
        const m = matches.find(x => x.id === mid); if (!m) continue;
        const matchDate = new Date(m.date);
        const owned = periods.length === 0 ? assignments[pid] === teamId : periods.some(o => matchDate >= new Date(o.from) && matchDate <= (o.to ? new Date(o.to) : new Date("2099-01-01")));
        if (!owned) continue;
        const cap = captains[mid + "_" + teamId] || {};
        let pts = d.base;
        if (cap.captain === pid) pts *= 2; else if (cap.vc === pid) pts *= 1.5;
        total += Math.round(pts);
      }
    }
    return total;
  };

  const leaderboard = [...teams].map(tm => ({ ...tm, total: getTeamTotal(tm.id) })).sort((a, b) => b.total - a.total);
  const completed = matches.filter(m => m.status === "completed");

  // Activity pills
  const pills = [];
  const topTeam = leaderboard[0];
  if (topTeam) pills.push({ emoji: "🏆", text: `${topTeam.name} leads with ${topTeam.total} pts` });
  const allPairs = [...(transfers.tradedPairs || []), ...((transfers.history || []).flatMap(w => w.tradedPairs || []))];
  for (const pr of allPairs.slice(-3).reverse()) {
    const out = players.find(p => p.id === pr.releasedPid), inn = players.find(p => p.id === pr.pickedPid), team = teams.find(tm => tm.id === pr.teamId);
    if (out && inn && team) pills.push({ emoji: "🔄", text: `${team.name} traded ${out.name} → ${inn.name}` });
  }
  if (snatch.active) {
    const sp = players.find(p => p.id === snatch.active.pid), bt = teams.find(tm => tm.id === snatch.active.byTeamId), ft = teams.find(tm => tm.id === snatch.active.fromTeamId);
    if (sp && bt && ft) pills.push({ emoji: "⚡", text: `${bt.name} snatched ${sp.name} from ${ft.name}` });
  }

  // Notifications
  const notifs = [...notifications].reverse();
  if (transfers.phase === "release") notifs.unshift({ emoji: "📤", text: "Transfer Window is open — release your players!", time: "Now", read: false });
  if (transfers.phase === "trade") notifs.unshift({ emoji: "🔄", text: "Trade phase is active!", time: "Now", read: false });

  const shareLeaderboard = () => {
    const medals = ["🥇", "🥈", "🥉"];
    const lines = leaderboard.map((team, i) => `${medals[i] || `#${i + 1}`} ${team.name}: ${team.total} pts`);
    const text = `🏏 Teekha Bouncer League\nLeaderboard\n\n${lines.join("\n")}\n\nteekha-bouncer.vercel.app`;
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
  };

  const lastUpdatedStr = lastUpdated ? lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div style={{ padding: "16px 0 8px" }}>
      <style>{`@keyframes hbPulse{0%,100%{box-shadow:0 0 0 0 #FF3D5A44}50%{box-shadow:0 0 0 6px transparent}}`}</style>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8 }}>
        <div style={{ fontSize: 10, color: t.muted }}>
          {lastUpdatedStr && `Updated ${lastUpdatedStr}`}
          <button onClick={load} style={{ background: "none", border: "none", color: t.muted, fontSize: 12, cursor: "pointer", marginLeft: 4 }}>↻</button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <NotifBell notifications={notifs} t={t} />
          <button onClick={toggle} style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 10, padding: "7px 11px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: t.sub, fontFamily: "Barlow Condensed,sans-serif", fontWeight: 700, fontSize: 11 }}>
            {dark ? "☀️ LIGHT" : "🌙 DARK"}
          </button>
        </div>
      </div>

      <RotatingTagline t={t} />
      <WelcomeBack user={user} leaderboard={leaderboard} myTeamId={savedTeamId} t={t} />
      {pills.length > 0 && <ActivityStrip activities={pills} t={t} />}
      <CountdownHero matches={matches} t={t} />
      <MVPCard players={players} teams={teams} assignments={assignments} points={points} matches={matches} t={t} />
      <LeaderboardSnapshot leaderboard={leaderboard} totalMatches={completed.length} t={t} />

      {leaderboard.length > 0 && (
        <button onClick={shareLeaderboard} style={{ width: "100%", background: "#25D36618", border: "1px solid #25D36633", borderRadius: 12, padding: "11px", color: "#25D366", fontFamily: "Barlow Condensed,sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer", letterSpacing: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          📲 SHARE LEADERBOARD ON WHATSAPP
        </button>
      )}
    </div>
  );
}
