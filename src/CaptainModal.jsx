import React from "react";
import { T, fonts } from "./Theme";
import { SUPABASE_URL, SB_HEADERS } from "./utils.js";

// ── Push a system notification into pitch chat ────────────────────────────────
async function pushCaptainNotification(text, pitchId) {
  try {
    const chatKey = pitchId + "_chat";
    const res = await fetch(
      SUPABASE_URL + "/rest/v1/league_data?key=eq." + encodeURIComponent(chatKey) + "&select=value",
      { headers: SB_HEADERS }
    );
    const rows = await res.json();
    const chat = rows?.[0]?.value || { messages: [] };
    const msg = {
      id:       Date.now().toString(),
      type:     "system",
      text,
      ts:       Date.now(),
      reactions: {},
    };
    chat.messages = [...(chat.messages || []), msg];
    await fetch(SUPABASE_URL + "/rest/v1/league_data", {
      method:  "POST",
      headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates" },
      body:    JSON.stringify({ key: chatKey, value: chat, updated_at: new Date().toISOString() }),
    });
  } catch(e) { console.warn("Captain notification failed:", e.message); }
}

export default function CaptainModal({ match, teams, players, assignments, captains, points, myTeam, unlocked, isGuest, withPassword, onSave, onClose, pitchId, ruledOut = [] }) {
  const isLocked = !!captains[match.id+"_locked"];

  // Local state to avoid stale closure bug — copy on open, save on close
  const [local, setLocal] = React.useState(() => {
    const init = {};
    teams.forEach(t => { init[t.id] = { ...(captains[match.id+"_"+t.id] || {}) }; });
    return init;
  });

  const canEdit = (teamId) => {
    if (isLocked) return false;
    if (isGuest) return false;
    if (unlocked) return true; // admin can edit all
    return myTeam?.id === teamId; // team managers only their own
  };

  const handleChange = (teamId, role, value) => {
    setLocal(prev => ({
      ...prev,
      [teamId]: { ...prev[teamId], [role]: value }
    }));
  };

  const buildNotifications = (teamsToCheck, latestCaptains) => {
    const msgs = [];
    for (const t of teamsToCheck) {
      const oldCap = latestCaptains[match.id + "_" + t.id] || {};
      const newCap = local[t.id] || {};
      const getName = (pid) => players.find(p => p.id === pid)?.name || "—";

      const capChanged = newCap.captain && newCap.captain !== oldCap.captain;
      const vcChanged  = newCap.vc && newCap.vc !== oldCap.vc;
      const isNew = !oldCap.captain && !oldCap.vc;

      if (!capChanged && !vcChanged) continue;

      if (isNew || (capChanged && vcChanged)) {
        msgs.push(`👑 ${t.name} set ${getName(newCap.captain)} as Captain & ${getName(newCap.vc)} as VC — M${match.matchNum}`);
      } else if (capChanged) {
        const from = oldCap.captain ? `${getName(oldCap.captain)} → ` : "";
        msgs.push(`🔄 ${t.name} changed Captain: ${from}${getName(newCap.captain)} — M${match.matchNum}`);
      } else if (vcChanged) {
        const from = oldCap.vc ? `${getName(oldCap.vc)} → ` : "";
        msgs.push(`🔄 ${t.name} changed VC: ${from}${getName(newCap.vc)} — M${match.matchNum}`);
      }
    }
    return msgs;
  };

  const saveAndClose = async () => {
    try {
      const res = await fetch(
        SUPABASE_URL + `/rest/v1/league_data?key=eq.${encodeURIComponent(pitchId + "_captains")}&select=value`,
        { headers: SB_HEADERS }
      );
      const data = await res.json();
      const latestCaptains = data?.[0]?.value || {};
      if (latestCaptains[match.id + "_locked"]) {
        alert("🔒 Admin has locked C/VC selections for this match. Your changes were not saved.");
        onClose();
        return;
      }
      const updated = { ...latestCaptains };
      const teamsToCheck = unlocked ? teams : (myTeam ? [myTeam] : []);
      if (unlocked) {
        teams.forEach(t => { updated[match.id + "_" + t.id] = local[t.id]; });
      } else if (myTeam) {
        updated[match.id + "_" + myTeam.id] = local[myTeam.id];
      }
      onSave(updated);
      // Push notifications for each team that changed C/VC
      const notifications = buildNotifications(teamsToCheck, latestCaptains);
      for (const msg of notifications) await pushCaptainNotification(msg, pitchId);
      onClose();
    } catch (e) {
      const updated = { ...captains };
      if (updated[match.id + "_locked"]) {
        alert("🔒 C/VC is locked. Your changes were not saved.");
        onClose();
        return;
      }
      if (unlocked) {
        teams.forEach(t => { updated[match.id + "_" + t.id] = local[t.id]; });
      } else if (myTeam) {
        updated[match.id + "_" + myTeam.id] = local[myTeam.id];
      }
      onSave(updated);
      onClose();
    }
  };

  return (
  <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:16,fontFamily:fonts.body,backdropFilter:"blur(8px)"}}>
    <div style={{background:T.bg,border:`3px solid ${isLocked?"#FF3D5A":"#F59E0B"}`,borderRadius:0,padding:0,width:"100%",maxWidth:500,maxHeight:"90vh",overflow:"hidden",boxShadow:`6px 6px 0 ${isLocked?"rgba(255,61,90,0.3)":"rgba(245,158,11,0.3)"}`}}>
      {/* Header */}
      <div style={{background:isLocked?"linear-gradient(135deg, #FF3D5A 0%, #DC2626 100%)":"linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",padding:"18px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontFamily:fonts.display,fontSize:24,fontWeight:900,color:"#0A0E14",letterSpacing:3,textTransform:"uppercase",textShadow:"2px 2px 0 rgba(255,255,255,0.2)"}}>
            {isLocked?"🔒 C/VC LOCKED":"👑 SET CAPTAIN & VC"}
          </div>
          <div style={{fontSize:11,color:"rgba(10,14,20,0.7)",marginTop:4,fontFamily:fonts.body,letterSpacing:1}}>
            Match {match.matchNum} • {match.team1} vs {match.team2}
          </div>
        </div>
        <button onClick={onClose} style={{background:"rgba(10,14,20,0.3)",border:"none",color:"#0A0E14",fontSize:24,cursor:"pointer",width:36,height:36,borderRadius:0,fontWeight:300,clipPath:"polygon(3px 0%, 100% 0%, calc(100% - 3px) 100%, 0% 100%)"}}>×</button>
      </div>

      {/* Content wrapper */}
      <div style={{padding:24,maxHeight:"calc(90vh - 200px)",overflowY:"auto"}}>

        {isLocked && <div style={{background:T.dangerBg,border:`1px solid ${T.danger}33`,borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:T.danger}}>🔒 Captain/VC selections are locked.</div>}

        {teams.map(team => {
          const cap = local[team.id] || {};
          // Only show players whose iplTeam is one of the two match teams AND currently assigned to this team
          const matchTeams = [match.team1, match.team2].map(t => t.toLowerCase().trim());
          const teamPlayers = players.filter(p =>
  assignments[p.id] === team.id &&
  !ruledOut.includes(p.id) &&
  matchTeams.some(mt => (p.iplTeam || "").toLowerCase().trim().includes(mt) || mt.includes((p.iplTeam || "").toLowerCase().trim()))
);
          const validPids = new Set(teamPlayers.map(p => p.id));
          // Clear stale C/VC selections — if saved player is no longer in squad, treat as unset
          const cleanCap = {
            captain: validPids.has(cap.captain) ? cap.captain : "",
            vc:      validPids.has(cap.vc)      ? cap.vc      : "",
          };
          const editable = canEdit(team.id);
          const isMyTeam = myTeam?.id === team.id;

          return (
            <div key={team.id} style={{background:T.card,border:`3px solid ${isMyTeam?team.color:team.color+"44"}`,borderLeft:`6px solid ${team.color}`,borderRadius:0,padding:16,marginBottom:12,opacity:(!editable&&!isLocked&&!unlocked&&myTeam&&!isMyTeam)?0.5:1,boxShadow:isMyTeam?`3px 3px 0 ${team.color}33`:"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:14,color:team.color}}>{team.name}</div>
                {isMyTeam && <span style={{fontSize:9,background:team.color+"22",color:team.color,border:"1px solid "+team.color+"44",borderRadius:10,padding:"1px 7px",fontWeight:700,letterSpacing:0.5}}>YOUR TEAM</span>}
                {!editable && !isLocked && !unlocked && myTeam && !isMyTeam && (
                  <span style={{fontSize:9,color:T.muted,background:"#1E2D4555",border:`1px solid ${T.border}`,borderRadius:10,padding:"1px 7px",fontWeight:700}}>VIEW ONLY</span>
                )}
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {["captain","vc"].map(role => (
                  <div key={role}>
                    <div style={{fontSize:10,color:T.muted,letterSpacing:1,marginBottom:6}}>{role==="captain"?"⭐ CAPTAIN (2×)":"🥈 VICE CAPTAIN (1.5×)"}</div>
                    {editable ? (
                      teamPlayers.length === 0 ? (
                        <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",fontSize:12,color:T.muted,fontFamily:fonts.body}}>
                          No players from {match.team1} or {match.team2}
                        </div>
                      ) : (
                      <select value={cleanCap[role]||""} onChange={e=>handleChange(team.id, role, e.target.value)}
                        style={{width:"100%",background:T.bg,border:"1px solid "+(isMyTeam?team.color+"44":"#1E2D45"),borderRadius:8,padding:"7px 10px",color:T.text,fontSize:13,fontFamily:fonts.body,cursor:"pointer",outline:"none"}}>
                        <option value="">— None —</option>
                        {teamPlayers.map(p=>(
                          <option key={p.id} value={p.id} disabled={(role==="vc"&&cleanCap.captain===p.id)||(role==="captain"&&cleanCap.vc===p.id)}>
                            {p.name} ({p.iplTeam})
                          </option>
                        ))}
                      </select>
                      )
                    ) : (
                      <div style={{background:T.bg,borderRadius:8,padding:"8px 12px",fontWeight:700,color:role==="captain"?"#F5A623":"#94A3B8",fontSize:14}}>
                        {teamPlayers.find(p=>p.id===cleanCap[role])?.name||"—"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        </div>
      
      {/* Bottom buttons */}
      <div style={{padding:"16px 24px",borderTop:`2px solid ${T.border}`,display:"flex",gap:10,background:T.card}}>
        {!isLocked && unlocked && (
          <button onClick={()=>withPassword(()=>onSave({...captains,[match.id+"_locked"]:true}))}
            style={{flex:1,background:T.dangerBg,border:`2px solid ${T.danger}`,borderRadius:0,padding:14,color:T.danger,fontFamily:fonts.display,fontWeight:800,fontSize:13,letterSpacing:1.5,cursor:"pointer",clipPath:"polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)",transition:"all .2s"}}>
            🔒 LOCK
          </button>
        )}
        {isLocked && unlocked && (
          <button onClick={()=>withPassword(()=>{const u={...captains};delete u[match.id+"_locked"];onSave(u);})}
            style={{flex:1,background:"#2ECC7133",border:`2px solid #2ECC71`,borderRadius:0,padding:14,color:"#2ECC71",fontFamily:fonts.display,fontWeight:800,fontSize:13,letterSpacing:1.5,cursor:"pointer",clipPath:"polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)",transition:"all .2s"}}>
            🔓 UNLOCK
          </button>
        )}
        <button onClick={isLocked ? onClose : saveAndClose}
          style={{flex:2,background:"linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",border:"none",borderRadius:0,padding:14,color:"#0A0E14",fontFamily:fonts.display,fontWeight:900,fontSize:15,letterSpacing:2,cursor:"pointer",clipPath:"polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",boxShadow:"3px 3px 0 rgba(217,119,6,0.4)",textShadow:"1px 1px 0 rgba(255,255,255,0.3)"}}>
          {isLocked?"CLOSE":"✅ SAVE & CLOSE"}
        </button>
      </div>
    </div>
  </div>
);
}
