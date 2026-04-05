import React, { useState, useMemo } from "react";

const ROLE_COLORS = { Batsman:"#F5A623", Bowler:"#4F8EF7", "All-Rounder":"#2ECC71", "Wicket-Keeper":"#A855F7" };
const TIER_COLORS = { platinum:"#B0BEC5", gold:"#F5A623", silver:"#94A3B8", bronze:"#CD7F32" };
const TIER_BG = { platinum:"#4A5E7833", gold:"#F5A62322", silver:"#94A3B822", bronze:"#CD7F3222" };
const TIER_BORDER = { platinum:"#4A5E7866", gold:"#F5A62366", silver:"#94A3B855", bronze:"#CD7F3255" };

function TierBadge({ tier }) {
  if (!tier) return null;
  return (
    <span style={{fontSize:9,fontWeight:800,letterSpacing:1,padding:"1px 5px",borderRadius:4,
      fontFamily:"Barlow Condensed,sans-serif",textTransform:"uppercase",
      background:TIER_BG[tier]||"transparent",border:"1px solid "+(TIER_BORDER[tier]||"#1E2D45"),
      color:TIER_COLORS[tier]||"#4A5E78"}}>
      {tier==="platinum"?"PLAT":tier==="gold"?"GOLD":tier==="silver"?"SILV":"BRNZ"}
    </span>
  );
}

// Get current week boundaries: Saturday 11:00 AM → Friday 11:59 PM IST
function getWeekBounds(weekOffset = 0) {
  const now = new Date();
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(now.getTime() + IST_OFFSET);
  const day = nowIST.getUTCDay(); // 0=Sun,1=Mon,...,6=Sat
  // Days since last Saturday
  const daysSinceSat = (day + 1) % 7;
  const satIST = new Date(nowIST);
  satIST.setUTCDate(nowIST.getUTCDate() - daysSinceSat);
  satIST.setUTCHours(11, 0, 0, 0);
  // If current time is before Saturday 11am, go back one more week
  if (nowIST < satIST) satIST.setUTCDate(satIST.getUTCDate() - 7);
  // Apply offset
  satIST.setUTCDate(satIST.getUTCDate() - weekOffset * 7);
  const friIST = new Date(satIST);
  friIST.setUTCDate(satIST.getUTCDate() + 6);
  friIST.setUTCHours(23, 59, 59, 999);
  return {
    start: new Date(satIST.getTime() - IST_OFFSET),
    end: new Date(friIST.getTime() - IST_OFFSET),
    label: satIST.toLocaleDateString("en-IN", {day:"numeric",month:"short"}) + " — " + friIST.toLocaleDateString("en-IN", {day:"numeric",month:"short"}),
  };
}

function medalColor(rank) {
  if (rank === 1) return "#F5A623";
  if (rank === 2) return "#94A3B8";
  if (rank === 3) return "#CD7F32";
  return "#4A5E78";
}

export default function MVPStats({ players, teams, assignments, points, captains, matches, onClose }) {
  const [view, setView] = useState("weekly"); // weekly | bestmatch | team
  const [weekOffset, setWeekOffset] = useState(0);

  const week = useMemo(() => getWeekBounds(weekOffset), [weekOffset]);

  // Get matches in this week
  const weekMatches = useMemo(() => matches.filter(m => {
    if (m.status !== "completed") return false;
    const d = new Date(m.date);
    return d >= week.start && d <= week.end;
  }), [matches, week]);

  // For each player, compute weekly total and best match
  const playerStats = useMemo(() => {
    const stats = [];
    for (const player of players) {
      const team = teams.find(t => t.id === assignments[player.id]);
      if (!team) continue;
      const playerPts = points[player.id] || {};
      let weeklyTotal = 0;
      let bestMatchPts = 0;
      let bestMatchName = "";

      for (const match of weekMatches) {
        const d = playerPts[match.id];
        if (!d) continue;
        const cap = captains[match.id + "_" + team.id] || {};
        let pts = d.base || 0;
        if (cap.captain === player.id) pts = Math.round(pts * 2);
        else if (cap.vc === player.id) pts = Math.round(pts * 1.5);
        weeklyTotal += pts;
        if (pts > bestMatchPts) {
          bestMatchPts = pts;
          bestMatchName = match.team1 + " vs " + match.team2;
        }
      }
      if (weeklyTotal > 0 || bestMatchPts > 0) {
        stats.push({ player, team, weeklyTotal, bestMatchPts, bestMatchName });
      }
    }
    return stats;
  }, [players, teams, assignments, points, captains, weekMatches]);

  // Weekly leaderboard sorted by total
  const weeklyLeaderboard = useMemo(() =>
    [...playerStats].sort((a, b) => b.weeklyTotal - a.weeklyTotal),
  [playerStats]);

  // Best single match leaderboard
  const bestMatchLeaderboard = useMemo(() =>
    [...playerStats].sort((a, b) => b.bestMatchPts - a.bestMatchPts),
  [playerStats]);

  // Team performance
  const teamPerformance = useMemo(() => {
    const perf = teams.map(team => {
      const teamStats = playerStats.filter(s => s.team.id === team.id);
      const total = teamStats.reduce((sum, s) => sum + s.weeklyTotal, 0);
      const best = teamStats.reduce((best, s) => s.weeklyTotal > best.pts ? {name:s.player.name,pts:s.weeklyTotal} : best, {name:"—",pts:0});
      return { team, total, best, playerCount: teamStats.length };
    }).sort((a, b) => b.total - a.total);
    return perf;
  }, [teams, playerStats]);

  const maxTeamPts = teamPerformance[0]?.total || 1;

  const styles = {
    wrap: { position:"fixed", inset:0, background:"rgba(8,12,20,0.98)", zIndex:600, display:"flex", flexDirection:"column", fontFamily:"Barlow Condensed,sans-serif", overflowY:"auto" },
    header: { background:"#0A0F1A", borderBottom:"1px solid #1E2D45", padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:10 },
    tab: (active) => ({ background:active?"#F5A62322":"transparent", border:"1px solid "+(active?"#F5A62366":"#1E2D45"), borderRadius:8, padding:"6px 14px", color:active?"#F5A623":"#4A5E78", fontFamily:"Barlow Condensed,sans-serif", fontWeight:700, fontSize:12, cursor:"pointer", letterSpacing:1 }),
    card: (color) => ({ background:"#0E1521", borderRadius:12, border:"1px solid "+(color||"#1E2D45")+"44", padding:"12px 14px", marginBottom:8, display:"flex", alignItems:"center", gap:12 }),
    rank: (r) => ({ fontFamily:"Rajdhani,sans-serif", fontSize:20, fontWeight:700, color:medalColor(r), minWidth:28, textAlign:"center" }),
    pts: (col) => ({ fontFamily:"Rajdhani,sans-serif", fontSize:24, fontWeight:800, color:col||"#F5A623", minWidth:48, textAlign:"right" }),
  };

  const emptyMsg = (
    <div style={{textAlign:"center",padding:48,color:"#4A5E78"}}>
      <div style={{fontSize:32,marginBottom:12}}>📊</div>
      <div style={{fontSize:14}}>No completed matches this week</div>
      <div style={{fontSize:12,marginTop:4}}>Week: {week.label}</div>
    </div>
  );

  return (
    <div style={styles.wrap}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:20,fontWeight:700,color:"#F5A623",letterSpacing:2}}>MVP STATS</div>
          <div style={{fontSize:10,color:"#4A5E78",marginTop:2}}>
            {week.label} &nbsp;•&nbsp; {weekMatches.length} match{weekMatches.length!==1?"es":""} this week
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setWeekOffset(w=>w+1)} style={{background:"transparent",border:"1px solid #1E2D45",borderRadius:6,padding:"4px 10px",color:"#4A5E78",cursor:"pointer",fontSize:13}}>‹</button>
          <span style={{fontSize:11,color:"#4A5E78",minWidth:60,textAlign:"center"}}>
            {weekOffset===0?"This week":weekOffset===1?"Last week":weekOffset+" wks ago"}
          </span>
          <button onClick={()=>setWeekOffset(w=>Math.max(0,w-1))} disabled={weekOffset===0} style={{background:"transparent",border:"1px solid #1E2D45",borderRadius:6,padding:"4px 10px",color:weekOffset===0?"#2D3E52":"#4A5E78",cursor:weekOffset===0?"default":"pointer",fontSize:13}}>›</button>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"#4A5E78",fontSize:22,cursor:"pointer",marginLeft:4}}>✕</button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{display:"flex",gap:8,padding:"12px 16px",borderBottom:"1px solid #1E2D45",background:"#080C14"}}>
        <button style={styles.tab(view==="weekly")} onClick={()=>setView("weekly")}>WEEKLY</button>
        <button style={styles.tab(view==="bestmatch")} onClick={()=>setView("bestmatch")}>BEST MATCH</button>
        <button style={styles.tab(view==="team")} onClick={()=>setView("team")}>BY TEAM</button>
      </div>

      <div style={{padding:"16px",maxWidth:600,margin:"0 auto",width:"100%"}}>

        {/* WEEKLY LEADERBOARD */}
        {view==="weekly" && (
          <div>
            <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,marginBottom:12}}>WEEKLY POINTS LEADERS</div>
            {weeklyLeaderboard.length === 0 ? emptyMsg : weeklyLeaderboard.map((s, idx) => (
              <div key={s.player.id} style={styles.card(s.team.color)}>
                <div style={styles.rank(idx+1)}>{idx+1}</div>
                <div style={{width:10,height:10,borderRadius:"50%",background:s.team.color,flexShrink:0}} />
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontWeight:700,fontSize:14,color:"#E2EAF4"}}>{s.player.name}</span>
                    <TierBadge tier={s.player.tier} />
                  </div>
                  <div style={{fontSize:11,color:"#4A5E78",marginTop:1}}>
                    <span style={{color:s.team.color,fontWeight:700}}>{s.team.name}</span>
                    <span style={{marginLeft:6}}>{s.player.iplTeam}</span>
                    <span style={{marginLeft:4,color:ROLE_COLORS[s.player.role]||"#4A5E78"}}>{s.player.role}</span>
                  </div>
                </div>
                <div style={styles.pts(medalColor(idx+1))}>{s.weeklyTotal}<span style={{fontSize:10,color:"#4A5E78",fontWeight:400,marginLeft:2}}>pts</span></div>
              </div>
            ))}
          </div>
        )}

        {/* BEST SINGLE MATCH */}
        {view==="bestmatch" && (
          <div>
            <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,marginBottom:12}}>BEST SINGLE MATCH PERFORMANCE</div>
            {bestMatchLeaderboard.length === 0 ? emptyMsg : bestMatchLeaderboard.map((s, idx) => (
              <div key={s.player.id} style={styles.card(s.team.color)}>
                <div style={styles.rank(idx+1)}>{idx+1}</div>
                <div style={{width:10,height:10,borderRadius:"50%",background:s.team.color,flexShrink:0}} />
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontWeight:700,fontSize:14,color:"#E2EAF4"}}>{s.player.name}</span>
                    <TierBadge tier={s.player.tier} />
                  </div>
                  <div style={{fontSize:11,color:"#4A5E78",marginTop:1}}>
                    <span style={{color:s.team.color,fontWeight:700}}>{s.team.name}</span>
                  </div>
                  <div style={{fontSize:10,color:"#4A5E78",marginTop:2}}>{s.bestMatchName}</div>
                </div>
                <div style={styles.pts(medalColor(idx+1))}>{s.bestMatchPts}<span style={{fontSize:10,color:"#4A5E78",fontWeight:400,marginLeft:2}}>pts</span></div>
              </div>
            ))}
          </div>
        )}

        {/* TEAM PERFORMANCE */}
        {view==="team" && (
          <div>
            <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,marginBottom:12}}>TEAM WEEKLY PERFORMANCE</div>
            {teamPerformance.every(t=>t.total===0) ? emptyMsg : teamPerformance.map((tp, idx) => (
              <div key={tp.team.id} style={{background:"#0E1521",borderRadius:12,border:"1px solid "+tp.team.color+"33",padding:16,marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:16,fontWeight:800,color:tp.team.color,minWidth:24}}>{idx+1}</div>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:16,fontWeight:700,color:tp.team.color}}>{tp.team.name}</div>
                    <div style={{fontSize:11,color:"#4A5E78"}}>{tp.playerCount} active player{tp.playerCount!==1?"s":""} this week</div>
                  </div>
                  <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:28,fontWeight:800,color:tp.team.color}}>{tp.total}<span style={{fontSize:11,color:"#4A5E78",fontWeight:400,marginLeft:2}}>pts</span></div>
                </div>
                {/* Progress bar */}
                <div style={{background:"#080C14",borderRadius:6,height:6,marginBottom:8,overflow:"hidden"}}>
                  <div style={{background:tp.team.color,height:"100%",borderRadius:6,width:(tp.total/maxTeamPts*100)+"%",transition:"width 0.5s"}} />
                </div>
                {tp.best.pts > 0 && (
                  <div style={{fontSize:11,color:"#4A5E78"}}>
                    Best: <span style={{color:"#E2EAF4",fontWeight:700}}>{tp.best.name}</span>
                    <span style={{color:tp.team.color,marginLeft:4}}>{tp.best.pts} pts</span>
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
