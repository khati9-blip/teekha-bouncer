import React, { useState } from 'react';
import { calcPoints, calcBreakdown, parseScorecardToStats, fetchLiveScorecard } from './utils.js';

export default function SmartStatsModal({ match, players, assignments, existingStats, onSave, onClose, pointsConfig, T, fonts }) {
  const matchPlayers = players.filter(p => assignments[p.id]);
  const emptyStats = (p) => ({ runs:0, balls:0, fours:0, sixes:0, wickets:0, economy:"", overs:0, maidens:0, catches:0, stumpings:0, runouts:0, longestSix:false, mom:false, playingXI:false, dismissed:false, played:false });

  const [stats, setStats] = React.useState(() => {
    const s = {};
    matchPlayers.forEach(p => {
      const existing = existingStats?.[p.id];
      s[p.id] = existing ? { ...existing, played:true } : emptyStats(p);
    });
    return s;
  });


  const fetchFromCricketData = async () => {
    if (!match.cricbuzzId) { setFetchStatus("❌ No match ID available"); return; }
    setFetching(true);
    setFetchStatus("Fetching from CricketData…");
    try {
      // CricketData: /cricket-match-scoreboard?matchid=ID (correct endpoint)
      const res = await fetch("/api/cricketdata?path=cricket-match-scoreboard&matchid=" + match.cricbuzzId);
      const data = await res.json();
      if (data?.message?.includes("not exist") || data?.error) {
        setFetchStatus("❌ CricketData: " + (data.message || data.error || "scorecard not found"));
        setFetching(false); return;
      }


      // CricketData scorecard structure
      // CricketData structure: response.firstInnings & response.secondInnings
      const innings = [data?.response?.firstInnings, data?.response?.secondInnings].filter(Boolean);

      const nameToPlayer = {};
      matchPlayers.forEach(p => {
        nameToPlayer[p.name.toLowerCase().trim()] = p;
        p.name.toLowerCase().split(" ").forEach(part => { if(part.length>2) nameToPlayer[part.trim()] = p; });
      });
      const findPlayer = (name) => {
        if (!name) return null;
        const n = name.toLowerCase().trim();
        if (nameToPlayer[n]) return nameToPlayer[n];
        const parts = n.split(" ");
        for (const part of parts) { if (part.length >= 5 && nameToPlayer[part]) return nameToPlayer[part]; }
        return null;
      };

      const newStats = {...stats};
      let matched = 0;

      innings.forEach(inn => {
        // Batting
        (inn.batters || inn.batting || innings.batting || []).forEach(b => {
          const p = findPlayer(b.name || b.batsman?.name);
          if (!p) return;
          matched++;
          newStats[p.id] = {
            ...newStats[p.id],
            runs: parseInt(b.r || b.runs || 0),
            balls: parseInt(b.b || b.balls || 0),
            fours: parseInt(b["4s"] || b.fours || 0),
            sixes: parseInt(b["6s"] || b.sixes || 0),
            dismissed: !!(b.dismissal || b.wicket),
            played: true,
          };
        });
        // Bowling
        (inn.bowlers || inn.bowling || []).forEach(bw => {
          const p = findPlayer(bw.name || bw.bowler?.name);
          if (!p) return;
          matched++;
          const overs = parseFloat(bw.o || bw.overs || 0);
          const runs = parseInt(bw.r || bw.runs || 0);
          const eco = overs > 0 ? Math.round((runs/overs)*100)/100 : 0;
          newStats[p.id] = {
            ...newStats[p.id],
            wickets: parseInt(bw.w || bw.wickets || 0),
            overs,
            economy: eco,
            maidens: parseInt(bw.m || bw.maidens || 0),
            played: true,
          };
        });
      });

      setStats(newStats);
      setFetchStatus("✅ CricketData: filled " + matched + " player entries");
    } catch(e) {
      setFetchStatus("❌ CricketData: " + e.message);
    }
    setFetching(false);
  };

  const [search, setSearch] = React.useState("");
  const [activeTab, setActiveTab] = React.useState("batting");
  const [fetching, setFetching] = React.useState(false);
  const [fetchStatus, setFetchStatus] = React.useState("");
  const [showPasteModal, setShowPasteModal] = React.useState(false);
  const [pasteText, setPasteText] = React.useState("");
  const [parsing, setParsing] = React.useState(false);

  const parseScorecard = async () => {
    if (!pasteText.trim()) return;
    setParsing(true);
    setFetchStatus("AI parsing scorecard…");
    try {
      const playerList = matchPlayers.map(p => p.name + " (" + (p.iplTeam||"") + ")").join(", ");
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 4000,
          system: "You are a cricket scorecard parser. Extract player stats from the scorecard text and return ONLY a valid JSON array. No markdown, no explanation.",
          messages: [{ role: "user", content: `Parse this cricket scorecard and extract stats for every player mentioned.

IMPORTANT RULES:
1. CATCHES: Look for "c PlayerName b ..." in batting section — the fielder after "c" took a catch. Also look for "Caught" entries. Count all catches per fielder.
2. RUN OUTS: Look for "run out (PlayerName)" or "run out (PlayerName/PlayerName)" — the fielder(s) in brackets get a run-out credit. Count all run-outs per fielder.
3. STUMPINGS: Look for "st PlayerName b ..." — the keeper after "st" gets a stumping.
4. WICKETS: Count wickets from bowling figures.
5. ECONOMY: Calculate from runs/overs if given.
6. MOM: Look for "Player of the Match" or "Man of the Match".
7. DISMISSED: true if the batsman got out (not "not out").
8. Include ALL players who appear anywhere in the scorecard.

Players to find: ${playerList}

Scorecard:
${pasteText}

Return ONLY a JSON array: [{"name":"Player Name","runs":0,"balls":0,"fours":0,"sixes":0,"dismissed":false,"wickets":0,"overs":0,"economy":0,"maidens":0,"catches":0,"stumpings":0,"runouts":0,"longestSix":false,"mom":false}]
Only include players who appear in the scorecard. Match names as closely as possible.` }],
        }),
      });
      const data = await res.json();
      const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      const clean = text.replace(/^```json\s*/m,"").replace(/^```\s*/m,"").replace(/```\s*$/m,"").trim();
      let parsed = [];
      try { parsed = JSON.parse(clean); } catch { throw new Error("Could not parse AI response"); }
      
      // Match parsed players to our matchPlayers — strict matching to avoid wrong assignments
      const nameMap = {};
      const lastNameMap = {};
      const firstNameMap = {};
      matchPlayers.forEach(p => {
        const full = p.name.toLowerCase();
        nameMap[full] = p;
        const parts = full.split(" ");
        const last = parts[parts.length - 1];
        const first = parts[0];
        // Last name map — only if unique across all players
        if (last.length >= 4) {
          if (!lastNameMap[last]) lastNameMap[last] = p;
          else lastNameMap[last] = null; // conflict — ambiguous, don't use
        }
        // First name map — only if unique
        if (first.length >= 4) {
          if (!firstNameMap[first]) firstNameMap[first] = p;
          else firstNameMap[first] = null;
        }
        // first+last for players with middle names
        if (parts.length > 2) nameMap[parts[0] + " " + last] = p;
      });
      const findP = (name) => {
        const n = (name||"").toLowerCase().trim();
        // 1. Exact full name match
        if (nameMap[n]) return nameMap[n];
        // 2. Unambiguous last name match
        const parts = n.split(" ");
        const last = parts[parts.length - 1];
        const first = parts[0];
        if (last.length >= 4 && lastNameMap[last]) return lastNameMap[last];
        // 3. Unambiguous first name match
        if (first.length >= 4 && firstNameMap[first]) return firstNameMap[first];
        return null;
      };

      const newStats = {...stats};
      let matched = 0;
      for (const entry of parsed) {
        const p = findP(entry.name);
        if (!p) continue;
        // Validate: player's FIRST name must appear in the raw scorecard text
        const firstName = p.name.toLowerCase().split(" ")[0];
        if (firstName.length >= 4 && !pasteText.toLowerCase().includes(firstName)) continue;
        if (firstName.length < 4) {
          // For short first names, require full name
          if (!pasteText.toLowerCase().includes(p.name.toLowerCase().split(" ").slice(0,2).join(" "))) continue;
        }
        matched++;
        newStats[p.id] = {
          ...newStats[p.id],
          runs: +entry.runs || 0,
          balls: +entry.balls || 0,
          fours: +entry.fours || 0,
          sixes: +entry.sixes || 0,
          dismissed: !!entry.dismissed,
          wickets: +entry.wickets || 0,
          overs: +entry.overs || 0,
          economy: +entry.economy || 0,
          maidens: +entry.maidens || 0,
          catches: parseInt(entry.catches) || 0,
          stumpings: parseInt(entry.stumpings) || 0,
          runouts: parseInt(entry.runouts) || 0,
          longestSix: !!entry.longestSix,
          mom: !!entry.mom,
          played: true,
        };
      }

      // Reset fielding stats before regex scan — AI counts are unreliable, regex is authoritative
      for (const pid of Object.keys(newStats)) {
        newStats[pid].catches = 0;
        newStats[pid].stumpings = 0;
        newStats[pid].runouts = 0;
      }

      // Regex scan of raw scorecard for catches/runouts/stumpings — more reliable than AI
      const lines = pasteText.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        // Catches: lines starting with "c PlayerName b ..."
        const catchMatch = trimmed.match(/^c\s+([A-Za-z][A-Za-z\s\-]+?)\s+b\s/i);
        if (catchMatch) {
          const fielderName = catchMatch[1].trim();
          const fp = findP(fielderName);
          if (fp) {
            if (!newStats[fp.id]) newStats[fp.id] = { runs:0, balls:0, fours:0, sixes:0, dismissed:false, wickets:0, overs:0, economy:0, maidens:0, catches:0, stumpings:0, runouts:0, longestSix:false, mom:false, played:true };
            newStats[fp.id].catches = (parseInt(newStats[fp.id].catches) || 0) + 1;
          }
        }
        // Stumpings: "st PlayerName b ..."
        const stumpMatch = trimmed.match(/^st\s+([A-Za-z][A-Za-z\s\-]+?)\s+b\s/i);
        if (stumpMatch) {
          const keeperName = stumpMatch[1].trim();
          const kp = findP(keeperName);
          if (kp) {
            if (!newStats[kp.id]) newStats[kp.id] = { runs:0, balls:0, fours:0, sixes:0, dismissed:false, wickets:0, overs:0, economy:0, maidens:0, catches:0, stumpings:0, runouts:0, longestSix:false, mom:false, played:true };
            newStats[kp.id].stumpings = (parseInt(newStats[kp.id].stumpings) || 0) + 1;
          }
        }
        // Run outs: "run out (PlayerName)" or "run out (P1/P2)"
        const roMatch = trimmed.match(/run\s+out\s+\(([^)]+)\)/i);
        if (roMatch) {
          for (const name of roMatch[1].split("/")) {
            const rp = findP(name.trim());
            if (rp) {
              if (!newStats[rp.id]) newStats[rp.id] = { runs:0, balls:0, fours:0, sixes:0, dismissed:false, wickets:0, overs:0, economy:0, maidens:0, catches:0, stumpings:0, runouts:0, longestSix:false, mom:false, played:true };
              newStats[rp.id].runouts = (parseInt(newStats[rp.id].runouts) || 0) + 1;
            }
          }
        }
      }

      setStats(newStats);
      setFetchStatus("✅ Parsed " + matched + " players from scorecard");
      setShowPasteModal(false);
      setPasteText("");
    } catch(e) {
      setFetchStatus("❌ Parse failed: " + e.message);
    }
    setParsing(false);
  };

  const upd = (pid, field, val) => setStats(s => ({...s, [pid]: {...s[pid], [field]: val}}));

  const playingPlayers = matchPlayers.filter(p => stats[p.id]?.played);

  const filteredPlayers = matchPlayers.filter(p => {
    const s = search.toLowerCase();
    return p.name.toLowerCase().includes(s) || (p.iplTeam||"").toLowerCase().includes(s);
  });

  // ── Fetch from Cricbuzz ──
  const fetchFromCricbuzz = async () => {
    if (!match.cricbuzzId) {
      setFetchStatus("⚠️ No Cricbuzz ID for this match. Please enter stats manually.");
      return;
    }
    setFetching(true);
    setFetchStatus("Fetching scorecard from Cricbuzz…");
    try {
      // Use hscard endpoint (available on free plan)
      const res = await fetch(`/api/cricbuzz?path=${encodeURIComponent("mcenter/v1/" + match.cricbuzzId + "/hscard")}`);
      const data = await res.json();
      if (data.message) throw new Error(data.message);

      // Build name lookup from our players
      const nameToPlayer = {};
      matchPlayers.forEach(p => {
        nameToPlayer[p.name.toLowerCase().trim()] = p;
        // Also index by last name and first name
        const parts = p.name.toLowerCase().split(" ");
        parts.forEach(part => { if (part.length > 2) nameToPlayer[part.trim()] = p; });
      });

      const findPlayer = (name) => {
        if (!name) return null;
        const n = name.toLowerCase().trim();

        // 1. Exact full name match — always trust this
        if (nameToPlayer[n]) return nameToPlayer[n];

        // 2. Match by FULL last name (surname) — must be 5+ chars
        // e.g. Cricbuzz "Shivam Dube" → last name "dube" → find "Shivam Dube" in our list
        const nParts = n.split(" ");
        const nLast = nParts[nParts.length - 1];

        // Only match by last name if it's unique enough (5+ chars)
        if (nLast.length >= 5) {
          // Find all players with this last name
          const candidates = Object.entries(nameToPlayer).filter(([key]) => {
            const kParts = key.split(" ");
            return kParts[kParts.length - 1] === nLast;
          });
          // Only use if exactly ONE candidate — avoids false matches between similarly surnamed players
          if (candidates.length === 1) return candidates[0][1];
        }

        // 3. Full name starts-with match (handles nickname vs full name)
        // e.g. "virat" matching "virat kohli" — only if 6+ chars
        for (const [key, pl] of Object.entries(nameToPlayer)) {
          if (key.length >= 6 && n.length >= 6) {
            if (key === n) return pl;
            // Both must share first AND last name tokens
            const kParts = key.split(" ");
            if (kParts.length >= 2 && nParts.length >= 2) {
              const firstMatch = kParts[0] === nParts[0];
              const lastMatch = kParts[kParts.length-1] === nParts[nParts.length-1];
              if (firstMatch && lastMatch) return pl;
            }
          }
        }

        return null;
      };

      const newStats = {...stats};
      let matched = 0;

      for (const inning of (data.scorecard || [])) {
        // Batting — data is array or object of batsmen
        const batArr = Array.isArray(inning.batsman)
          ? inning.batsman
          : Object.values(inning.batsman || {});

        for (const b of batArr) {
          if (!b.name) continue;
          const pl = findPlayer(b.name);
          if (!pl) continue;
          newStats[pl.id] = {
            ...newStats[pl.id],
            played: true,
            runs: +b.runs || 0,
            fours: +b.fours || 0,
            sixes: +b.sixes || 0,
          };
          matched++;

          // Fielding from outdec e.g. "c Phil Salt b Jacob Duffy"
          const out = b.outdec || "";
          if (out.startsWith("c ") && out.includes(" b ")) {
            const fielderName = out.slice(2, out.indexOf(" b ")).trim();
            const fp = findPlayer(fielderName);
            if (fp) {
              newStats[fp.id] = {...(newStats[fp.id]||emptyStats(fp)), played:true, catches:(+(newStats[fp.id]?.catches)||0)+1};
            }
          } else if (out.startsWith("st ")) {
            const keeperName = out.slice(3, out.indexOf(" b ")).trim();
            const kp = findPlayer(keeperName);
            if (kp) {
              newStats[kp.id] = {...(newStats[kp.id]||emptyStats(kp)), played:true, stumpings:(+(newStats[kp.id]?.stumpings)||0)+1};
            }
          } else if (out.toLowerCase().includes("run out")) {
            const roMatch = out.match(/run out \(([^)]+)\)/i);
            if (roMatch) {
              for (const rname of roMatch[1].split("/")) {
                const rp = findPlayer(rname.trim());
                if (rp) {
                  newStats[rp.id] = {...(newStats[rp.id]||emptyStats(rp)), played:true, runouts:(+(newStats[rp.id]?.runouts)||0)+1};
                }
              }
            }
          }
        }

        // Bowling
        const bowlArr = Array.isArray(inning.bowler)
          ? inning.bowler
          : Object.values(inning.bowler || {});

        for (const b of bowlArr) {
          if (!b.name) continue;
          const pl = findPlayer(b.name);
          if (!pl) continue;
          const prev = newStats[pl.id] || emptyStats(pl);
          newStats[pl.id] = {
            ...prev,
            played: true,
            wickets: (+(prev.wickets)||0) + (+b.wickets||0),
            overs: (+(prev.overs)||0) + (+b.overs||0),
            economy: b.economy || prev.economy || "",
          };
          matched++;
        }
      }

      setStats(newStats);
      setFetchStatus(`✅ Fetched! ${matched} player records auto-filled. Review and correct if needed.`);
    } catch(e) {
      setFetchStatus("❌ Cricbuzz fetch failed: " + e.message + ". Enter stats manually below.");
    }
    setFetching(false);
  };

  const submit = () => {
    const result = Object.entries(stats)
      .filter(([pid, s]) => s.played)
      .map(([pid, s]) => ({ playerId:pid, ...s }));
    if (result.length === 0) { alert("Mark at least one player as played"); return; }
    onSave(result);
  };

  // Paste scorecard modal
  const PasteModal = () => !showPasteModal ? null : (
    <div style={{position:"fixed",inset:0,background:"rgba(5,8,16,0.95)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400,padding:20}}>
      <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.purple}44`,width:"100%",maxWidth:500,display:"flex",flexDirection:"column",maxHeight:"85vh"}}>
        <div style={{padding:"18px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:18,color:T.purple,letterSpacing:2}}>📋 PASTE SCORECARD</div>
            <div style={{fontSize:11,color:T.muted,marginTop:2}}>Paste from Cricinfo, Google, anywhere — AI will parse it</div>
          </div>
          <button onClick={()=>{setShowPasteModal(false);setPasteText("");}} style={{background:"#1E2D45",border:"none",borderRadius:8,width:30,height:30,color:T.sub,fontSize:16,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
          <div style={{fontSize:11,color:T.muted,marginBottom:8,lineHeight:1.6}}>
            Copy the scorecard text from any cricket website and paste it below. AI will extract all stats automatically.
          </div>
          <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)}
placeholder="Paste scorecard text here... (e.g. V Kohli c Maxwell b Bumrah 82 (54) 8x4 3x6 / Bumrah 4-0-22-3)"
            rows={12} style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontSize:13,fontFamily:"monospace",outline:"none",resize:"vertical",boxSizing:"border-box"}} />
        </div>
        <div style={{padding:"14px 20px",borderTop:`1px solid ${T.border}`,display:"flex",gap:10}}>
          <button onClick={()=>{setShowPasteModal(false);setPasteText("");}} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:10,padding:11,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
          <button onClick={parseScorecard} disabled={!pasteText.trim()||parsing}
            style={{flex:2,background:"linear-gradient(135deg,#A855F7,#7C3AED)",border:"none",borderRadius:10,padding:11,color:"#fff",fontFamily:fonts.body,fontWeight:800,fontSize:14,cursor:!pasteText.trim()||parsing?"not-allowed":"pointer",opacity:!pasteText.trim()||parsing?0.6:1}}>
            {parsing?"🤖 PARSING…":"🤖 PARSE WITH AI"}
          </button>
        </div>
      </div>
    </div>
  );

  const tabBtn = (tab, label) => (
  <button onClick={()=>setActiveTab(tab)} style={{padding:"10px 18px",border:"none",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:13,letterSpacing:2,background:activeTab===tab?"#4299E1":"transparent",color:activeTab===tab?"#0A0E14":T.muted,borderRadius:0,clipPath:activeTab===tab?"polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)":"none",boxShadow:activeTab===tab?"2px 2px 0 rgba(66,153,225,0.4)":"none",textShadow:activeTab===tab?"1px 1px 0 rgba(255,255,255,0.2)":"none",transition:"all .15s"}}>
    {label}
  </button>
);

  const inp = {width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 4px",color:T.text,fontSize:14,fontFamily:fonts.body,textAlign:"center"};

  return (
    <><PasteModal />
    <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,backdropFilter:"blur(8px)"}}>
  <div style={{background:T.bg,border:`3px solid #4299E1`,borderRadius:0,width:"100%",maxWidth:760,margin:"0 12px",maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"8px 8px 0 rgba(66,153,225,0.3)"}}>

    {/* Header */}
    <div style={{background:"linear-gradient(135deg, #4299E1 0%, #3B82F6 100%)",padding:"20px 28px",borderBottom:"none",flexShrink:0}}>
      <div style={{fontFamily:fonts.display,fontSize:26,fontWeight:900,color:"#0A0E14",letterSpacing:4,textTransform:"uppercase",textShadow:"2px 2px 0 rgba(255,255,255,0.2)"}}>📊 MATCH STATS — M{match.matchNum}</div>
      <div style={{color:"rgba(10,14,20,0.7)",fontSize:12,marginTop:4,fontFamily:fonts.body,letterSpacing:0.5}}>{match.team1} vs {match.team2} • {match.date} • {match.venue}</div>
          <div style={{marginTop:12,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <button onClick={fetchFromCricketData} disabled={fetching}
  style={{background:"linear-gradient(135deg,#2ECC71,#16a34a)",border:"none",borderRadius:0,padding:"10px 20px",color:"#0A0E14",fontFamily:fonts.display,fontWeight:800,fontSize:13,cursor:fetching?"not-allowed":"pointer",opacity:fetching?0.6:1,letterSpacing:1.5,clipPath:"polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)",boxShadow:"3px 3px 0 rgba(22,163,74,0.4)",textShadow:"1px 1px 0 rgba(255,255,255,0.2)"}}>
  {fetching?"⏳ FETCHING…":"🟢 SYNC FROM CRICKETDATA"}
</button>
<button onClick={fetchFromCricbuzz} disabled={fetching}
  style={{background:"transparent",border:`2px solid #F59E0B`,borderRadius:0,padding:"9px 16px",color:"#F59E0B",fontFamily:fonts.display,fontWeight:800,fontSize:12,cursor:fetching?"not-allowed":"pointer",opacity:fetching?0.6:1,letterSpacing:1.5,clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)"}}>
  🟠 CRICBUZZ
</button>
<button onClick={()=>setShowPasteModal(true)} disabled={fetching}
  style={{background:"transparent",border:`2px solid #9F7AEA`,borderRadius:0,padding:"9px 16px",color:"#9F7AEA",fontFamily:fonts.display,fontWeight:800,fontSize:12,cursor:"pointer",letterSpacing:1.5,clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)"}}>
  📋 PASTE SCORECARD
</button>
            {fetchStatus && <span style={{fontSize:12,color:fetchStatus.startsWith("✅")?"#2ECC71":fetchStatus.startsWith("❌")?"#FF3D5A":"#F5A623",marginTop:4,width:"100%"}}>{fetchStatus}</span>}
          </div>
        </div>

        {/* Step 1: Mark players */}
        <div style={{padding:"14px 24px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <div style={{fontSize:11,color:T.muted,letterSpacing:2,fontWeight:700,marginBottom:8}}>
            STEP 1 — MARK WHO PLAYED &nbsp;<span style={{color:T.success}}>({playingPlayers.length} selected)</span>
          </div>
          <input placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}
            style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px",color:T.text,fontSize:13,fontFamily:fonts.body,marginBottom:8,boxSizing:"border-box"}} />
          <div style={{maxHeight:100,overflowY:"auto",display:"flex",flexWrap:"wrap",gap:5}}>
            {filteredPlayers.map(p=>(
              <button key={p.id} onClick={()=>upd(p.id,"played",!stats[p.id]?.played)}
                style={{padding:"4px 10px",borderRadius:20,border:"1px solid "+(stats[p.id]?.played?"#2ECC71":"#1E2D45"),background:stats[p.id]?.played?"#2ECC7122":"transparent",color:stats[p.id]?.played?"#2ECC71":"#4A5E78",fontSize:12,fontFamily:fonts.body,cursor:"pointer",fontWeight:600}}>
                {stats[p.id]?.played?"✓ ":""}{p.name} <span style={{opacity:0.5,fontSize:10}}>({p.iplTeam})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Stats tabs */}
        {playingPlayers.length > 0 && (
          <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
            <div style={{padding:"10px 24px",borderBottom:`1px solid ${T.border}`,flexShrink:0,display:"flex",gap:6,alignItems:"center"}}>
              <span style={{fontSize:11,color:T.muted,letterSpacing:2,fontWeight:700,marginRight:8}}>STEP 2 — ENTER / VERIFY STATS:</span>
              {tabBtn("batting","🏏 BATTING")}
              {tabBtn("bowling","🎳 BOWLING")}
              {tabBtn("fielding","🧤 FIELDING")}
              {tabBtn("preview","👁 PREVIEW")}
            </div>

            <div style={{overflowY:"auto",flex:1,padding:"8px 24px 16px"}}>

              {activeTab==="batting" && (
                <table style={{width:"100%",borderCollapse:"collapse",marginTop:8}}>
                  <thead>
                    <tr style={{fontSize:11,color:T.muted,letterSpacing:1,background:"#0E152188"}}>
                      <th style={{textAlign:"left",padding:"8px 6px",fontWeight:700}}>PLAYER</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:50}}>RUNS</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:45}}>BALLS</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:40}}>4s</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:40}}>6s</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:55}}>OUT</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:55}}>L6</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playingPlayers.map(p=>(
                      <tr key={p.id} style={{borderBottom:`1px solid ${T.border}33`}}>
                        <td style={{padding:"7px 6px",fontSize:13,color:T.text,fontWeight:600,fontFamily:fonts.body}}><div style={{display:"flex",alignItems:"center",gap:4}}>{p.name} {p.tier&&<span style={{fontSize:9,fontWeight:800,letterSpacing:1,padding:"1px 5px",borderRadius:4,fontFamily:fonts.body,textTransform:"uppercase",background:p.tier==="platinum"?"#4A5E7833":p.tier==="gold"?"#F5A62322":p.tier==="silver"?"#94A3B822":"#CD7F3222",border:"1px solid "+(p.tier==="platinum"?"#4A5E7866":p.tier==="gold"?"#F5A62366":p.tier==="silver"?"#94A3B855":"#CD7F3255"),color:p.tier==="platinum"?"#B0BEC5":p.tier==="gold"?"#F5A623":p.tier==="silver"?"#94A3B8":"#CD7F32"}}>{p.tier==="platinum"?"PLAT":p.tier==="gold"?"GOLD":p.tier==="silver"?"SILV":"BRNZ"}</span>}</div><span style={{fontSize:10,color:T.muted}}>{p.iplTeam} • {p.role}</span></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.runs||0} onChange={e=>upd(p.id,"runs",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.balls||0} onChange={e=>upd(p.id,"balls",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.fours||0} onChange={e=>upd(p.id,"fours",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.sixes||0} onChange={e=>upd(p.id,"sixes",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px",textAlign:"center"}}><input type="checkbox" checked={!!stats[p.id]?.dismissed} onChange={e=>upd(p.id,"dismissed",e.target.checked)} style={{width:18,height:18,accentColor:"#FF3D5A"}} /></td>
                        <td style={{padding:"4px",textAlign:"center"}}><input type="checkbox" checked={!!stats[p.id]?.longestSix} onChange={e=>upd(p.id,"longestSix",e.target.checked)} style={{width:18,height:18,accentColor:T.accent}} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab==="bowling" && (
                <table style={{width:"100%",borderCollapse:"collapse",marginTop:8}}>
                  <thead>
                    <tr style={{fontSize:11,color:T.muted,letterSpacing:1,background:"#0E152188"}}>
                      <th style={{textAlign:"left",padding:"8px 6px",fontWeight:700}}>PLAYER</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:55}}>WICKETS</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:50}}>OVERS</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:55}}>ECONOMY</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:50}}>MAIDENS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playingPlayers.map(p=>(
                      <tr key={p.id} style={{borderBottom:`1px solid ${T.border}33`}}>
                        <td style={{padding:"7px 6px",fontSize:13,color:T.text,fontWeight:600,fontFamily:fonts.body}}><div style={{display:"flex",alignItems:"center",gap:4}}>{p.name} {p.tier&&<span style={{fontSize:9,fontWeight:800,letterSpacing:1,padding:"1px 5px",borderRadius:4,fontFamily:fonts.body,textTransform:"uppercase",background:p.tier==="platinum"?"#4A5E7833":p.tier==="gold"?"#F5A62322":p.tier==="silver"?"#94A3B822":"#CD7F3222",border:"1px solid "+(p.tier==="platinum"?"#4A5E7866":p.tier==="gold"?"#F5A62366":p.tier==="silver"?"#94A3B855":"#CD7F3255"),color:p.tier==="platinum"?"#B0BEC5":p.tier==="gold"?"#F5A623":p.tier==="silver"?"#94A3B8":"#CD7F32"}}>{p.tier==="platinum"?"PLAT":p.tier==="gold"?"GOLD":p.tier==="silver"?"SILV":"BRNZ"}</span>}</div><span style={{fontSize:10,color:T.muted}}>{p.iplTeam} • {p.role}</span></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.wickets||0} onChange={e=>upd(p.id,"wickets",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" step="0.1" value={stats[p.id]?.overs||0} onChange={e=>upd(p.id,"overs",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" step="0.01" placeholder="—" value={stats[p.id]?.economy||""} onChange={e=>upd(p.id,"economy",e.target.value)} style={inp} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab==="fielding" && (
                <table style={{width:"100%",borderCollapse:"collapse",marginTop:8}}>
                  <thead>
                    <tr style={{fontSize:11,color:T.muted,letterSpacing:1,background:"#0E152188"}}>
                      <th style={{textAlign:"left",padding:"8px 6px",fontWeight:700}}>PLAYER</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:65}}>CATCHES</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:75}}>STUMPINGS</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:70}}>RUN OUTS</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:45}}>MOM</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:45}}>XI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playingPlayers.map(p=>(
                      <tr key={p.id} style={{borderBottom:`1px solid ${T.border}33`}}>
                        <td style={{padding:"7px 6px",fontSize:13,color:T.text,fontWeight:600,fontFamily:fonts.body}}><div style={{display:"flex",alignItems:"center",gap:4}}>{p.name} {p.tier&&<span style={{fontSize:9,fontWeight:800,letterSpacing:1,padding:"1px 5px",borderRadius:4,fontFamily:fonts.body,textTransform:"uppercase",background:p.tier==="platinum"?"#4A5E7833":p.tier==="gold"?"#F5A62322":p.tier==="silver"?"#94A3B822":"#CD7F3222",border:"1px solid "+(p.tier==="platinum"?"#4A5E7866":p.tier==="gold"?"#F5A62366":p.tier==="silver"?"#94A3B855":"#CD7F3255"),color:p.tier==="platinum"?"#B0BEC5":p.tier==="gold"?"#F5A623":p.tier==="silver"?"#94A3B8":"#CD7F32"}}>{p.tier==="platinum"?"PLAT":p.tier==="gold"?"GOLD":p.tier==="silver"?"SILV":"BRNZ"}</span>}</div><span style={{fontSize:10,color:T.muted}}>{p.iplTeam} • {p.role}</span></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.catches||0} onChange={e=>upd(p.id,"catches",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.stumpings||0} onChange={e=>upd(p.id,"stumpings",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.runouts||0} onChange={e=>upd(p.id,"runouts",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px",textAlign:"center"}}><input type="checkbox" checked={!!stats[p.id]?.mom} onChange={e=>upd(p.id,"mom",e.target.checked)} style={{width:18,height:18,accentColor:T.accent}} /></td>
                        <td style={{padding:"4px",textAlign:"center"}}><input type="checkbox" checked={!!stats[p.id]?.playingXI} onChange={e=>upd(p.id,"playingXI",e.target.checked)} style={{width:18,height:18,accentColor:"#2ECC71"}} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab==="preview" && (
                <div style={{marginTop:8}}>
                  <div style={{fontSize:11,color:T.muted,letterSpacing:2,marginBottom:10}}>POINTS PREVIEW (before captain multiplier)</div>
                  {playingPlayers.sort((a,b)=>calcPoints(stats[b.id]||{}, pointsConfig||DEFAULT_POINTS)-calcPoints(stats[a.id]||{}, pointsConfig||DEFAULT_POINTS)).map(p => {
                    const s = stats[p.id] || {};
                    const pts = calcPoints(s, pointsConfig||DEFAULT_POINTS);
                    const bd = calcBreakdown(s);
                    return (
                      <div key={p.id} style={{background:T.card,borderRadius:8,padding:"10px 14px",marginBottom:6,display:"flex",alignItems:"flex-start",gap:12}}>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:600,fontSize:14,color:T.text,fontFamily:fonts.body}}>{p.name}</div>
                          <div style={{fontSize:11,color:T.muted,marginTop:2}}>{bd.length>0?bd.join(" • "):"No stats"}</div>
                        </div>
                        <div style={{fontFamily:fonts.display,fontSize:24,fontWeight:800,color:pts>0?"#F5A623":"#4A5E78"}}>{pts}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{padding:"14px 24px",borderTop:`1px solid ${T.border}`,display:"flex",gap:10,flexShrink:0}}>
          <button onClick={onClose} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:11,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
          <button onClick={submit} style={{flex:2,background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,border:"none",borderRadius:8,padding:11,color:T.bg,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>✅ SAVE POINTS ({playingPlayers.length} players)</button>
        </div>
      </div>
    </div></>
  );
}
