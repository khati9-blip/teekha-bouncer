import { useState, useEffect } from "react";



async function callAI(userPrompt, system = "Return only valid JSON.") {
  const body = { model: "claude-sonnet-4-6", max_tokens: 1000, system, messages: [{ role: "user", content: userPrompt }] };
  const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
}

function parseJSON(text) {
  return JSON.parse(text.replace(/^```json\s*/m,"").replace(/^```\s*/m,"").replace(/```\s*$/m,"").trim());
}

function calcPoints(s) {
  let p = 0;
  const runs=s.runs||0,fours=s.fours||0,sixes=s.sixes||0,wkts=s.wickets||0,eco=s.economy,ovs=s.overs||0,catches=s.catches||0,stump=s.stumpings||0,ro=s.runouts||0;
  p+=runs; p+=fours*8; p+=sixes*12;
  if(runs>=100)p+=20; else if(runs>=50)p+=10;
  p+=wkts*25;
  if(wkts>=5)p+=15; else if(wkts>=4)p+=8;
  if(ovs>=2&&eco!=null&&eco<6)p+=10;
  p+=catches*8; p+=(stump+ro)*12;
  if(runs>=30&&wkts>=2)p+=15;
  if(s.longestSix)p+=50;
  return Math.round(p);
}

function storeGet(key) { try{const r=(() => { const v = localStorage.getItem(`tbl_${key}`); return v ? { value: v } : null; })();return r?JSON.parse(r.value):null;}catch{return null;} }
function storeSet(key,val) { try{await window.storage.set(`ipl_${key}`,JSON.stringify(val));}catch{} }

async function hashPw(str) {
  const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

function PasswordModal({ onSuccess, onClose, storedHash }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [mode, setMode] = useState(!storedHash ? "set" : "unlock");
  const [newPw, setNewPw] = useState("");
  const [newPwConfirm, setNewPwConfirm] = useState("");

  const titles = { set:"SET LEAGUE PASSWORD", unlock:"SQUAD LOCKED", change:"CHANGE PASSWORD" };
  const subtitles = { set:"Choose a password to protect all squad changes", unlock:"Enter your league password to modify squads", change:"Enter a new password for the league" };
  const icons = { set:"🔐", unlock:"🔒", change:"🔑" };

  const submit = async () => {
    if (mode==="set") {
      if (!pw.trim()){setErr("Enter a password");return;}
      if (pw.length<4){setErr("Min. 4 characters required");return;}
      onSuccess(await hashPw(pw), true);
    } else if (mode==="unlock") {
      if (!pw.trim()){setErr("Enter your password");return;}
      const h=await hashPw(pw);
      if(h===storedHash)onSuccess(null,false);
      else{setErr("❌ Wrong password");setPw("");}
    } else if (mode==="change") {
      if (!newPw.trim()){setErr("Enter a new password");return;}
      if (newPw.length<4){setErr("Min. 4 characters required");return;}
      if (newPw!==newPwConfirm){setErr("Passwords don't match");return;}
      onSuccess(await hashPw(newPw),true);
    }
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,backdropFilter:"blur(8px)"}}>
      <div style={{background:"linear-gradient(145deg,#141E2E,#0E1521)",borderRadius:20,border:"1px solid #1E2D45",padding:36,width:"100%",maxWidth:380,margin:"0 16px",boxShadow:"0 32px 80px rgba(0,0,0,0.8),0 0 0 1px rgba(245,166,35,0.1)",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:120,height:2,background:"linear-gradient(90deg,transparent,#F5A623,transparent)"}} />
        <div style={{fontSize:40,textAlign:"center",marginBottom:10,filter:"drop-shadow(0 0 12px rgba(245,166,35,0.4))"}}>{icons[mode]}</div>
        <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:22,fontWeight:700,color:"#F5A623",textAlign:"center",letterSpacing:3,marginBottom:6}}>{titles[mode]}</div>
        <div style={{fontSize:13,color:"#4A5E78",textAlign:"center",marginBottom:28,lineHeight:1.5}}>{subtitles[mode]}</div>

        {mode!=="change" && (
          <>
            <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,marginBottom:8,textTransform:"uppercase"}}>{mode==="set"?"Choose Password":"Password"}</div>
            <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder={mode==="set"?"Min. 4 characters…":"Enter password…"} autoFocus
              style={{width:"100%",background:"#080C14",border:`1px solid ${err?"#FF3D5A":"#2A3D55"}`,borderRadius:10,padding:"14px 16px",color:"#E2EAF4",fontSize:15,fontFamily:"Barlow Condensed,sans-serif",outline:"none",marginBottom:err?8:24,boxSizing:"border-box"}} />
          </>
        )}
        {mode==="change" && (
          <>
            <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,marginBottom:8,textTransform:"uppercase"}}>New Password</div>
            <input type="password" value={newPw} onChange={e=>{setNewPw(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="Min. 4 characters…" autoFocus
              style={{width:"100%",background:"#080C14",border:`1px solid ${err?"#FF3D5A":"#2A3D55"}`,borderRadius:10,padding:"14px 16px",color:"#E2EAF4",fontSize:15,fontFamily:"Barlow Condensed,sans-serif",outline:"none",marginBottom:12,boxSizing:"border-box"}} />
            <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,marginBottom:8,textTransform:"uppercase"}}>Confirm Password</div>
            <input type="password" value={newPwConfirm} onChange={e=>{setNewPwConfirm(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="Repeat password…"
              style={{width:"100%",background:"#080C14",border:`1px solid ${err?"#FF3D5A":"#2A3D55"}`,borderRadius:10,padding:"14px 16px",color:"#E2EAF4",fontSize:15,fontFamily:"Barlow Condensed,sans-serif",outline:"none",marginBottom:err?8:24,boxSizing:"border-box"}} />
          </>
        )}

        {err && <div style={{background:"#FF3D5A15",border:"1px solid #FF3D5A33",borderRadius:8,padding:"8px 14px",color:"#FF3D5A",fontSize:13,marginBottom:20,textAlign:"center"}}>{err}</div>}

        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,background:"transparent",border:"1px solid #1E2D45",borderRadius:10,padding:13,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,letterSpacing:1,cursor:"pointer"}}>CANCEL</button>
          <button onClick={submit} style={{flex:2,background:"linear-gradient(135deg,#F5A623,#FF8C00)",border:"none",borderRadius:10,padding:13,color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:800,fontSize:15,letterSpacing:1,cursor:"pointer",boxShadow:"0 4px 20px rgba(245,166,35,0.3)"}}>
            {mode==="set"?"SET PASSWORD →":mode==="unlock"?"UNLOCK 🔓":"CHANGE PASSWORD →"}
          </button>
        </div>
        {mode==="unlock" && (
          <div style={{marginTop:20,paddingTop:16,borderTop:"1px solid #1E2D45",textAlign:"center"}}>
            <button onClick={()=>{setMode("change");setPw("");setErr("");}} style={{background:"none",border:"none",color:"#4A5E78",fontSize:12,cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",letterSpacing:1}}>
              🔑 Change league password
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const PALETTE=["#FF3D5A","#4F8EF7","#2ECC71","#F5A623","#A855F7","#06B6D4","#FF6B35","#EC4899","#84CC16","#64748B"];
const ROLE_COLORS={Batsman:"#4F8EF7",Bowler:"#FF3D5A","All-Rounder":"#2ECC71","Wicket-Keeper":"#F5A623"};
const ROLES=["All","Batsman","Bowler","All-Rounder","Wicket-Keeper"];

const css=`
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Barlow+Condensed:wght@400;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  :root{--bg:#080C14;--surface:#0E1521;--card:#141E2E;--border:#1E2D45;--gold:#F5A623;--text:#E2EAF4;--muted:#4A5E78;--accent:#4F8EF7;}
  body{font-family:'Barlow Condensed',sans-serif;background:var(--bg);color:var(--text);}
  select,input{font-family:inherit;}
  ::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:var(--surface);}::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}
  .fade-in{animation:fadeIn .3s ease;}
  @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes loadBar{0%{left:-40%;width:40%}50%{left:30%;width:50%}100%{left:100%;width:40%}}
  @keyframes ballSpin{0%{transform:rotate(0deg) scale(1)}50%{transform:rotate(180deg) scale(1.05)}100%{transform:rotate(360deg) scale(1)}}
`;

function Badge({label,color="#4F8EF7"}){return<span style={{background:color+"22",color,border:`1px solid ${color}44`,padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600}}>{label}</span>;}
function Btn({children,onClick,variant="primary",disabled,style:sx={}}){
  const base={fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:15,letterSpacing:1,textTransform:"uppercase",border:"none",borderRadius:8,padding:"10px 22px",cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1,transition:"all .15s",...sx};
  const v={primary:{background:"linear-gradient(135deg,#F5A623,#FF8C00)",color:"#080C14"},blue:{background:"linear-gradient(135deg,#4F8EF7,#1a5fb4)",color:"#fff"},ghost:{background:"transparent",color:"#4A5E78",border:"1px solid #1E2D45"},danger:{background:"#FF3D5A22",color:"#FF3D5A",border:"1px solid #FF3D5A44"}};
  return<button onClick={disabled?undefined:onClick} style={{...base,...v[variant],...sx}}>{children}</button>;
}
function Card({children,style:sx={},accent}){return<div style={{background:"var(--card)",borderRadius:12,border:"1px solid var(--border)",...(accent?{borderTop:`3px solid ${accent}`}:{}),...sx}}>{children}</div>;}

export default function App() {
  const [page,setPage]=useState("setup");
  const [teams,setTeams]=useState([]);
  const [players,setPlayers]=useState([]);
  const [assignments,setAssignments]=useState({});
  const [matches,setMatches]=useState([]);
  const [captains,setCaptains]=useState({});
  const [points,setPoints]=useState({});
  const [loading,setLoading]=useState("");
  const [numTeams,setNumTeams]=useState(4);
  const [tNames,setTNames]=useState(Array.from({length:10},(_,i)=>`Team ${i+1}`));
  const [search,setSearch]=useState("");
  const [roleFilter,setRoleFilter]=useState("All");
  const [expandedMatch,setExpandedMatch]=useState(null);
  const [expandedTeam,setExpandedTeam]=useState(null);
  const [pwHash,setPwHash]=useState(null);
  const [unlocked,setUnlocked]=useState(false);
  const [showPwModal,setShowPwModal]=useState(false);
  const [pendingAction,setPendingAction]=useState(null);

  useEffect(()=>{
    (async()=>{
      const keys=["teams","players","assignments","matches","captains","points","page","tnames","numteams","pwhash"];
      const[t,p,a,m,c,pts,pg,tn,nt,ph]=await Promise.all(keys.map(k=>storeGet(k)));
      if(t)setTeams(t);if(p)setPlayers(p);if(a)setAssignments(a);if(m)setMatches(m);
      if(c)setCaptains(c);if(pts)setPoints(pts);if(pg)setPage(pg);if(tn)setTNames(tn);
      if(nt)setNumTeams(nt);if(ph)setPwHash(ph);
    })();
  },[]);

  const nav=(pg)=>{setPage(pg);storeSet("page",pg);};
  const upd=(setter,key)=>(val)=>{setter(val);storeSet(key,val);};
  const updTeams=upd(setTeams,"teams"),updAssign=upd(setAssignments,"assignments"),
        updMatches=upd(setMatches,"matches"),updCaptains=upd(setCaptains,"captains"),
        updPoints=upd(setPoints,"points");

  const withPassword=(action)=>{if(unlocked){action();return;}setPendingAction(()=>action);setShowPwModal(true);};
  const handlePwSuccess=(newHash,isSetting)=>{
    if(isSetting&&newHash){setPwHash(newHash);storeSet("pwhash",newHash);}
    if(!isSetting)setUnlocked(true);
    setShowPwModal(false);
    if(!isSetting&&pendingAction){pendingAction();setPendingAction(null);}
  };

  const createTeams=()=>{
    const t=Array.from({length:numTeams},(_,i)=>({id:`t${i}`,name:tNames[i]||`Team ${i+1}`,color:PALETTE[i]}));
    updTeams(t);storeSet("tnames",tNames);storeSet("numteams",numTeams);nav("draft");
  };

  const fetchPlayers=async()=>{
    setLoading("Loading IPL 2025 squads…");
    try{
      const text=await callAI(
        `List all players across all 10 IPL 2025 franchises (CSK, MI, RCB, KKR, SRH, RR, PBKS, DC, GT, LSG). Return ONLY a raw JSON array: [{"id":"firstname-lastname","name":"Full Name","iplTeam":"Franchise Short Name","role":"Batsman|Bowler|All-Rounder|Wicket-Keeper"}]. Include 180+ players.`,
        "Cricket expert. ONLY raw JSON array. No markdown, no explanation."
      );
      const json=parseJSON(text);setPlayers(json);storeSet("players",json);
    }catch(e){alert("Failed: "+e.message);}
    setLoading("");
  };

  const assignPlayer=(pid,tid)=>withPassword(()=>{const a={...assignments};if(!tid)delete a[pid];else a[pid]=tid;updAssign(a);});
  const removePlayer=(pid)=>withPassword(()=>{const a={...assignments};delete a[pid];updAssign(a);});

  const filteredPlayers=players.filter(p=>{
    const s=search.toLowerCase();
    return(p.name.toLowerCase().includes(s)||(p.iplTeam||"").toLowerCase().includes(s))&&(roleFilter==="All"||p.role===roleFilter);
  });

  const fetchMatches=async()=>{
    setLoading("Loading IPL 2025 schedule…");
    try{
      const text=await callAI(
        `List all 74 matches of IPL 2025. Return ONLY a raw JSON array: [{"id":"m1","matchNum":1,"date":"2025-03-22","team1":"CSK","team2":"MI","venue":"Chepauk","status":"upcoming|completed","result":"winner or null"}].`,
        "Cricket expert. Return ONLY raw JSON array. No markdown."
      );
      updMatches(parseJSON(text));
    }catch(e){alert("Error: "+e.message);}
    setLoading("");
  };

  const syncPoints=async(match)=>{
    setLoading(`Crunching scorecard — Match ${match.matchNum}…`);
    try{
      const playerIndex=players.map(p=>`${p.name}::${p.id}`).join("|");
      const text=await callAI(
        `Scorecard for IPL 2025 Match ${match.matchNum}: ${match.team1} vs ${match.team2} on ${match.date} at ${match.venue}. Match player names to IDs: ${playerIndex}. Return ONLY JSON array: [{"playerId":"id","name":"name","runs":0,"fours":0,"sixes":0,"wickets":0,"economy":null,"overs":0,"catches":0,"stumpings":0,"runouts":0,"longestSix":false}].`,
        "Cricket expert. ONLY raw JSON array."
      );
      const stats=parseJSON(text);
      const newPts={...points};
      for(const s of stats){
        if(!s.playerId)continue;
        const pts=calcPoints(s);
        if(!newPts[s.playerId])newPts[s.playerId]={};
        newPts[s.playerId][match.id]={base:pts,stats:s};
      }
      updPoints(newPts);alert(`✅ Points synced for Match ${match.matchNum}!`);
    }catch(e){alert("Sync failed: "+e.message);}
    setLoading("");
  };

  const setCap=(matchId,teamId,type,pid)=>{
    const key=`${matchId}_${teamId}`;
    updCaptains({...captains,[key]:{...(captains[key]||{}),[type]:pid}});
  };

  const getTeamTotal=(teamId)=>{
    let total=0;
    for(const[pid,matchData]of Object.entries(points)){
      if(assignments[pid]!==teamId)continue;
      for(const[mid,d]of Object.entries(matchData)){
        const cap=captains[`${mid}_${teamId}`]||{};
        let pts=d.base;
        if(cap.captain===pid)pts*=2;else if(cap.vc===pid)pts*=1.5;
        total+=pts;
      }
    }
    return Math.round(total);
  };

  const leaderboard=[...teams].map(t=>({...t,total:getTeamTotal(t.id)})).sort((a,b)=>b.total-a.total);
  const getPlayerBreakdown=(teamId)=>players.filter(p=>assignments[p.id]===teamId).map(p=>{
    let tot=0;
    for(const[mid,d]of Object.entries(points[p.id]||{})){
      const cap=captains[`${mid}_${teamId}`]||{};let pts=d.base;
      if(cap.captain===p.id)pts*=2;else if(cap.vc===p.id)pts*=1.5;tot+=pts;
    }
    return{...p,total:Math.round(tot)};
  }).sort((a,b)=>b.total-a.total);

  const navItems=[
    {id:"setup",label:"Setup",icon:"⚙️"},
    {id:"draft",label:"Draft",icon:"📋",disabled:teams.length===0},
    {id:"matches",label:"Matches",icon:"🏏",disabled:players.length===0},
    {id:"leaderboard",label:"Leaderboard",icon:"🏆",disabled:teams.length===0},
  ];

  return(
    <>
      <style>{css}</style>
      <div style={{minHeight:"100vh",background:"var(--bg)"}}>
        {showPwModal&&<PasswordModal storedHash={pwHash} onSuccess={handlePwSuccess} onClose={()=>{setShowPwModal(false);setPendingAction(null);}} />}

        {/* Header */}
        <div style={{background:"linear-gradient(180deg,#0E1521 0%,#080C14 100%)",borderBottom:"1px solid #1E2D45",padding:"0 20px",display:"flex",alignItems:"stretch",position:"sticky",top:0,zIndex:50}}>
          <div style={{padding:"16px 24px 0 0",borderRight:"1px solid #1E2D45",marginRight:8}}>
            <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:18,color:"#F5A623",letterSpacing:2,lineHeight:1}}>🏏 TEEKHA</div>
            <div style={{fontSize:11,color:"#4A5E78",letterSpacing:3,textTransform:"uppercase"}}>Bouncer League</div>
          </div>
          <div style={{display:"flex",overflowX:"auto"}}>
            {navItems.map(n=>(
              <button key={n.id} onClick={()=>!n.disabled&&nav(n.id)} style={{background:"transparent",border:"none",cursor:n.disabled?"not-allowed":"pointer",padding:"0 20px",fontSize:14,fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:page===n.id?"#F5A623":n.disabled?"#1E2D45":"#4A5E78",borderBottom:page===n.id?"2px solid #F5A623":"2px solid transparent",whiteSpace:"nowrap"}}>
                {n.icon} {n.label}
              </button>
            ))}
          </div>
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8,padding:"0 0 0 12px"}}>
            <button onClick={()=>{if(unlocked)setUnlocked(false);else{setPendingAction(null);setShowPwModal(true);}}} style={{background:unlocked?"#2ECC7122":"transparent",border:`1px solid ${unlocked?"#2ECC71":"#1E2D45"}`,color:unlocked?"#2ECC71":"#4A5E78",fontSize:11,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif"}}>
              {unlocked?"🔓 UNLOCKED":"🔒 LOCKED"}
            </button>
            <button onClick={async()=>{if(!confirm("Reset ALL data?"))return;const keys=["teams","players","assignments","matches","captains","points","page","pwhash"];for(const k of keys)try{localStorage.removeItem(`tbl_${k}`);}catch{}window.location.reload();}} style={{background:"transparent",border:"1px solid #1E2D45",color:"#4A5E78",fontSize:11,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif"}}>RESET</button>
          </div>
        </div>

        {/* Cool Loading Overlay */}
        {loading&&(
          <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.96)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:200,backdropFilter:"blur(6px)"}}>
            <div style={{position:"relative",width:80,height:80,marginBottom:24}}>
              <div style={{position:"absolute",inset:0,borderRadius:"50%",background:"linear-gradient(135deg,#F5A623,#FF3D5A)",animation:"ballSpin 1.4s linear infinite",boxShadow:"0 0 30px rgba(245,166,35,0.5)"}} />
              <div style={{position:"absolute",inset:4,borderRadius:"50%",background:"#080C14",display:"flex",alignItems:"center",justifyContent:"center",fontSize:30}}>🏏</div>
            </div>
            <div style={{color:"#F5A623",fontWeight:800,fontSize:18,letterSpacing:2,fontFamily:"Rajdhani,sans-serif",marginBottom:8,textAlign:"center",padding:"0 24px"}}>{loading}</div>
            <div style={{color:"#4A5E78",fontSize:12,marginBottom:32,letterSpacing:2,textTransform:"uppercase"}}>Please wait</div>
            <div style={{width:220,height:3,background:"#1E2D45",borderRadius:4,overflow:"hidden",position:"relative"}}>
              <div style={{position:"absolute",top:0,left:0,height:"100%",width:"40%",background:"linear-gradient(90deg,#F5A623,#FF8C00)",borderRadius:4,animation:"loadBar 1.4s ease-in-out infinite"}} />
            </div>
          </div>
        )}

        <div style={{maxWidth:860,margin:"0 auto",padding:"24px 16px"}}>

          {page==="setup"&&(
            <div className="fade-in">
              <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:"#F5A623",letterSpacing:2,marginBottom:24}}>LEAGUE SETUP</h2>
              <Card sx={{padding:24,marginBottom:16}}>
                <div style={{fontWeight:700,color:"#4A5E78",letterSpacing:2,fontSize:12,marginBottom:16}}>NUMBER OF TEAMS</div>
                <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:12}}>
                  <span style={{fontSize:48,fontFamily:"Rajdhani",fontWeight:800,color:"#F5A623",minWidth:60}}>{numTeams}</span>
                  <input type="range" min={2} max={10} value={numTeams} onChange={e=>{setNumTeams(+e.target.value);storeSet("numteams",+e.target.value);}} style={{flex:1,accentColor:"#F5A623",height:6}} />
                </div>
                <div style={{display:"flex",justifyContent:"space-between",color:"#4A5E78",fontSize:12}}><span>2 teams</span><span>10 teams</span></div>
              </Card>
              <Card sx={{padding:24,marginBottom:20}}>
                <div style={{fontWeight:700,color:"#4A5E78",letterSpacing:2,fontSize:12,marginBottom:16}}>TEAM NAMES</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>
                  {Array.from({length:numTeams},(_,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:PALETTE[i],flexShrink:0}} />
                      <input value={tNames[i]} onChange={e=>{const n=[...tNames];n[i]=e.target.value;setTNames(n);}} style={{flex:1,background:"#080C14",border:"1px solid #1E2D45",borderRadius:8,padding:"9px 14px",color:"#E2EAF4",fontSize:15,fontFamily:"Barlow Condensed,sans-serif",fontWeight:600}} placeholder={`Team ${i+1}`} />
                    </div>
                  ))}
                </div>
              </Card>
              <Card sx={{padding:20,marginBottom:20}}>
                <div style={{fontWeight:700,color:"#4A5E78",letterSpacing:2,fontSize:12,marginBottom:14}}>POINTS SYSTEM</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14,fontSize:13}}>
                  {[{title:"🏏 BATTING",items:["1 pt per run","8 pts per four","12 pts per six","+10 for 50+","+20 for 100+"]},{title:"🎳 BOWLING",items:["25 pts per wicket","+8 for 4-wkt haul","+15 for 5+ wickets","+10 econ <6 (min 2 ov)"]},{title:"🧤 FIELDING",items:["8 pts per catch","12 pts stumping","12 pts run-out"]},{title:"⭐ BONUSES",items:["30+ runs & 2+ wkts = +15","Longest six = +50","Captain = 2× pts","VC = 1.5× pts"]}].map(sec=>(
                    <div key={sec.title}>
                      <div style={{color:"#F5A623",fontWeight:700,fontSize:12,letterSpacing:1,marginBottom:8}}>{sec.title}</div>
                      {sec.items.map(item=><div key={item} style={{color:"#94A3B8",marginBottom:4}}>• {item}</div>)}
                    </div>
                  ))}
                </div>
              </Card>
              <Btn onClick={createTeams} sx={{width:"100%",padding:"14px",fontSize:17}}>CREATE LEAGUE & CONTINUE →</Btn>
            </div>
          )}

          {page==="draft"&&(
            <div className="fade-in">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:12}}>
                <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:"#F5A623",letterSpacing:2}}>PLAYER DRAFT</h2>
                <Btn variant="blue" onClick={fetchPlayers}>{players.length>0?`↻ REFRESH (${players.length})`:"🌐 FETCH IPL PLAYERS"}</Btn>
              </div>
              <div style={{background:unlocked?"#2ECC7112":"#F5A62310",border:`1px solid ${unlocked?"#2ECC7133":"#F5A62333"}`,borderRadius:10,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                <div>
                  <span style={{fontWeight:700,color:unlocked?"#2ECC71":"#F5A623",fontSize:14}}>{unlocked?"🔓 Squad changes unlocked":"🔒 Squad changes are locked"}</span>
                  <span style={{color:"#4A5E78",fontSize:12,marginLeft:10}}>{unlocked?"Assign, replace or remove freely":"Password required to modify squads"}</span>
                </div>
                <button onClick={()=>{if(unlocked)setUnlocked(false);else{setPendingAction(null);setShowPwModal(true);}}} style={{background:unlocked?"#FF3D5A22":"#F5A62322",border:`1px solid ${unlocked?"#FF3D5A44":"#F5A62344"}`,color:unlocked?"#FF3D5A":"#F5A623",borderRadius:7,padding:"7px 16px",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                  {unlocked?"LOCK":"UNLOCK"}
                </button>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
                {teams.map(t=>{const cnt=Object.values(assignments).filter(v=>v===t.id).length;return<div key={t.id} style={{background:"#0E1521",borderRadius:8,padding:"7px 14px",borderLeft:`3px solid ${t.color}`,fontSize:13}}><span style={{color:t.color,fontWeight:700}}>{t.name}</span><span style={{color:"#4A5E78",marginLeft:8}}>{cnt}p</span></div>;})}
                <div style={{background:"#0E1521",borderRadius:8,padding:"7px 14px",fontSize:13}}><span style={{color:"#4A5E78"}}>Unassigned: </span><span style={{color:"#E2EAF4"}}>{players.filter(p=>!assignments[p.id]).length}</span></div>
              </div>
              {players.length===0?(
                <Card sx={{padding:60,textAlign:"center"}}><div style={{fontSize:56}}>🏏</div><div style={{color:"#4A5E78",marginTop:16,fontSize:16}}>Click "Fetch IPL Players" to load the player pool</div></Card>
              ):(
                <>
                  <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
                    <input placeholder="Search name or franchise…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,minWidth:180,background:"#0E1521",border:"1px solid #1E2D45",borderRadius:8,padding:"10px 14px",color:"#E2EAF4",fontSize:14,fontFamily:"Barlow Condensed"}} />
                    <select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)} style={{background:"#0E1521",border:"1px solid #1E2D45",borderRadius:8,padding:"10px 14px",color:"#E2EAF4",fontSize:14,fontFamily:"Barlow Condensed"}}>
                      {ROLES.map(r=><option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <div style={{maxHeight:560,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
                    {filteredPlayers.map(p=>{
                      const aTeam=teams.find(t=>t.id===assignments[p.id]),isAssigned=!!assignments[p.id];
                      return(
                        <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:"#0E1521",borderRadius:8,borderLeft:`3px solid ${aTeam?aTeam.color:"#1E2D45"}`}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:700,fontSize:14,color:"#E2EAF4"}}>{p.name}</div>
                            <div style={{fontSize:12,color:"#4A5E78",marginTop:2}}>{p.iplTeam}&nbsp;•&nbsp;<span style={{color:ROLE_COLORS[p.role]||"#94A3B8"}}>{p.role}</span>{isAssigned&&<span style={{marginLeft:8,color:aTeam?.color,fontWeight:700}}>→ {aTeam?.name}</span>}</div>
                          </div>
                          <select value={assignments[p.id]||""} onChange={e=>assignPlayer(p.id,e.target.value)} style={{background:"#141E2E",border:`1px solid ${aTeam?aTeam.color+"66":"#1E2D45"}`,borderRadius:6,padding:"6px 10px",color:aTeam?aTeam.color:"#4A5E78",fontSize:13,fontFamily:"Barlow Condensed",fontWeight:600,maxWidth:150,cursor:"pointer"}}>
                            <option value="">{isAssigned?"Move to…":"— Assign —"}</option>
                            {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                          {isAssigned&&<button onClick={()=>removePlayer(p.id)} style={{background:"#FF3D5A22",border:"1px solid #FF3D5A44",color:"#FF3D5A",borderRadius:6,padding:"6px 10px",cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,flexShrink:0}}>✕</button>}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {page==="matches"&&(
            <div className="fade-in">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
                <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:"#F5A623",letterSpacing:2}}>MATCHES</h2>
                <Btn variant="blue" onClick={fetchMatches}>{matches.length>0?`↻ REFRESH (${matches.length})`:"🌐 FETCH SCHEDULE"}</Btn>
              </div>
              {matches.length===0?(
                <Card sx={{padding:60,textAlign:"center"}}><div style={{fontSize:56}}>📅</div><div style={{color:"#4A5E78",marginTop:16,fontSize:16}}>Click "Fetch Schedule" to load IPL 2025 matches</div></Card>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {matches.map(match=>{
                    const open=expandedMatch===match.id,completed=match.status==="completed",synced=Object.keys(points).some(pid=>points[pid][match.id]);
                    return(
                      <Card key={match.id} sx={{overflow:"hidden"}}>
                        <div style={{display:"flex",alignItems:"center",padding:"14px 18px",cursor:"pointer",gap:14}} onClick={()=>setExpandedMatch(open?null:match.id)}>
                          <div style={{background:"#080C14",borderRadius:6,padding:"4px 10px",minWidth:44,textAlign:"center"}}>
                            <div style={{fontSize:11,color:"#4A5E78"}}>M</div>
                            <div style={{fontSize:18,fontWeight:800,color:"#F5A623",fontFamily:"Rajdhani"}}>{match.matchNum}</div>
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:700,fontSize:15,color:"#E2EAF4"}}>{match.team1}<span style={{color:"#4A5E78"}}> vs </span>{match.team2}</div>
                            <div style={{fontSize:12,color:"#4A5E78",marginTop:2}}>{match.date} • {match.venue}</div>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            {synced&&<Badge label="✓ SYNCED" color="#2ECC71" />}
                            <Badge label={completed?(match.result?`✓ ${match.result}`:"DONE"):"UPCOMING"} color={completed?"#2ECC71":"#F5A623"} />
                            <span style={{color:"#4A5E78",fontSize:12}}>{open?"▲":"▼"}</span>
                          </div>
                        </div>
                        {open&&(
                          <div style={{padding:"0 18px 18px",borderTop:"1px solid #1E2D45"}}>
                            <div style={{marginTop:16}}>
                              <div style={{fontSize:12,color:"#4A5E78",letterSpacing:2,fontWeight:700,marginBottom:14}}>CAPTAIN & VICE CAPTAIN — MATCH {match.matchNum}</div>
                              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                                {teams.map(team=>{
                                  const key=`${match.id}_${team.id}`,cap=captains[key]||{},teamPlayers=players.filter(p=>assignments[p.id]===team.id);
                                  return(
                                    <div key={team.id} style={{background:"#080C14",borderRadius:8,padding:"12px 16px",borderLeft:`3px solid ${team.color}`}}>
                                      <div style={{color:team.color,fontWeight:700,fontSize:13,letterSpacing:1,marginBottom:10}}>{team.name.toUpperCase()}</div>
                                      <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
                                        <div>
                                          <div style={{fontSize:11,color:"#4A5E78",marginBottom:5}}>⭐ CAPTAIN (2×)</div>
                                          <select value={cap.captain||""} onChange={e=>setCap(match.id,team.id,"captain",e.target.value)} style={{background:"#0E1521",border:"1px solid #1E2D45",borderRadius:6,padding:"7px 12px",color:"#E2EAF4",fontSize:13,fontFamily:"Barlow Condensed",maxWidth:200}}>
                                            <option value="">— Select Captain —</option>
                                            {teamPlayers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                                          </select>
                                        </div>
                                        <div>
                                          <div style={{fontSize:11,color:"#4A5E78",marginBottom:5}}>🥈 VICE CAPTAIN (1.5×)</div>
                                          <select value={cap.vc||""} onChange={e=>setCap(match.id,team.id,"vc",e.target.value)} style={{background:"#0E1521",border:"1px solid #1E2D45",borderRadius:6,padding:"7px 12px",color:"#E2EAF4",fontSize:13,fontFamily:"Barlow Condensed",maxWidth:200}}>
                                            <option value="">— Select V. Captain —</option>
                                            {teamPlayers.filter(p=>p.id!==cap.captain).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                                          </select>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            {completed&&<button onClick={()=>syncPoints(match)} style={{marginTop:16,width:"100%",background:synced?"#1E2D45":"linear-gradient(135deg,#F5A623,#FF8C00)",color:synced?"#4A5E78":"#080C14",border:"none",borderRadius:8,padding:13,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"Barlow Condensed"}}>{synced?"↻ RE-SYNC POINTS":"🔄 SYNC POINTS FROM SCORECARD"}</button>}
                            {!completed&&<div style={{marginTop:16,padding:"12px 16px",background:"#080C14",borderRadius:8,fontSize:13,color:"#4A5E78",textAlign:"center"}}>Points sync available once match is completed</div>}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {page==="leaderboard"&&(
            <div className="fade-in">
              <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:"#F5A623",letterSpacing:2,marginBottom:24}}>LEADERBOARD</h2>
              {leaderboard.length===0?(
                <Card sx={{padding:60,textAlign:"center"}}><div style={{fontSize:56}}>🏆</div><div style={{color:"#4A5E78",marginTop:16}}>Set up your league first</div></Card>
              ):(
                <>
                  <div style={{marginBottom:32}}>
                    {leaderboard.map((team,i)=>{
                      const medals=["🥇","🥈","🥉"],mc=["#F5A623","#94A3B8","#CD7C2F"];
                      return(
                        <div key={team.id} style={{display:"flex",alignItems:"center",gap:16,background:"#0E1521",borderRadius:10,padding:"16px 20px",marginBottom:8,borderLeft:`4px solid ${team.color}`}}>
                          <div style={{fontSize:28,minWidth:36}}>{medals[i]||`#${i+1}`}</div>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:700,fontSize:18,color:team.color,fontFamily:"Rajdhani",letterSpacing:1}}>{team.name}</div>
                            <div style={{fontSize:12,color:"#4A5E78"}}>{Object.values(assignments).filter(v=>v===team.id).length} players drafted</div>
                          </div>
                          <div style={{textAlign:"right"}}>
                            <div style={{fontSize:32,fontWeight:800,color:i<3?mc[i]:"#E2EAF4",fontFamily:"Rajdhani"}}>{team.total}</div>
                            <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2}}>POINTS</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{fontWeight:700,color:"#4A5E78",letterSpacing:2,fontSize:12,marginBottom:16}}>TEAM PLAYER BREAKDOWN</div>
                  {leaderboard.map(team=>{
                    const breakdown=getPlayerBreakdown(team.id),isOpen=expandedTeam===team.id;
                    return(
                      <Card key={team.id} accent={team.color} sx={{marginBottom:12,overflow:"hidden"}}>
                        <div style={{display:"flex",alignItems:"center",padding:"14px 18px",cursor:"pointer"}} onClick={()=>setExpandedTeam(isOpen?null:team.id)}>
                          <div style={{flex:1}}><span style={{fontWeight:700,color:team.color,fontFamily:"Rajdhani",fontSize:17,letterSpacing:1}}>{team.name}</span><span style={{color:"#4A5E78",marginLeft:10,fontSize:13}}>{breakdown.length} players</span></div>
                          <span style={{color:"#F5A623",fontWeight:800,fontFamily:"Rajdhani",fontSize:22,marginRight:16}}>{team.total} pts</span>
                          <span style={{color:"#4A5E78",fontSize:12}}>{isOpen?"▲":"▼"}</span>
                        </div>
                        {isOpen&&breakdown.length>0&&(
                          <div style={{borderTop:"1px solid #1E2D45",padding:"12px 18px"}}>
                            <div style={{display:"flex",fontSize:11,color:"#4A5E78",marginBottom:10,padding:"0 4px"}}><span style={{flex:1}}>PLAYER</span><span style={{width:90}}>ROLE</span><span style={{width:70,textAlign:"right"}}>POINTS</span></div>
                            {breakdown.map((p,idx)=>(
                              <div key={p.id} style={{display:"flex",alignItems:"center",padding:"9px 4px",borderBottom:"1px solid #1E2D45"}}>
                                <div style={{flex:1,fontWeight:idx<3?700:400,fontSize:14,color:idx===0?"#F5A623":"#E2EAF4"}}>{p.name}</div>
                                <div style={{width:90}}><Badge label={p.role||"—"} color={ROLE_COLORS[p.role]||"#4A5E78"} /></div>
                                <div style={{width:70,textAlign:"right",fontWeight:700,color:p.total>0?"#E2EAF4":"#4A5E78",fontFamily:"Rajdhani",fontSize:17}}>{p.total}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {isOpen&&breakdown.length===0&&<div style={{padding:"16px 18px",color:"#4A5E78",fontSize:13,borderTop:"1px solid #1E2D45"}}>No players assigned yet.</div>}
                      </Card>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
