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

// Returns YYYY-MM-DD strings for Sat and Fri of the week
function getWeekBounds(weekOffset) {
  // Today in IST as date string
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + IST_OFFSET);
  const day = nowIST.getUTCDay(); // 0=Sun,6=Sat
  // Days since last Saturday
  const daysSinceSat = day === 6 ? 0 : day + 1;
  // Get Saturday date
  const sat = new Date(nowIST);
  sat.setUTCDate(nowIST.getUTCDate() - daysSinceSat - weekOffset * 7);
  // Get Friday (Sat + 6)
  const fri = new Date(sat);
  fri.setUTCDate(sat.getUTCDate() + 6);
  // Return as YYYY-MM-DD strings
  const fmt = d => d.toISOString().split("T")[0];
  const satStr = fmt(sat);
  const friStr = fmt(fri);
  const label = sat.toLocaleDateString("en-IN",{day:"numeric",month:"short"}) + " — " + fri.toLocaleDateString("en-IN",{day:"numeric",month:"short"});
  return { satStr, friStr, label };
}

function medalColor(rank) {
  if (rank === 1) return "#F5A623";
  if (rank === 2) return "#94A3B8";
  if (rank === 3) return "#CD7F32";
  return "#4A5E78";
}

export default function MVPStats({ players, teams, assignments, points, captains, matches, onClose }) {
  const [view, setView] = useState("weekly");
  const [weekOffset, setWeekOffset] = useState(0);

  const week = useMemo(() => getWeekBounds(weekOffset), [weekOffset]);

  // All matches that have stats synced
  const allStatsMatches = useMemo(() =>
    matches.filter(m => players.some(p => points[p.id]?.[m.id]))
  , [matches, players, points]);

  // Matches in selected week (compare date strings directly)
  const weekMatches = useMemo(() => {
    if (weekOffset === -1) return allStatsMatches;
    return allStatsMatches.filter(m => m.date >= week.satStr && m.date <= week.friStr);
  }, [allStatsMatches, week, weekOffset]);

  // Per-match per-player rows (BASE POINTS ONLY, no C/VC multiplier)
  const matchRows = useMemo(() => {
    const rows = [];
    for (const match of weekMatches) {
      for (const player of players) {
        const d = points[player.id]?.[match.id];
        if (!d || !d.base) continue;
        const team = teams.find(t => t.id === assignments[player.id]);
        if (!team) continue;
        rows.push({
          player, team, match,
          pts: d.base,
          matchLabel: match.team1 + " vs " + match.team2,
          matchDate: match.date,
        });
      }
    }
    return rows.sort((a, b) => b.pts - a.pts);
  }, [weekMatches, players, points, teams, assignments]);

  // All time total per player (base points only)
  const allTimeRows = useMemo(() => {
    const rows = [];
    for (const player of players) {
      const team = teams.find(t => t.id === assignments[player.id]);
      if (!team) continue;
      const playerPts = points[player.id] || {};
      const total = Object.values(playerPts).reduce((sum, d) => sum + (d?.base || 0), 0);
      if (total > 0) rows.push({ player, team, total });
    }
    return rows.sort((a, b) => b.total - a.total);
  }, [players, teams, assignments, points]);

  // Team weekly totals (base points only)
  const teamPerformance = useMemo(() => {
    return teams.map(team => {
      let total = 0;
      let best = { name:"—", pts:0 };
      for (const player of players.filter(p => assignments[p.id] === team.id)) {
        let playerTotal = 0;
        for (const match of weekMatches) {
          const d = points[player.id]?.[match.id];
          if (d?.base) playerTotal += d.base;
        }
        total += playerTotal;
        if (playerTotal > best.pts) best = { name: player.name, pts: playerTotal };
      }
      return { team, total, best };
    }).sort((a, b) => b.total - a.total);
  }, [teams, players, assignments, points, weekMatches]);

  const maxTeamPts = teamPerformance[0]?.total || 1;

  const styles = {
    wrap: { position:"fixed", inset:0, background:"rgba(8,12,20,0.98)", zIndex:600, display:"flex", flexDirection:"column", fontFamily:"Barlow Condensed,sans-serif", overflowY:"auto" },
    header: { background:"#0A0F1A", borderBottom:"1px solid #1E2D45", padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:10 },
    tab: (active) => ({ background:active?"#F5A62322":"transparent", border:"1px solid "+(active?"#F5A62366":"#1E2D45"), borderRadius:8, padding:"6px 14px", color:active?"#F5A623":"#4A5E78", fontFamily:"Barlow Condensed,sans-serif", fontWeight:700, fontSize:12, cursor:"pointer", letterSpacing:1 }),
  };

  const emptyMsg = (
    <div style={{textAlign:"center",padding:48,color:"#4A5E78"}}>
      <div style={{fontSize:32,marginBottom:12}}>📊</div>
      <div style={{fontSize:14}}>No stats synced for this period</div>
      <div style={{fontSize:12,marginTop:4}}>{weekOffset===-1?"All time":week.label}</div>
    </div>
  );

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:20,fontWeight:700,color:"#F5A623",letterSpacing:2}}>MVP STATS</div>
          <div style={{fontSize:10,color:"#4A5E78",marginTop:2}}>
            {weekOffset===-1?"All time":week.label} • {weekMatches.length} match{weekMatches.length!==1?"es":""}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setWeekOffset(w=>w===-1?0:w+1)} style={{background:"transparent",border:"1px solid #1E2D45",borderRadius:6,padding:"4px 10px",color:"#4A5E78",cursor:"pointer",fontSize:13}}>‹</button>
          <span style={{fontSize:11,color:"#4A5E78",minWidth:72,textAlign:"center"}}>
            {weekOffset===-1?"All time":weekOffset===0?"This week":weekOffset===1?"Last week":weekOffset+" wks ago"}
          </span>
          <button onClick={()=>setWeekOffset(w=>w===0?-1:Math.max(-1,w-1))} style={{background:"transparent",border:"1px solid #1E2D45",borderRadius:6,padding:"4px 10px",color:"#4A5E78",cursor:"pointer",fontSize:13}}>›</button>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"#4A5E78",fontSize:22,cursor:"pointer",marginLeft:4}}>✕</button>
        </div>
      </div>

      <div style={{display:"flex",gap:8,padding:"12px 16px",borderBottom:"1px solid #1E2D45",background:"#080C14"}}>
        <button style={styles.tab(view==="weekly")} onClick={()=>setView("weekly")}>MATCH STATS</button>
        <button style={styles.tab(view==="alltime")} onClick={()=>setView("alltime")}>ALL TIME</button>
        <button style={styles.tab(view==="team")} onClick={()=>setView("team")}>BY TEAM</button>
      </div>

      <div style={{padding:"16px",maxWidth:600,margin:"0 auto",width:"100%"}}>

        {/* MATCH STATS — per match per player, base points only */}
        {view==="weekly" && (
          <div>
            <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,marginBottom:12}}>PLAYER PERFORMANCE (BASE POINTS)</div>
            {matchRows.length === 0 ? emptyMsg : matchRows.map((row, idx) => (
              <div key={row.player.id+row.match.id} style={{background:"#0E1521",borderRadius:10,border:"1px solid "+row.team.color+"33",padding:"10px 14px",marginBottom:6,display:"flex",alignItems:"center",gap:10}}>
                <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:18,fontWeight:700,color:medalColor(idx+1),minWidth:24,textAlign:"center"}}>{idx+1}</div>
                <div style={{width:8,height:8,borderRadius:"50%",background:row.team.color,flexShrink:0}} />
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontWeight:700,fontSize:14,color:"#E2EAF4"}}>{row.player.name}</span>
                    <TierBadge tier={row.player.tier} />
                    <span style={{fontSize:10,color:row.team.color,fontWeight:700}}>{row.team.name}</span>
                  </div>
                  <div style={{fontSize:11,color:"#4A5E78",marginTop:1}}>
                    <span style={{color:ROLE_COLORS[row.player.role]||"#4A5E78"}}>{row.player.role}</span>
                    <span style={{marginLeft:6}}>{row.matchLabel}</span>
                    <span style={{marginLeft:6}}>{row.matchDate}</span>
                  </div>
                </div>
                <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:24,fontWeight:800,color:medalColor(idx+1),minWidth:48,textAlign:"right"}}>
                  {row.pts}<span style={{fontSize:10,color:"#4A5E78",fontWeight:400,marginLeft:2}}>pts</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ALL TIME */}
        {view==="alltime" && (
          <div>
            <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,marginBottom:12}}>ALL TIME BASE POINTS</div>
            {allTimeRows.length === 0 ? emptyMsg : allTimeRows.map((row, idx) => (
              <div key={row.player.id} style={{background:"#0E1521",borderRadius:10,border:"1px solid "+row.team.color+"33",padding:"10px 14px",marginBottom:6,display:"flex",alignItems:"center",gap:10}}>
                <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:18,fontWeight:700,color:medalColor(idx+1),minWidth:24,textAlign:"center"}}>{idx+1}</div>
                <div style={{width:8,height:8,borderRadius:"50%",background:row.team.color,flexShrink:0}} />
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontWeight:700,fontSize:14,color:"#E2EAF4"}}>{row.player.name}</span>
                    <TierBadge tier={row.player.tier} />
                    <span style={{fontSize:10,color:row.team.color,fontWeight:700}}>{row.team.name}</span>
                  </div>
                  <div style={{fontSize:11,color:"#4A5E78",marginTop:1}}>
                    <span style={{color:ROLE_COLORS[row.player.role]||"#4A5E78"}}>{row.player.role}</span>
                    <span style={{marginLeft:6}}>{row.player.iplTeam}</span>
                    <span style={{marginLeft:6,color:"#4A5E78"}}>{Object.keys(points[row.player.id]||{}).length} matches</span>
                  </div>
                </div>
                <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:24,fontWeight:800,color:medalColor(idx+1),minWidth:48,textAlign:"right"}}>
                  {row.total}<span style={{fontSize:10,color:"#4A5E78",fontWeight:400,marginLeft:2}}>pts</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TEAM PERFORMANCE */}
        {view==="team" && (
          <div>
            <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,marginBottom:12}}>TEAM WEEKLY PERFORMANCE (BASE POINTS)</div>
            {teamPerformance.every(t=>t.total===0) ? emptyMsg : teamPerformance.map((tp, idx) => (
              <div key={tp.team.id} style={{background:"#0E1521",borderRadius:12,border:"1px solid "+tp.team.color+"33",padding:16,marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:16,fontWeight:800,color:medalColor(idx+1),minWidth:24}}>{idx+1}</div>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:16,fontWeight:700,color:tp.team.color}}>{tp.team.name}</div>
                  </div>
                  <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:28,fontWeight:800,color:tp.team.color}}>
                    {tp.total}<span style={{fontSize:11,color:"#4A5E78",fontWeight:400,marginLeft:2}}>pts</span>
                  </div>
                </div>
                <div style={{background:"#080C14",borderRadius:6,height:6,marginBottom:8,overflow:"hidden"}}>
                  <div style={{background:tp.team.color,height:"100%",borderRadius:6,width:(tp.total/maxTeamPts*100)+"%"}} />
                </div>
                {tp.best.pts > 0 && (
                  <div style={{fontSize:11,color:"#4A5E78"}}>
                    Top player: <span style={{color:"#E2EAF4",fontWeight:700}}>{tp.best.name}</span>
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
