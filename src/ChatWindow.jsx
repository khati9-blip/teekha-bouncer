import React from "react";
import { T, fonts } from "./Theme";

// ── CHAT WINDOW ───────────────────────────────────────────────────────────────
function ChatWindow({ myTeam, teams, unlocked, withPassword, storeGet, storeSet, isGuest }) {
  const [open, setOpen] = React.useState(false);
  const [maximized, setMaximized] = React.useState(false);
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState('');
  const [unread, setUnread] = React.useState(0);
  const [pinned, setPinned] = React.useState(null);
  const [showMention, setShowMention] = React.useState(false);
  const [lastSeen] = React.useState(() => { try { return parseInt(localStorage.getItem('tb_chatLastSeen')||'0'); } catch { return 0; } });
  const endRef = React.useRef(null);

  const load = async () => {
    const data = await storeGet("chat") || {};
    const msgs = data.messages || [];
    setMessages(msgs);
    setPinned(data.pinned || null);
    if (!open) setUnread(msgs.filter(m => m.ts > lastSeen && m.senderId !== myTeam?.id).length);
  };

  React.useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);
  React.useEffect(() => { if (open) { setUnread(0); try { localStorage.setItem('tb_chatLastSeen', Date.now().toString()); } catch {} setTimeout(() => endRef.current?.scrollIntoView({behavior:'instant'}), 0); } }, [open, messages.length]);

  const send = async () => {
    if (!input.trim() || !myTeam || input.length > 200) return;
    const msg = { id: Date.now().toString(), text: input.trim(), senderId: myTeam.id, senderName: myTeam.name, senderColor: myTeam.color, ts: Date.now(), reactions: {} };
    const data = await storeGet("chat") || {};
    const msgs = [...(data.messages || []), msg].slice(-50);
    await storeSet("chat", {...data, messages: msgs});
    setMessages(msgs); setInput(''); setShowMention(false);
    setTimeout(() => endRef.current?.scrollIntoView({behavior:'smooth'}), 50);
  };

  const react = async (msgId, emoji) => {
    const data = await storeGet("chat") || {};
    const msgs = (data.messages || []).map(m => {
      if (m.id !== msgId) return m;
      const r = {...(m.reactions||{})}; const u = r[emoji] || [];
      if (u.includes(myTeam?.id)) { r[emoji] = u.filter(x=>x!==myTeam?.id); if(!r[emoji].length) delete r[emoji]; }
      else r[emoji] = [...u, myTeam?.id];
      return {...m, reactions:r};
    });
    await storeSet("chat", {...data, messages: msgs}); setMessages(msgs);
  };

  const del = async (msgId, needPw) => {
    const doDelete = async () => { const data = await storeGet("chat")||{}; const msgs=(data.messages||[]).filter(m=>m.id!==msgId); await storeSet("chat",{...data,messages:msgs}); setMessages(msgs); };
    if (needPw) withPassword(doDelete); else doDelete();
  };

  const pin = async (msg) => {
    withPassword(async () => { const data = await storeGet("chat")||{}; const np = pinned?.id===msg.id?null:msg; await storeSet("chat",{...data,pinned:np}); setPinned(np); });
  };

  const renderText = (text) => text.split(' ').map((w,i) => {
    if (w.startsWith('@')) { const t = teams.find(t=>t.name.toLowerCase().includes(w.slice(1).toLowerCase())); return React.createElement('span',{key:i,style:{color:t?t.color:T.info,fontWeight:700}},(i>0?' ':'')+w); }
    return React.createElement('span',{key:i},(i>0?' ':'')+w);
  });

  const [pos, setPos] = React.useState(() => {
    try { const s = localStorage.getItem('tb_chatPos'); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [dragging, setDragging] = React.useState(false);
  const dragRef = React.useRef(null);
  const startRef = React.useRef(null);
  const didDragRef = React.useRef(false); // true if pointer moved enough to count as drag

  const onDragStart = (e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startRef.current = {
      mx: clientX,
      my: clientY,
      px: pos ? pos.x : 8,
      py: pos ? pos.y : window.innerHeight - 130,
    };
    didDragRef.current = false;
    setDragging(true);
    e.preventDefault();
  };

  React.useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = clientX - startRef.current.mx;
      const dy = clientY - startRef.current.my;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didDragRef.current = true;
      const nx = Math.max(8, Math.min(window.innerWidth - 60, startRef.current.px + dx));
      const ny = Math.max(8, Math.min(window.innerHeight - 130, startRef.current.py + dy));
      const newPos = { x: nx, y: ny };
      setPos(newPos);
      try { localStorage.setItem('tb_chatPos', JSON.stringify(newPos)); } catch {}
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging]);

  const floatStyle = pos
    ? { position: "fixed", left: pos.x, top: pos.y, zIndex: 500, fontFamily: fonts.body }
    : { position: "fixed", bottom: "calc(env(safe-area-inset-bottom) + 72px)", left: 8, zIndex: 500, fontFamily: fonts.body };

  // Chat window always opens upward from button position
  const chatW = maximized ? Math.min(520, window.innerWidth * 0.9) : Math.min(320, window.innerWidth * 0.85);
  const chatH = maximized ? Math.min(600, window.innerHeight * 0.8) : Math.min(420, window.innerHeight * 0.6);
  const btnX  = pos ? pos.x : 8;
  const btnY  = pos ? pos.y : window.innerHeight - 130;
  const chatLeft = Math.min(btnX, window.innerWidth - chatW - 8);
  const chatTop  = Math.max(8, btnY - chatH - 12);

  return React.createElement('div', { ref: dragRef, style: floatStyle },
    !open && React.createElement('button', {
      onClick: () => { if (didDragRef.current) { didDragRef.current = false; return; } setOpen(true); },
      onMouseDown: onDragStart,
      onTouchStart: onDragStart,
      style: { width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg,#4F8EF7,#1a5fb4)", border: "none", cursor: dragging ? "grabbing" : "grab", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(79,142,247,0.4)", position: "relative", userSelect: "none", touchAction: "none" }
    },
      React.createElement('span', { style: { fontSize: 22 } }, "💬"),
      unread > 0 && React.createElement('span', { style: { position: "absolute", top: -2, right: -2, background: "#FF3D5A", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" } }, unread > 9 ? "9+" : unread)
    ),
    open && React.createElement('div',{style:{position:"fixed",left:chatLeft,top:chatTop,width:chatW,height:chatH,background:T.card,borderRadius:16,border:`1px solid ${T.info}44`,display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,0.6)",overflow:"hidden",zIndex:501}},
      React.createElement('div',{style:{background:"#4F8EF711",borderBottom:"1px solid #4F8EF733",padding:"10px 14px",display:"flex",alignItems:"center",gap:8}},
        React.createElement('span',{style:{fontSize:16}},"💬"),
        React.createElement('div',{style:{flex:1,fontFamily:fonts.display,fontWeight:700,fontSize:15,color:T.info,letterSpacing:1}},"PITCH CHAT"),
        React.createElement('button',{onClick:()=>setMaximized(v=>!v),style:{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:14,padding:"2px 6px"}},maximized?"⊡":"⊞"),
        React.createElement('button',{onClick:()=>setOpen(false),style:{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:16,padding:"2px 6px"}},"✕")
      ),
      pinned && React.createElement('div',{style:{background:T.accentBg,borderBottom:"1px solid #F5A62322",padding:"6px 14px",display:"flex",alignItems:"center",gap:6}},
        React.createElement('span',{style:{fontSize:11}},"📌"),
        React.createElement('div',{style:{flex:1,fontSize:11,color:T.accent,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},pinned.senderName+": "+pinned.text),
        unlocked && React.createElement('button',{onClick:()=>pin(pinned),style:{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:10}},"✕")
      ),
      React.createElement('div',{style:{flex:1,overflowY:"auto",padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}},
        messages.length===0 && React.createElement('div',{style:{textAlign:"center",color:"#2D3E52",fontSize:13,marginTop:40}},"No messages yet. Say hello! 👋"),
        messages.map(msg => {
          // ── System notification (C/VC announcements) ──────────────────
          if (msg.type === "system") {
            return React.createElement('div', { key: msg.id, style: { display: "flex", flexDirection: "column", alignItems: "center", margin: "4px 0" } },
              React.createElement('div', { style: { background: "#F5A62311", border: "1px solid #F5A62333", borderRadius: 10, padding: "7px 14px", maxWidth: "90%", textAlign: "center" } },
                React.createElement('div', { style: { fontSize: 12, color: "#F5A623", fontWeight: 600, fontFamily: fonts.body, lineHeight: 1.4 } }, msg.text),
                React.createElement('div', { style: { fontSize: 9, color: T.muted, marginTop: 3 } }, new Date(msg.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }))
              )
            );
          }
          // ── Regular chat message ──────────────────────────────────────
          const isMe = msg.senderId === myTeam?.id;
          return React.createElement('div',{key:msg.id,style:{display:"flex",flexDirection:"column",alignItems:isMe?"flex-end":"flex-start"}},
            React.createElement('div',{style:{maxWidth:"80%",background:isMe?"#4F8EF722":"#141E2E",border:"1px solid "+(isMe?"#4F8EF744":"#1E2D45"),borderRadius:isMe?"12px 12px 4px 12px":"12px 12px 12px 4px",padding:"7px 10px"}},
              !isMe && React.createElement('div',{style:{fontSize:10,color:msg.senderColor||"#4F8EF7",fontWeight:700,marginBottom:3}},msg.senderName),
              React.createElement('div',{style:{fontSize:13,color:T.text,lineHeight:1.4}},renderText(msg.text)),
              React.createElement('div',{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:4,gap:4}},
                React.createElement('div',{style:{fontSize:9,color:"#2D3E52"}},new Date(msg.ts).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})),
                React.createElement('div',{style:{display:"flex",gap:3,flexWrap:"wrap"}},
                  ...Object.entries(msg.reactions||{}).map(([emoji,users]) => React.createElement('button',{key:emoji,onClick:()=>react(msg.id,emoji),style:{background:users.includes(myTeam?.id)?"#4F8EF733":"#1E2D45",border:"none",borderRadius:10,padding:"1px 6px",cursor:"pointer",fontSize:11,color:T.text}},emoji+" "+users.length)),
                  ...["👍","🔥","😂","💀","🏏"].map(emoji => React.createElement('button',{key:emoji,onClick:()=>react(msg.id,emoji),style:{background:"transparent",border:"none",cursor:"pointer",fontSize:11,opacity:0.4,padding:"1px 2px"}},emoji)),
                  (isMe||unlocked) && React.createElement('button',{onClick:()=>del(msg.id,!isMe),style:{background:"transparent",border:"none",color:T.danger,cursor:"pointer",fontSize:10,opacity:0.5}},"✕"),
                  unlocked && React.createElement('button',{onClick:()=>pin(msg),style:{background:"transparent",border:"none",color:T.accent,cursor:"pointer",fontSize:10,opacity:0.5}},"📌")
                )
              )
            )
          );
        }),
        React.createElement('div',{ref:endRef})
      ),
      myTeam && !isGuest
        ? React.createElement('div',{style:{borderTop:`1px solid ${T.border}`,padding:"8px 10px"}},
            showMention && React.createElement('div',{style:{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,marginBottom:6,overflow:"hidden"}},
              ...teams.map(t=>React.createElement('button',{key:t.id,onClick:()=>{const last=input.lastIndexOf('@');setInput(input.slice(0,last)+'@'+t.name+' ');setShowMention(false);},style:{width:"100%",background:"transparent",border:"none",padding:"7px 12px",textAlign:"left",cursor:"pointer",color:t.color,fontSize:13,fontWeight:700,fontFamily:fonts.body,display:"block"}},"@"+t.name))
            ),
            React.createElement('div',{style:{display:"flex",gap:6}},
              React.createElement('input',{value:input,onChange:e=>{const v=e.target.value;setInput(v);const last=v.lastIndexOf('@');setShowMention(last>=0&&last===v.length-1);},onKeyDown:e=>{if(e.key==="Enter"){e.preventDefault();send();setShowMention(false);}if(e.key==="Escape")setShowMention(false);},placeholder:"Message as "+myTeam.name+"... (@ to tag)",maxLength:200,style:{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",color:T.text,fontSize:13,fontFamily:fonts.body,outline:"none"}}),
              React.createElement('button',{onClick:send,style:{background:"#4F8EF7",border:"none",borderRadius:8,padding:"8px 12px",color:"#fff",cursor:"pointer",fontSize:14}},"➤")
            ),
            React.createElement('div',{style:{fontSize:9,color:"#2D3E52",marginTop:4,textAlign:"right"}},input.length+"/200")
          )
        : React.createElement('div',{style:{borderTop:`1px solid ${T.border}`,padding:"10px",textAlign:"center",fontSize:11,color:"#2D3E52"}},isGuest?"👁 Guests can read only":"Claim a team to chat")
    )
  );
}

export default ChatWindow;
