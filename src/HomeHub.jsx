import React, { useState, useEffect, useRef } from "react";
import { fonts } from "./Theme";

const DARK = {
  bg:"#0C0C0F", card:"#111118", border:"#222230", text:"#E8E0CC",
  sub:"#8A8299", muted:"#9AA5B8", accent:"#C9A84C", accentBg:"#C9A84C12",
  accentBorder:"#C9A84C33", accentDim:"#8B6914", danger:"#FF3D5A",
  dangerBg:"#FF3D5A12", success:"#2ECC71", successBg:"#2ECC7112",
  info:"#4F8EF7", purple:"#A855F7", purpleBg:"#A855F712",
};
const LIGHT = {
  bg:"#F5F0E8", card:"#FFFDF8", border:"#DDD5C0", text:"#1A1410",
  sub:"#5C4F3A", muted:"#7A6E5E", accent:"#9B6E00", accentBg:"#9B6E0012",
  accentBorder:"#9B6E0033", accentDim:"#7A5500", danger:"#CC2233",
  dangerBg:"#CC223312", success:"#1A9950", successBg:"#1A995012",
  info:"#1A5FB4", purple:"#7C3AED", purpleBg:"#7C3AED12",
};

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

function RotatingTagline({ T }) {
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
    <div style={{ fontFamily: fonts.body, fontSize: 12, color: T.sub, fontStyle: "italic", opacity: fade ? 1 : 0, transition: "opacity 0.4s ease", textAlign: "center", marginBottom: 14 }}>
      {TAGLINES[idx]}
    </div>
  );
}

function WelcomeBack({ user, leaderboard, myTeamId, T }) {
  if (!user?.email) return null;
  const username = user.email.split("@")[0];
  const myTeam = leaderboard.find(t => t.id === myTeamId);
  const rank = myTeam ? leaderboard.indexOf(myTeam) + 1 : null;
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div style={{ background: T.card, borderRadius: 13, border: `1px solid ${T.border}`, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: myTeam ? myTeam.color + "20" : T.accentBg, border: `1px solid ${myTeam ? myTeam.color + "44" : T.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fonts.display, fontWeight: 800, fontSize: 17, color: myTeam?.color || T.accent }}>
        {username.charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: fonts.display, fontSize: 9, fontWeight: 700, color: T.muted, letterSpacing: 2, marginBottom: 2 }}>WELCOME BACK</div>
        <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 16, color: T.text }}>
          {username}{myTeam && <span style={{ color: myTeam.color, marginLeft: 8, fontSize: 13, fontWeight: 600 }}>· {myTeam.name}</span>}
        </div>
      </div>
      {rank && (
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 24, color: myTeam?.color || T.accent }}>{medals[rank - 1] || `#${rank}`}</div>
          <div style={{ fontFamily: fonts.display, fontSize: 9, color: T.muted, letterSpacing: 1 }}>RANK</div>
        </div>
      )}
    </div>
  );
}

function CountdownHero({ matches, T }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const live = matches.find(m => m.status === "live");
  const next = [...matches].filter(m => m.status !== "completed" && m.date).sort((a, b) => a.date.localeCompare(b.date))[0];

  if (live) return (
    <div style={{ background: T.dangerBg, borderRadius: 13, border: `1px solid ${T.danger}44`, padding: "16px 18px", marginBottom: 10, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${T.danger},transparent)` }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: T.danger, animation: "hbPulse 1.2s ease infinite" }} />
        <div style={{ fontFamily: fonts.display, fontSize: 10, fontWeight: 700, color: T.danger, letterSpacing: 2 }}>LIVE NOW</div>
      </div>
      <div style={{ fontFamily: fonts.display, fontSize: 20, fontWeight: 800, color: T.text }}>{live.team1} <span style={{ color: T.muted }}>vs</span> {live.team2}</div>
      {live.venue && <div style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted, marginTop: 3 }}>{live.venue}</div>}
    </div>
  );

  if (!next) return null;
  // Safely parse match time — handles "7:30 PM", "19:30", "19:30:00", missing
  let matchTime;
  try {
    let hours = 14, minutes = 0;
    if (next.time) {
      const t = next.time.trim();
      const isPM = /pm/i.test(t);
      const isAM = /am/i.test(t);
      const nums = t.replace(/[^0-9:]/g, "");
      const parts = nums.split(":");
      hours = parseInt(parts[0]) || 14;
      minutes = parseInt(parts[1]) || 0;
      // Convert 12-hour to 24-hour
      if (isPM && hours < 12) hours += 12;
      if (isAM && hours === 12) hours = 0;
    }
    const pad = n => String(n).padStart(2, "0");
    matchTime = new Date(next.date + "T" + pad(hours) + ":" + pad(minutes) + ":00");
    if (isNaN(matchTime.getTime())) matchTime = new Date(next.date + "T14:00:00");
  } catch { matchTime = new Date(next.date + "T14:00:00"); }
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
    <div style={{ background: T.accentBg, borderRadius: 13, border: `1px solid ${T.accentBorder}`, padding: "16px 18px", marginBottom: 10, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${T.accent},transparent)` }} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <div style={{ fontFamily: fonts.display, fontSize: 9, fontWeight: 700, color: T.muted, letterSpacing: 2 }}>🏏 NEXT MATCH</div>
            <div style={{ fontFamily: fonts.display, fontSize: 9, fontWeight: 700, background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.accent, borderRadius: 4, padding: "1px 6px" }}>{dayTag}</div>
          </div>
          <div style={{ fontFamily: fonts.display, fontSize: 19, fontWeight: 800, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {next.team1} <span style={{ color: T.muted }}>vs</span> {next.team2}
          </div>
          {next.venue && <div style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted, marginTop: 3 }}>{next.venue}</div>}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: fonts.display, fontSize: urgent ? 18 : 24, fontWeight: 900, color: urgent ? T.danger : T.accent }}>{countdown}</div>
          <div style={{ fontFamily: fonts.display, fontSize: 9, color: T.muted, letterSpacing: 1 }}>UNTIL MATCH</div>
        </div>
      </div>
    </div>
  );
}

function MVPCard({ players, teams, assignments, points, matches, T }) {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const recentMatchIds = new Set(matches.filter(m => m.status === "completed" && (m.date || "") >= weekAgo).map(m => m.id));
  let topPid = null, topPts = 0, topMatch = null;
  for (const [pid, matchPts] of Object.entries(points)) {
    for (const [mid, d] of Object.entries(matchPts)) {
      if (recentMatchIds.has(mid) && d.base > topPts) { topPts = d.base; topPid = pid; topMatch = matches.find(m => m.id === mid); }
    }
  }
  if (!topPid || topPts === 0) return null;
  const player = players.find(p => p.id === topPid);
  if (!player) return null;
  const team = teams.find(t => t.id === assignments[topPid]);
  return (
    <div style={{ background: T.accentBg, borderRadius: 13, border: `1px solid ${T.accentBorder}`, padding: "13px 16px", marginBottom: 10, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${T.accent},${T.accentDim},transparent)` }} />
      <div style={{ fontFamily: fonts.display, fontSize: 9, fontWeight: 700, color: T.accent, letterSpacing: 2, marginBottom: 10 }}>⭐ THIS WEEK'S MVP</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, background: team ? team.color + "20" : T.accentBg, border: `1px solid ${team ? team.color + "44" : T.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fonts.display, fontWeight: 900, fontSize: 17, color: team?.color || T.accent }}>
          {player.name.charAt(0)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 16, color: T.text }}>{player.name}</div>
          <div style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted, marginTop: 2 }}>
            {player.role}{team && <span style={{ color: team.color }}> · {team.name}</span>}
            {topMatch && <span style={{ color: T.muted }}> · {topMatch.team1} vs {topMatch.team2}</span>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 26, color: T.accent }}>{topPts}</div>
          <div style={{ fontFamily: fonts.display, fontSize: 9, color: T.muted, letterSpacing: 1 }}>BASE PTS</div>
        </div>
      </div>
    </div>
  );
}

function LeaderboardSnapshot({ leaderboard, totalMatches, T }) {
  const medals = ["🥇", "🥈", "🥉"];
  const max = leaderboard[0]?.total || 1;
  return (
    <div style={{ background: T.card, borderRadius: 13, border: `1px solid ${T.border}`, overflow: "hidden", marginBottom: 10 }}>
      <div style={{ padding: "11px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 12, color: T.accent, letterSpacing: 2 }}>🏆 STANDINGS</div>
        <div style={{ fontFamily: fonts.body, fontSize: 10, color: T.muted }}>{totalMatches} match{totalMatches !== 1 ? "es" : ""} played</div>
      </div>
      {leaderboard.length === 0 ? (
        <div style={{ padding: 20, textAlign: "center", fontFamily: fonts.body, color: T.muted, fontSize: 13 }}>No data yet</div>
      ) : leaderboard.map((team, i) => (
        <div key={team.id} style={{ padding: "9px 16px", borderBottom: i < leaderboard.length - 1 ? `1px solid ${T.border}22` : "none", position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(team.total / max) * 100}%`, background: team.color + "08", borderRight: `1px solid ${team.color}18` }} />
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 16, minWidth: 28, fontFamily: fonts.display, fontWeight: 700 }}>
              {medals[i] || <span style={{ fontSize: 12, color: T.muted }}>#{i + 1}</span>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 13, color: team.color }}>{team.name}</div>
            </div>
            <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 18, color: T.text }}>
              {team.total.toLocaleString()}<span style={{ fontFamily: fonts.body, fontSize: 10, color: T.muted, fontWeight: 400, marginLeft: 3 }}>pts</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityStrip({ activities, T }) {
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
    <div style={{ marginBottom: 10, overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 24, background: `linear-gradient(90deg,${T.bg},transparent)`, zIndex: 1 }} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 24, background: `linear-gradient(270deg,${T.bg},transparent)`, zIndex: 1 }} />
      <div ref={scrollRef} style={{ display: "flex", gap: 7, width: "max-content", paddingBottom: 2 }}>
        {doubled.map((act, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: "5px 12px", whiteSpace: "nowrap", flexShrink: 0 }}>
            <span style={{ fontSize: 12 }}>{act.emoji}</span>
            <span style={{ fontFamily: fonts.body, fontSize: 11, color: T.sub }}>{act.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotifBell({ notifications, T }) {
  const [open, setOpen] = useState(false);
  const unread = notifications.filter(n => !n.read).length;
  return (
    <>
      <button onClick={() => setOpen(o => !o)} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 9, padding: "7px 11px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, position: "relative", transition: "border-color 0.2s" }}>
        <span style={{ fontSize: 14 }}>🔔</span>
        {unread > 0 && <div style={{ position: "absolute", top: -4, right: -4, width: 15, height: 15, borderRadius: "50%", background: T.danger, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fonts.display, fontSize: 8, fontWeight: 800, color: "#fff" }}>{unread}</div>}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.5)" }} />
          <div style={{ position: "fixed", top: 80, right: 16, zIndex: 1000, width: "min(300px, calc(100vw - 32px))", background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 16px 48px rgba(0,0,0,0.6)", overflow: "hidden" }}>
            <div style={{ padding: "13px 16px", borderBottom: `1px solid ${T.border}`, fontFamily: fonts.display, fontWeight: 700, fontSize: 13, color: T.text, letterSpacing: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              NOTIFICATIONS
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: T.muted, fontSize: 15, cursor: "pointer" }}>✕</button>
            </div>
            {notifications.length === 0 ? (
              <div style={{ padding: "20px 16px", fontFamily: fonts.body, fontSize: 13, color: T.muted, textAlign: "center" }}>All caught up 🎉</div>
            ) : notifications.slice(0, 6).map((n, i) => (
              <div key={i} style={{ padding: "11px 16px", borderBottom: i < Math.min(notifications.length, 6) - 1 ? `1px solid ${T.border}22` : "none", display: "flex", gap: 10 }}>
                <span style={{ fontSize: 15 }}>{n.emoji || "📢"}</span>
                <div>
                  <div style={{ fontFamily: fonts.body, fontSize: 12, color: T.text, lineHeight: 1.4 }}>{n.text}</div>
                  <div style={{ fontFamily: fonts.body, fontSize: 10, color: T.muted, marginTop: 2 }}>{n.time}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

export default function HomeHub({ pitchId, user, savedTeamId }) {
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem("tb_theme") !== "light"; } catch { return true; }
  });
  const T = darkMode ? DARK : LIGHT;
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
      setData({ teams: teams || [], players: players || [], assignments: assignments || {}, matches: matches || [], points: points || {}, captains: captains || {}, transfers: transfers || {}, snatch: snatch || {}, ownershipLog: ownershipLog || {}, notifications: Array.isArray(notifications) ? notifications : [] });
      setLastUpdated(new Date());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [pitchId]);

  if (!pitchId || loading) return (
    <div style={{ padding: "20px 0", textAlign: "center", fontFamily: fonts.display, fontSize: 10, color: T.muted, letterSpacing: 3 }}>LOADING…</div>
  );
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

  const notifs = [...notifications].reverse();
  if (transfers.phase === "release") notifs.unshift({ emoji: "📤", text: "Transfer Window open — release your players!", time: "Now", read: false });
  if (transfers.phase === "trade") notifs.unshift({ emoji: "🔄", text: "Trade phase active!", time: "Now", read: false });

  const shareLeaderboard = () => {
    const medals = ["🥇", "🥈", "🥉"];
    const lines = leaderboard.map((team, i) => `${medals[i] || `#${i + 1}`} ${team.name}: ${team.total} pts`);
    const text = `🏏 Teekha Bouncer League\nLeaderboard\n\n${lines.join("\n")}\n\nteekha-bouncer.vercel.app`;
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
  };

  const lastUpdatedStr = lastUpdated ? lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div style={{ padding: "14px 0 8px", background: T.bg, borderRadius: 12, transition: "background 0.3s" }}>
      <style>{`@keyframes hbPulse{0%,100%{box-shadow:0 0 0 0 ${T.danger}44}50%{box-shadow:0 0 0 6px transparent}}`}</style>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8 }}>
        <div style={{ fontFamily: fonts.body, fontSize: 10, color: T.muted }}>
          {lastUpdatedStr && `Updated ${lastUpdatedStr}`}
          <button onClick={load} style={{ background: "none", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", marginLeft: 4 }}>↻</button>
        </div>
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          <NotifBell notifications={notifs} T={T} />
          <button onClick={() => { const next = !darkMode; setDarkMode(next); try { localStorage.setItem("tb_theme", next ? "dark" : "light"); } catch {} }}
            style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 9, padding: "6px 11px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: fonts.display, fontWeight: 700, fontSize: 10, color: T.sub, letterSpacing: 0.5 }}>
            {darkMode ? "☀️ LIGHT" : "🌙 DARK"}
          </button>

        </div>
      </div>

      <RotatingTagline T={T} />
      <WelcomeBack user={user} leaderboard={leaderboard} myTeamId={savedTeamId} T={T} />
      {pills.length > 0 && <ActivityStrip activities={pills} T={T} />}
      <CountdownHero matches={matches} T={T} />
      <MVPCard players={players} teams={teams} assignments={assignments} points={points} matches={matches} T={T} />
      <LeaderboardSnapshot leaderboard={leaderboard} totalMatches={completed.length} T={T} />

      {leaderboard.length > 0 && (
        <button onClick={shareLeaderboard} style={{ width: "100%", background: "#25D36614", border: "1px solid #25D36633", borderRadius: 11, padding: "10px", color: "#25D366", fontFamily: fonts.display, fontWeight: 700, fontSize: 12, cursor: "pointer", letterSpacing: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          📲 SHARE LEADERBOARD ON WHATSAPP
        </button>
      )}
    </div>
  );
}
