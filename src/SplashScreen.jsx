import React, { useState } from 'react';
import { getUsers, saveUsers, hashPw } from './utils.js';

export default function SplashScreen({ onLogin, T, fonts }) {
  const [mode, setMode] = useState('splash'); // splash | login | signup | forgot | reset
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [codeSent, setCodeSent] = useState(false);

  const inputStyle = (hasErr) => ({
    width:"100%", background:T.bg,
    border:"1px solid "+(hasErr?"#FF3D5A":"#1E2D45"),
    borderRadius:8, padding:"12px 16px", color:T.text,
    fontSize:16, fontFamily:fonts.body,
    outline:"none", marginBottom:12, boxSizing:"border-box"
  });

  const handleSignup = async () => {
    if (!email.trim()) { setErr("Enter your email"); return; }
    if (!email.includes('@')) { setErr("Enter a valid email"); return; }
    if (!pw.trim() || pw.length < 6) { setErr("Password must be at least 6 characters"); return; }
    if (pw !== pw2) { setErr("Passwords don't match"); return; }
    setLoading(true); setErr('');
    try {
      const users = await getUsers();
      if (users.find(u => u.email.toLowerCase() === email.toLowerCase().trim())) {
        setErr("Email already registered. Please log in."); setLoading(false); return;
      }
      const hash = await hashPw(pw);
      const newUser = { email: email.toLowerCase().trim(), hash, createdAt: new Date().toISOString() };
      await saveUsers([...users, newUser]);
      onLogin(newUser);
    } catch(e) { setErr("Error: " + e.message); }
    setLoading(false);
  };

  const handleLogin = async () => {
    if (!email.trim()) { setErr("Enter your email"); return; }
    if (!pw.trim()) { setErr("Enter your password"); return; }
    setLoading(true); setErr('');
    try {
      const users = await getUsers();
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
      if (!user) { setErr("Email not found. Please sign up."); setLoading(false); return; }
      const hash = await hashPw(pw);
      if (hash !== user.hash) { setErr("Wrong password."); setLoading(false); return; }
      onLogin(user);
    } catch(e) { setErr("Error: " + e.message); }
    setLoading(false);
  };

  const sendResetCode = async () => {
    if (!email.trim() || !email.includes('@')) { setErr('Enter a valid email'); return; }
    setLoading(true); setErr('');
    try {
      const users = await getUsers();
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
      if (!user) { setErr('Email not found.'); setLoading(false); return; }
      const res = await fetch('/api/reset-password', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ email: email.toLowerCase().trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send code');
      setCodeSent(true); setErr('');
    } catch(e) { setErr('Error: ' + e.message); }
    setLoading(false);
  };

  const verifyResetCode = async () => {
    if (!resetCode.trim()) { setErr('Enter the code'); return; }
    setLoading(true); setErr('');
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ verifyCode: resetCode.trim() })
      });
      const data = await res.json();
      if (data.valid) { setMode('reset'); setErr(''); }
      else { setErr('Wrong code. Try again.'); }
    } catch(e) { setErr('Error: ' + e.message); }
    setLoading(false);
  };

  const resetPassword = async () => {
    if (newPw.length < 6) { setErr('Password must be at least 6 characters'); return; }
    if (newPw !== newPw2) { setErr("Passwords don't match"); return; }
    setLoading(true); setErr('');
    try {
      const users = await getUsers();
      const hash = await hashPw(newPw);
      const updated = users.map(u => u.email.toLowerCase() === email.toLowerCase().trim() ? {...u, hash} : u);
      await saveUsers(updated);
      setMode('login'); setPw(''); setPw2(''); setResetCode(''); setNewPw(''); setNewPw2('');
      setErr(''); alert('✅ Password reset! Please log in with your new password.');
    } catch(e) { setErr('Error: ' + e.message); }
    setLoading(false);
  };

  if (mode === 'splash') return (
  <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#0A0E14 0%,#141A24 50%,#0A0E14 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px",fontFamily:fonts.body,position:"relative",overflow:"hidden"}}>
    <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:#0C0C0F;}`}</style>

    {/* Logo area */}
    <div style={{textAlign:"center",marginBottom:40,position:"relative",zIndex:1}}>
      <div style={{position:"relative",display:"inline-block",marginBottom:24}}>
        <img src="/logo.png" alt="Teekha Bouncer" 
          style={{width:140,height:140,objectFit:"contain",borderRadius:0,clipPath:"polygon(12px 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%)",boxShadow:"0 8px 32px rgba(255,107,0,0.4), 0 0 60px rgba(255,107,0,0.2)"}} />
      </div>
      
      <div style={{fontFamily:fonts.display,fontWeight:900,fontSize:56,background:"linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:6,lineHeight:1,textTransform:"uppercase"}}>
        TEEKHA
      </div>
      <div style={{fontFamily:fonts.display,fontWeight:900,fontSize:56,color:"#E2EAF4",letterSpacing:6,lineHeight:1,textTransform:"uppercase"}}>
        BOUNCER
      </div>
      <div style={{fontSize:11,color:T.muted,letterSpacing:5,marginTop:12,textTransform:"uppercase",fontWeight:700}}>
        Fantasy Cricket League
      </div>
    </div>

    {/* Tagline */}
    <div style={{background:"rgba(255,107,0,0.05)",border:"2px solid rgba(255,107,0,0.2)",borderLeft:"5px solid #FF6B00",borderRadius:0,padding:"18px 28px",marginBottom:48,textAlign:"center",maxWidth:380,clipPath:"polygon(0% 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%)",position:"relative",zIndex:1}}>
      <div style={{fontSize:15,color:"#B8C5D6",lineHeight:1.7,fontWeight:500}}>
        Track fantasy points, manage squads, and compete with your friends across multiple leagues 🏆
      </div>
    </div>

    {/* Buttons */}
    <div style={{width:"100%",maxWidth:360,display:"flex",flexDirection:"column",gap:14,position:"relative",zIndex:1}}>
      <button onClick={() => setMode('signup')}
        style={{background:"linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)",border:"none",borderRadius:0,padding:"18px",color:"#0A0E14",fontFamily:fonts.display,fontWeight:900,fontSize:16,cursor:"pointer",letterSpacing:3,textTransform:"uppercase",clipPath:"polygon(10px 0%, 100% 0%, calc(100% - 10px) 100%, 0% 100%)",boxShadow:"5px 5px 0 rgba(255,107,0,0.3)",textShadow:"1px 1px 0 rgba(255,255,255,0.3)",transition:"all 0.2s"}}
        onMouseEnter={e => {e.currentTarget.style.transform="translate(-2px, -2px)";e.currentTarget.style.boxShadow="7px 7px 0 rgba(255,107,0,0.3)";}}
        onMouseLeave={e => {e.currentTarget.style.transform="translate(0, 0)";e.currentTarget.style.boxShadow="5px 5px 0 rgba(255,107,0,0.3)";}}>
        ⚡ GET STARTED
      </button>
      
      <button onClick={() => setMode('login')}
        style={{background:"transparent",border:"3px solid rgba(255,107,0,0.4)",borderRadius:0,padding:"16px",color:"#FF6B00",fontFamily:fonts.display,fontWeight:800,fontSize:15,cursor:"pointer",letterSpacing:2,textTransform:"uppercase",clipPath:"polygon(10px 0%, 100% 0%, calc(100% - 10px) 100%, 0% 100%)",transition:"all 0.2s"}}
        onMouseEnter={e => {e.currentTarget.style.background="rgba(255,107,0,0.08)";e.currentTarget.style.borderColor="#FF6B00";}}
        onMouseLeave={e => {e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor="rgba(255,107,0,0.4)";}}>
        🔑 I HAVE AN ACCOUNT
      </button>
    </div>
  </div>
);

  return (
  <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#0A0E14 0%,#141A24 50%,#0A0E14 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px",fontFamily:fonts.body}}>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Barlow+Condensed:wght@400;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{background:#080C14;color:#E2EAF4;}`}</style>

    <div style={{width:"100%",maxWidth:420}}>
      {/* Header */}
      <div style={{textAlign:"center",marginBottom:36}}>
        <img src="/logo.png" alt="Teekha Bouncer" style={{width:80,height:80,objectFit:"contain",borderRadius:0,margin:"0 auto",display:"block",marginBottom:20,clipPath:"polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",boxShadow:"0 8px 24px rgba(255,107,0,0.3)"}} />
        <div style={{fontFamily:fonts.display,fontWeight:900,fontSize:32,background:"linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:4,marginTop:8,textTransform:"uppercase"}}>
          {mode==='login' ? "WELCOME BACK" : "CREATE ACCOUNT"}
        </div>
        <div style={{fontSize:13,color:T.muted,marginTop:6,fontWeight:500}}>
          {mode==='login' ? "Sign in to your Teekha Bouncer account" : "Join Teekha Bouncer League"}
        </div>
      </div>

      {/* Form */}
      <div style={{background:"rgba(255,107,0,0.03)",borderRadius:0,border:"2px solid rgba(255,107,0,0.2)",borderLeft:"5px solid #FF6B00",padding:32,clipPath:"polygon(0% 0%, 100% 0%, calc(100% - 16px) 100%, 0% 100%)"}}>
        <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setErr('');}} placeholder="Email address" 
          style={{width:"100%",background:"#0A0E14",border:err&&!pw?"2px solid #FF3D5A":"2px solid rgba(255,107,0,0.3)",borderRadius:0,padding:"14px 18px",color:T.text,fontSize:15,fontFamily:fonts.body,outline:"none",marginBottom:14,boxSizing:"border-box",clipPath:"polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)"}} />
        
        <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr('');}} onKeyDown={e=>e.key==="Enter"&&(mode==='login'?handleLogin():null)} placeholder="Password" 
          style={{width:"100%",background:"#0A0E14",border:err&&pw&&!pw2?"2px solid #FF3D5A":"2px solid rgba(255,107,0,0.3)",borderRadius:0,padding:"14px 18px",color:T.text,fontSize:15,fontFamily:fonts.body,outline:"none",marginBottom:14,boxSizing:"border-box",clipPath:"polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)"}} />
        
        {mode==='signup' && (
          <input type="password" value={pw2} onChange={e=>{setPw2(e.target.value);setErr('');}} onKeyDown={e=>e.key==="Enter"&&handleSignup()} placeholder="Confirm password" 
            style={{width:"100%",background:"#0A0E14",border:"2px solid rgba(255,107,0,0.3)",borderRadius:0,padding:"14px 18px",color:T.text,fontSize:15,fontFamily:fonts.body,outline:"none",marginBottom:14,boxSizing:"border-box",clipPath:"polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)"}} />
        )}
        
        {err && <div style={{color:"#FF3D5A",fontSize:13,marginBottom:16,textAlign:"center",fontWeight:600,background:"rgba(255,61,90,0.1)",padding:"10px",borderLeft:"3px solid #FF3D5A"}}>{err}</div>}
        
        <button onClick={mode==='login' ? handleLogin : handleSignup} disabled={loading}
          style={{width:"100%",background:"linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)",border:"none",borderRadius:0,padding:16,color:"#0A0E14",fontFamily:fonts.display,fontWeight:900,fontSize:15,cursor:loading?"not-allowed":"pointer",opacity:loading?0.7:1,letterSpacing:2,textTransform:"uppercase",clipPath:"polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",boxShadow:"4px 4px 0 rgba(255,107,0,0.3)",textShadow:"1px 1px 0 rgba(255,255,255,0.2)",transition:"all 0.2s"}}
          onMouseEnter={e=>!loading&&(e.currentTarget.style.transform="translate(-2px, -2px)",e.currentTarget.style.boxShadow="6px 6px 0 rgba(255,107,0,0.3)")}
          onMouseLeave={e=>!loading&&(e.currentTarget.style.transform="translate(0, 0)",e.currentTarget.style.boxShadow="4px 4px 0 rgba(255,107,0,0.3)")}>
          {loading ? "PLEASE WAIT..." : mode==='login' ? "SIGN IN" : "CREATE ACCOUNT"}
        </button>
        
        {mode==='login' && (
          <div style={{textAlign:"center",marginTop:16}}>
            <button onClick={()=>{setMode('forgot');setErr('');setPw('');setCodeSent(false);setResetCode('');}}
              style={{background:"none",border:"none",color:"#FF3D5A",fontSize:12,cursor:"pointer",textDecoration:"underline",fontFamily:fonts.body,fontWeight:600}}>
              Forgot password?
            </button>
          </div>
        )}
      </div>

      {/* Toggle */}
      <div style={{textAlign:"center",marginTop:24,fontSize:14,color:T.muted}}>
        {mode==='login' ? "Don't have an account? " : "Already have an account? "}
        <button onClick={()=>{setMode(mode==='login'?'signup':'login');setErr('');setPw('');setPw2('');}}
          style={{background:"none",border:"none",color:"#FF6B00",fontSize:14,cursor:"pointer",fontFamily:fonts.body,fontWeight:800,textDecoration:"underline"}}>
          {mode==='login' ? "Sign up" : "Sign in"}
        </button>
      </div>

      <button onClick={() => setMode('splash')}
        style={{display:"block",margin:"20px auto 0",background:"transparent",border:"2px solid rgba(255,107,0,0.3)",borderRadius:0,color:"#FF6B00",fontSize:12,cursor:"pointer",padding:"8px 16px",fontFamily:fonts.display,fontWeight:700,letterSpacing:1,clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)"}}>
        ← BACK
      </button>
    </div>
  </div>
);
}


class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  componentDidCatch(error, info) { this.setState({ error: error.message + " | " + info.componentStack?.split("\n")[1] }); }
  static getDerivedStateFromError(error) { return { error: error.message }; }
  render() {
    if (this.state.error) return (
      <div style={{minHeight:"100vh",background:T.bg,padding:24,fontFamily:"monospace"}}>
        <div style={{color:T.danger,fontSize:18,marginBottom:16}}>💥 CRASH REPORT</div>
        <div style={{background:T.card,padding:16,borderRadius:8,color:T.text,fontSize:13,wordBreak:"break-all",whiteSpace:"pre-wrap"}}>{this.state.error}</div>
        <button onClick={()=>{ localStorage.clear(); window.location.reload(); }} style={{marginTop:20,background:"#F5A623",border:"none",borderRadius:8,padding:"10px 20px",color:T.bg,fontWeight:700,cursor:"pointer"}}>CLEAR & RELOAD</button>
      </div>
    );
    return this.props.children;
  }
}


// ── FEEDBACK WIDGET ───────────────────────────────────────────────────────────
