import React, { useState } from 'react';
import { sbSet } from './utils.js';

export default function FeedbackWidget({ pitches, user, T, fonts }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(user?.email?.split("@")[0] || "");
  const [pitch, setPitch] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [sent, setSent] = React.useState(false);

  const YOUR_WHATSAPP = "YOUR_WHATSAPP_NUMBER"; // e.g. "919876543210"
  const YOUR_EMAIL    = "YOUR_EMAIL@gmail.com";

  const buildText = () =>
    `🏏 Teekha Bouncer Feedback\n\nFrom: ${name}\nPitch: ${pitch || "General"}\n\nMessage:\n${message}`;

  const sendWhatsApp = () => {
    window.open("https://wa.me/" + YOUR_WHATSAPP + "?text=" + encodeURIComponent(buildText()), "_blank");
    setSent(true);
  };

  const sendEmail = () => {
    const subject = encodeURIComponent("Teekha Bouncer Feedback — " + (pitch || "General"));
    const body = encodeURIComponent(buildText());
    window.open("mailto:" + YOUR_EMAIL + "?subject=" + subject + "&body=" + body, "_blank");
    setSent(true);
  };

  const reset = () => { setOpen(false); setMessage(""); setSent(false); };

  const canSend = name.trim() && message.trim();

  return (
    <>
      {/* Feedback button — below pitch cards */}
      <div style={{textAlign:"center",marginTop:20,animation:"tb-fadeUp 0.5s ease 0.4s both"}}>
        <button onClick={()=>setOpen(true)}
  style={{background:"linear-gradient(135deg, #6B46C1 0%, #9F7AEA 100%)",border:"none",borderRadius:0,padding:"12px 24px",fontFamily:fonts.display,fontWeight:800,fontSize:13,color:"#0A0E14",cursor:"pointer",letterSpacing:2,transition:"all 0.2s",display:"inline-flex",alignItems:"center",gap:8,clipPath:"polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",boxShadow:"4px 4px 0 rgba(107,70,193,0.3)",textShadow:"1px 1px 0 rgba(255,255,255,0.2)"}}
  onMouseEnter={e=>{e.currentTarget.style.transform="translate(-2px, -2px)";e.currentTarget.style.boxShadow="6px 6px 0 rgba(107,70,193,0.3)";}}
  onMouseLeave={e=>{e.currentTarget.style.transform="translate(0, 0)";e.currentTarget.style.boxShadow="4px 4px 0 rgba(107,70,193,0.3)";}}>
  💬 SEND FEEDBACK
</button>
        <div style={{fontFamily:fonts.body,fontSize:11,color:T.muted,marginTop:6}}>Suggestions, bug reports, feature requests — all welcome</div>
      </div>

      {/* Backdrop */}
      {open && <div onClick={reset} style={{position:"fixed",inset:0,background:"rgba(5,8,16,0.8)",zIndex:500,backdropFilter:"blur(4px)",animation:"tb-fadeIn 0.2s ease both"}} />}

      {/* Modal */}
      {open && (
        <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:1000,width:"min(440px,95vw)",maxHeight:"80vh",top:"20%",display:"flex",flexDirection:"column",background:T.card,borderRadius:18,border:`1px solid ${T.border}`,boxShadow:"0 24px 80px rgba(0,0,0,0.6)",overflow:"hidden",animation:"tb-fadeUp 0.3s ease both"}}>
          {/* Header */}
          <div style={{padding:"20px 22px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:19,color:T.accent,letterSpacing:1}}>💬 SEND FEEDBACK</div>
              <div style={{fontFamily:fonts.body,fontSize:12,color:T.muted,marginTop:3}}>We read every message — help us make this better</div>
            </div>
            <button onClick={reset} style={{background:T.border,border:"none",borderRadius:8,width:30,height:30,color:T.sub,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
          {/* What kind of feedback */}
          <div style={{padding:"10px 22px",background:T.accentBg,borderBottom:`1px solid ${T.border}`,display:"flex",gap:14,flexWrap:"wrap"}}>
            {[["🐛","Bug"],["💡","Feature"],["⚙️","Rule change"],["📊","Points"],["🎨","Design"]].map(([emoji,label])=>(
              <div key={label} style={{fontFamily:fonts.body,fontSize:11,color:T.muted,display:"flex",alignItems:"center",gap:4}}>
                <span>{emoji}</span><span>{label}</span>
              </div>
            ))}
          </div>

          {/* Body */}
          <div style={{padding:"18px 22px",overflowY:"auto",flex:1}}>
            {sent ? (
              <div style={{textAlign:"center",padding:"24px 0"}}>
                <div style={{fontSize:48,marginBottom:12}}>🎉</div>
                <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:18,color:T.success,marginBottom:6}}>FEEDBACK SENT!</div>
                <div style={{fontFamily:fonts.body,fontSize:13,color:T.muted,marginBottom:20}}>Thanks for helping improve the app.</div>
                <button onClick={reset} style={{fontFamily:fonts.display,fontWeight:700,fontSize:13,background:T.accentBg,border:`1px solid ${T.accentBorder}`,borderRadius:10,padding:"10px 24px",color:T.accent,cursor:"pointer",letterSpacing:0.5}}>CLOSE</button>
              </div>
            ) : (
              <>
                {/* Name */}
                <div style={{fontFamily:fonts.display,fontSize:10,fontWeight:700,color:T.muted,letterSpacing:2,marginBottom:6}}>YOUR NAME</div>
                <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name or username"
                  style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:9,padding:"10px 14px",color:T.text,fontSize:14,fontFamily:fonts.body,outline:"none",marginBottom:14,boxSizing:"border-box"}} />

                {/* Pitch */}
                <div style={{fontFamily:fonts.display,fontSize:10,fontWeight:700,color:T.muted,letterSpacing:2,marginBottom:6}}>PITCH / LEAGUE (optional)</div>
                <select value={pitch} onChange={e=>setPitch(e.target.value)}
                  style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:9,padding:"10px 14px",color:pitch?T.text:T.muted,fontSize:14,fontFamily:fonts.body,outline:"none",marginBottom:14,boxSizing:"border-box",cursor:"pointer"}}>
                  <option value="">— Select your pitch —</option>
                  {(pitches||[]).map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
                  <option value="General">General / No specific pitch</option>
                </select>

                {/* Message */}
                <div style={{fontFamily:fonts.display,fontSize:10,fontWeight:700,color:T.muted,letterSpacing:2,marginBottom:6}}>YOUR FEEDBACK</div>
                <textarea value={message} onChange={e=>setMessage(e.target.value)}
                  placeholder="Share your suggestion, bug report, or feature request..."
                  rows={5}
                  style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:9,padding:"10px 14px",color:T.text,fontSize:14,fontFamily:fonts.body,outline:"none",resize:"vertical",boxSizing:"border-box",lineHeight:1.5}} />

                {/* Buttons */}
                <div style={{display:"flex",gap:10,marginTop:16}}>
                  <button onClick={sendWhatsApp} disabled={!canSend}
                    style={{flex:1,background:canSend?"#25D36622":"#25D36611",border:`1px solid ${canSend?"#25D36644":"#25D36622"}`,borderRadius:10,padding:"11px",color:canSend?"#25D366":T.muted,fontFamily:fonts.display,fontWeight:700,fontSize:13,cursor:canSend?"pointer":"not-allowed",letterSpacing:0.5,display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all 0.2s"}}>
                    📲 WHATSAPP
                  </button>
                  <button onClick={sendEmail} disabled={!canSend}
                    style={{flex:1,background:canSend?T.infoBg:"#4F8EF711",border:`1px solid ${canSend?T.info+"44":"#4F8EF722"}`,borderRadius:10,padding:"11px",color:canSend?T.info:T.muted,fontFamily:fonts.display,fontWeight:700,fontSize:13,cursor:canSend?"pointer":"not-allowed",letterSpacing:0.5,display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all 0.2s"}}>
                    ✉️ EMAIL
                  </button>
                </div>
                <div style={{fontFamily:fonts.body,fontSize:11,color:T.muted,textAlign:"center",marginTop:10}}>
                  Fill in your name and message to enable sending
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
