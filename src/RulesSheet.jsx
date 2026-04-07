import React, { useState } from "react";
import { T, fonts } from "./Theme";

const sections = [
  {
    id: "start", emoji: "🚀", title: "Getting Started", color: "#4F8EF7",
    items: [
      { step: "01", heading: "Create a Pitch", body: "A pitch is your private league. Hit CREATE NEW PITCH, give it a name, and set an admin password. You're the commissioner — everything runs through you." },
      { step: "02", heading: "Add Players", body: "As admin, go to the Drafts tab and fetch your player pool. Pull from CricketData, use AI to generate squads for any cricket league — IPL, BBL, The Hundred, anything." },
      { step: "03", heading: "Assign Players to Teams", body: "Assign players to teams manually or auction-style. Mark your most valued players as 🛡 Safe before the season starts — safe players cannot be traded or snatched." },
      { step: "04", heading: "Teams Claim Their Squad", body: "Each team manager gets a Team ID from you. They log in, enter the ID, set a personal PIN, and they're in. From then on it's their squad to manage." },
      { step: "05", heading: "Set Captain & VC Before Every Match", body: "Before the first ball is bowled, each team picks a Captain (2× points) and Vice Captain (1.5×) for that specific match. Choose wisely — you can't change after the match starts." },
    ],
  },
  {
    id: "points", emoji: "⚡", title: "Points System", color: T.accent,
    items: [
      { heading: "🏏 Batting", body: null, table: [["Per run", "+1 pt"], ["Per four", "+8 pts"], ["Per six", "+12 pts"], ["Half-century (50+)", "+10 pts"], ["Century (100+)", "+20 pts"], ["Duck (0 + dismissed)", "−penalty"]], note: "Only the highest milestone counts (50 OR 100, not both)." },
      { heading: "🎳 Bowling", body: null, table: [["Per wicket", "+25 pts"], ["4-wicket haul", "+8 bonus"], ["5+ wickets", "+15 bonus"], ["Economy below 6", "+10 pts"]], note: "Only the highest milestone counts (4W OR 5W, not both)." },
      { heading: "🧤 Fielding", body: null, table: [["Catch", "+8 pts"], ["Stumping", "+12 pts"], ["Run-out participation", "+12 pts"]] },
      { heading: "⭐ All-Round Bonus", body: "Score 30+ runs AND take 2+ wickets in the same match → +15 bonus points on top of everything else." },
      { heading: "💥 Longest Six", body: "The player who hits the longest six in the match gets +50 points. One per match, admin marks it manually." },
      { heading: "👑 Captain & Vice Captain", body: null, table: [["Captain", "2× all points"], ["Vice Captain", "1.5× all points"]], note: "Set fresh for every match. Applies to the full match score including all bonuses." },
    ],
  },
  {
    id: "transfer", emoji: "🔄", title: "Transfer Window", color: T.success,
    items: [
      { heading: "When does it open?", body: "Opens automatically every Sunday 11:59 PM IST, closes Monday 11:00 AM IST. Admin can also open it manually anytime." },
      { heading: "Release Phase", body: "Each team selects up to 3 players to release. Released players go into the trade pool. Safe players cannot be released." },
      { heading: "Trade Phase", body: "Teams pick in order of fewest players in squad. You must pick a player of the same role and same or lower tier as the player you released." },
      { heading: "Passing", body: "If no player in the pool meets your criteria, press PASS. Your untraded released players return to your squad." },
      { heading: "Reversals", body: "If a player you picked was released by a team that later passes, that pick gets reversed. You'll be prompted to re-pick." },
      { heading: "What carries across windows", body: "Traded-out players show ⬇️ strikethrough. Players who come in show ⬆️ green. A returned player shows ↩️ yellow." },
    ],
  },
  {
    id: "snatch", emoji: "⚡", title: "Snatch Window", color: T.purple,
    items: [
      { heading: "When does it open?", body: "Opens every Saturday 12:00 AM IST, closes 12:00 PM IST — a 12-hour window once a week." },
      { heading: "Who gets Snatch Rights?", body: "The team with the best single-match performance that week earns Snatch Rights — highest combined squad points in one match." },
      { heading: "How does snatching work?", body: "Pick ANY non-safe player from ANY other team's squad. The player moves to the snatching team temporarily. Confirm with your team PIN." },
      { heading: "Points during snatch", body: "The original team's points freeze at the moment of snatch. The snatching team earns all points the player scores while on loan." },
      { heading: "When does the player return?", body: "Auto-returns every Friday 11:58 PM IST — exactly one week. Admin can also return them early." },
      { heading: "🛡 Permanent Protection", body: "Once returned after a snatch, the player is automatically marked SAFE — never snatched again, never released in transfers." },
    ],
  },
];

function AccordionSection({ section, isOpen, onToggle }) {
  return (
    <div style={{ borderRadius: 12, border: `1px solid ${isOpen ? section.color + "44" : T.border}`, overflow: "hidden", transition: "border-color 0.25s", background: isOpen ? section.color + "07" : T.bg, marginBottom: 8 }}>
      <button onClick={onToggle} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: section.color + "15", border: `1px solid ${section.color}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>{section.emoji}</div>
        <div style={{ flex: 1, fontFamily: fonts.display, fontWeight: 700, fontSize: 15, color: isOpen ? section.color : T.text, transition: "color 0.2s" }}>{section.title}</div>
        <div style={{ color: isOpen ? section.color : T.muted, fontSize: 10, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.25s" }}>▼</div>
      </button>

      {isOpen && (
        <div style={{ borderTop: `1px solid ${section.color}22` }}>
          {section.items.map((item, idx) => (
            <div key={idx} style={{ padding: "13px 16px", borderBottom: idx < section.items.length - 1 ? `1px solid ${T.border}33` : "none" }}>
              {item.step ? (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, background: section.color + "20", border: `1px solid ${section.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fonts.display, fontWeight: 800, fontSize: 10, color: section.color, letterSpacing: 1 }}>{item.step}</div>
                  <div>
                    <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 13, color: T.text, marginBottom: 3 }}>{item.heading}</div>
                    <div style={{ fontFamily: fonts.body, fontSize: 12, color: T.sub, lineHeight: 1.6 }}>{item.body}</div>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 13, color: section.color, marginBottom: 7 }}>{item.heading}</div>
                  {item.body && <div style={{ fontFamily: fonts.body, fontSize: 12, color: T.sub, lineHeight: 1.6, marginBottom: item.table ? 9 : 0 }}>{item.body}</div>}
                  {item.table && (
                    <div style={{ background: T.bg, borderRadius: 8, overflow: "hidden", border: `1px solid ${T.border}` }}>
                      {item.table.map(([label, value], ti) => (
                        <div key={ti} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 12px", borderBottom: ti < item.table.length - 1 ? `1px solid ${T.border}44` : "none", background: ti % 2 === 0 ? "transparent" : T.card + "80" }}>
                          <span style={{ fontFamily: fonts.body, fontSize: 12, color: T.sub }}>{label}</span>
                          <span style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 13, color: value.startsWith("−") ? T.danger : section.color }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {item.note && <div style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted, marginTop: 7, fontStyle: "italic" }}>ℹ️ {item.note}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RulesSheet() {
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState(null);

  return (
    <>
      <style>{`
        @keyframes rsSlideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
        @keyframes rsFadeIn{from{opacity:0}to{opacity:1}}
        .rs-btn:hover{background:${T.accentBg}!important;border-color:${T.accentBorder}!important;color:${T.accent}!important;transform:scale(1.06);}
        .rs-btn{transition:all 0.2s ease!important;}
      `}</style>

      {/* Floating ? button */}
      <button className="rs-btn" onClick={() => setOpen(true)} title="How it works"
        style={{ position: "fixed", bottom: 24, right: 24, zIndex: 400, width: 46, height: 46, borderRadius: "50%", background: T.card, border: `1px solid ${T.border}`, color: T.muted, fontFamily: fonts.display, fontWeight: 800, fontSize: 18, cursor: "pointer", boxShadow: "0 4px 20px rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        ?
      </button>

      {/* Backdrop */}
      {open && <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(5,8,16,0.75)", zIndex: 500, backdropFilter: "blur(4px)", animation: "rsFadeIn 0.2s ease both" }} />}

      {/* Panel */}
      {open && (
        <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 600, width: "min(420px, 100vw)", background: T.bg, borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column", animation: "rsSlideIn 0.3s cubic-bezier(0.25,0.46,0.45,0.94) both", boxShadow: "-20px 0 60px rgba(0,0,0,0.6)" }}>
          {/* Header */}
          <div style={{ padding: "18px 18px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: T.card, flexShrink: 0 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 3, height: 18, background: `linear-gradient(180deg,${T.accent},${T.purple})`, borderRadius: 2 }} />
                <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 17, color: T.text, letterSpacing: 1 }}>HOW IT WORKS</div>
              </div>
              <div style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted, marginTop: 3, marginLeft: 11 }}>Rules, points & everything else</div>
            </div>
            <button onClick={() => setOpen(false)}
              style={{ width: 30, height: 30, borderRadius: 7, background: T.border, border: "none", color: T.sub, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = T.dangerBg; e.currentTarget.style.color = T.danger; }}
              onMouseLeave={e => { e.currentTarget.style.background = T.border; e.currentTarget.style.color = T.sub; }}>✕</button>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 28px" }}>
            {sections.map(section => (
              <AccordionSection key={section.id} section={section} isOpen={openId === section.id} onToggle={() => setOpenId(openId === section.id ? null : section.id)} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
