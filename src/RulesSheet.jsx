import React, { useState } from "react";

const sections = [
  {
    id: "start",
    emoji: "🚀",
    title: "Getting Started",
    color: "#4F8EF7",
    items: [
      {
        step: "01",
        heading: "Create a Pitch",
        body: "A pitch is your private league. Hit CREATE NEW PITCH, give it a name, and set an admin password. You're the commissioner — everything runs through you.",
      },
      {
        step: "02",
        heading: "Add Players",
        body: "As admin, go to the Drafts tab and fetch your player pool. You can pull from Cricbuzz, CricketData, or use AI to generate squads for any cricket league — IPL, BBL, The Hundred, anything.",
      },
      {
        step: "03",
        heading: "Assign Players to Teams",
        body: "Drag players into teams manually, or run an auction-style draft. Mark your most valued players as 🛡 Safe before the season starts — safe players cannot be traded or snatched.",
      },
      {
        step: "04",
        heading: "Teams Claim Their Squad",
        body: "Each team manager gets a Team ID from you. They log in, enter the ID, set a personal PIN, and they're in. From then on it's their squad to manage.",
      },
      {
        step: "05",
        heading: "Set Captain & VC Before Every Match",
        body: "Before the first ball is bowled, each team picks a Captain (2× points) and Vice Captain (1.5×) for that specific match. Choose wisely — you can't change after the match starts.",
      },
    ],
  },
  {
    id: "points",
    emoji: "⚡",
    title: "Points System",
    color: "#F5A623",
    items: [
      {
        heading: "🏏 Batting",
        body: null,
        table: [
          ["Per run", "+1 pt"],
          ["Per four", "+8 pts"],
          ["Per six", "+12 pts"],
          ["Half-century (50+)", "+10 pts"],
          ["Century (100+)", "+20 pts"],
          ["Duck (0 + dismissed)", "−penalty"],
        ],
        note: "Only the highest milestone counts (50 OR 100, not both).",
      },
      {
        heading: "🎳 Bowling",
        body: null,
        table: [
          ["Per wicket", "+25 pts"],
          ["4-wicket haul", "+8 bonus"],
          ["5+ wickets", "+15 bonus"],
          ["Economy below 6", "+10 pts"],
        ],
        note: "Only the highest milestone counts (4W OR 5W, not both).",
      },
      {
        heading: "🧤 Fielding",
        body: null,
        table: [
          ["Catch", "+8 pts"],
          ["Stumping", "+12 pts"],
          ["Run-out participation", "+12 pts"],
        ],
      },
      {
        heading: "⭐ All-Round Bonus",
        body: "Score 30+ runs AND take 2+ wickets in the same match → +15 bonus points on top of everything else.",
      },
      {
        heading: "💥 Longest Six",
        body: "The player who hits the longest six in the match gets +50 points. One per match, admin marks it manually.",
      },
      {
        heading: "👑 Captain & Vice Captain",
        body: null,
        table: [
          ["Captain", "2× all points"],
          ["Vice Captain", "1.5× all points"],
        ],
        note: "Set fresh for every match. Applies to the full match score including all bonuses.",
      },
    ],
  },
  {
    id: "transfer",
    emoji: "🔄",
    title: "Transfer Window",
    color: "#2ECC71",
    items: [
      {
        heading: "When does it open?",
        body: "The Transfer Window opens automatically every Sunday at 11:59 PM IST and closes Monday at 11:00 AM IST. Admin can also open it manually anytime.",
      },
      {
        heading: "Release Phase",
        body: "Each team selects up to 3 players to release. Released players go into the trade pool. You can change your selection anytime until the window closes. Safe players cannot be released.",
      },
      {
        heading: "Trade Phase",
        body: "Once all teams have released (or admin starts it manually), the trade phase begins. Teams pick in order of fewest players in squad — the most depleted squad picks first. You must pick a player of the same role and same or lower tier as the player you released.",
      },
      {
        heading: "Passing",
        body: "If no player in the pool meets your criteria, you press PASS. Your untraded released players return to your squad and are marked ineligible for future trades this window.",
      },
      {
        heading: "Reversals",
        body: "If a player you picked was released by a team that later passes (because their last untraded player returns), that pick gets reversed. You'll be prompted to re-pick — or pass if nothing else qualifies.",
      },
      {
        heading: "What carries across windows",
        body: "Traded-out players stay visible in your squad with a strikethrough ⬇️. Players who come in show green ⬆️. A player traded out and then returned in a future window shows ↩️ yellow.",
      },
    ],
  },
  {
    id: "snatch",
    emoji: "⚡",
    title: "Snatch Window",
    color: "#A855F7",
    items: [
      {
        heading: "When does it open?",
        body: "The Snatch Window opens every Saturday at 12:00 AM IST and closes at 12:00 PM IST — a 12-hour window once a week.",
      },
      {
        heading: "Who gets Snatch Rights?",
        body: "The team with the best single-match performance that week earns Snatch Rights. Best performance means highest combined squad points in one match. It refreshes every week.",
      },
      {
        heading: "How does snatching work?",
        body: "The team with rights can pick ANY non-safe player from ANY other team's squad. The player moves to the snatching team temporarily. Confirm with your team PIN.",
      },
      {
        heading: "Points during snatch",
        body: "The original team's points for this player freeze at the moment of snatch. The snatching team earns all points the player scores while on loan. After return, original team's total resumes from frozen value.",
      },
      {
        heading: "When does the player return?",
        body: "The snatched player auto-returns every Friday at 11:58 PM IST — exactly one week. Admin can also return them early manually.",
      },
      {
        heading: "🛡 Permanent Protection",
        body: "Once a player is returned after a snatch, they are automatically marked SAFE. They can never be snatched again, and cannot be released in Transfer Windows either.",
      },
    ],
  },
];

function AccordionSection({ section, isOpen, onToggle }) {
  return (
    <div style={{
      borderRadius: 14,
      border: `1px solid ${isOpen ? section.color + "44" : "#1E2D45"}`,
      overflow: "hidden",
      transition: "border-color 0.25s",
      background: isOpen ? section.color + "06" : "#0A0F1A",
    }}>
      {/* Header */}
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 14,
          padding: "16px 20px", background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: section.color + "15", border: `1px solid ${section.color}33`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
        }}>
          {section.emoji}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 17,
            color: isOpen ? section.color : "#E2EAF4", letterSpacing: 1,
            transition: "color 0.2s",
          }}>
            {section.title}
          </div>
          <div style={{ fontSize: 10, color: "#4A5E78", letterSpacing: 1, marginTop: 2 }}>
            {section.items.length} section{section.items.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div style={{
          color: isOpen ? section.color : "#4A5E78",
          fontSize: 12, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          transition: "all 0.25s", flexShrink: 0,
        }}>▼</div>
      </button>

      {/* Content */}
      {isOpen && (
        <div style={{ borderTop: `1px solid ${section.color}22` }}>
          {section.items.map((item, idx) => (
            <div key={idx} style={{
              padding: "16px 20px",
              borderBottom: idx < section.items.length - 1 ? "1px solid #1E2D4533" : "none",
            }}>
              {/* Step badge for Getting Started */}
              {item.step && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: section.color + "22", border: `1px solid ${section.color}44`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 11,
                    color: section.color, letterSpacing: 1,
                  }}>
                    {item.step}
                  </div>
                  <div>
                    <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 15, color: "#E2EAF4", marginBottom: 4 }}>
                      {item.heading}
                    </div>
                    <div style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.6 }}>{item.body}</div>
                  </div>
                </div>
              )}

              {/* Regular item */}
              {!item.step && (
                <div>
                  <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 15, color: section.color, marginBottom: 8 }}>
                    {item.heading}
                  </div>
                  {item.body && (
                    <div style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.6, marginBottom: item.table ? 10 : 0 }}>
                      {item.body}
                    </div>
                  )}
                  {item.table && (
                    <div style={{ background: "#080C14", borderRadius: 10, overflow: "hidden", border: "1px solid #1E2D45" }}>
                      {item.table.map(([label, value], ti) => (
                        <div key={ti} style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "9px 14px",
                          borderBottom: ti < item.table.length - 1 ? "1px solid #1E2D4544" : "none",
                          background: ti % 2 === 0 ? "transparent" : "#0E152180",
                        }}>
                          <span style={{ fontSize: 12, color: "#94A3B8" }}>{label}</span>
                          <span style={{
                            fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 14,
                            color: value.startsWith("−") ? "#FF3D5A" : section.color,
                          }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {item.note && (
                    <div style={{ fontSize: 11, color: "#4A5E78", marginTop: 8, fontStyle: "italic", paddingLeft: 4 }}>
                      ℹ️ {item.note}
                    </div>
                  )}
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
  const [openId, setOpenId] = useState(null);

  return (
    <div style={{ marginTop: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ width: 3, height: 20, background: "linear-gradient(180deg,#4F8EF7,#A855F7)", borderRadius: 2 }} />
        <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 13, color: "#4A5E78", letterSpacing: 3 }}>
          HOW IT WORKS
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sections.map(section => (
          <AccordionSection
            key={section.id}
            section={section}
            isOpen={openId === section.id}
            onToggle={() => setOpenId(openId === section.id ? null : section.id)}
          />
        ))}
      </div>
    </div>
  );
}
