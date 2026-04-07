// ── THEME.JSX — Obsidian Gold + Exo 2 + DM Sans ─────────────────────────
// Color: Option A (Obsidian Gold) — Deep black with muted antique gold
// Fonts: Option 5 (Exo 2 + DM Sans) — Sharp tech + clean readable
//
// Usage: import { T, fonts, GlobalStyles } from "./Theme";
// T.bg, T.card, T.border, T.text, T.sub, T.muted, T.accent, T.accentDim
// fonts.display → Exo 2 (headings, numbers, labels)
// fonts.body    → DM Sans (body copy, descriptions)
// ─────────────────────────────────────────────────────────────────────────

import React from "react";

// ── GOOGLE FONTS IMPORT ──────────────────────────────────────────────────
export const FONT_URL =
  "https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap";

// ── COLOR TOKENS ─────────────────────────────────────────────────────────
export const T = {
  // Backgrounds
  bg:         "#0C0C0F",   // page background — true near-black
  card:       "#111118",   // card surface
  cardHover:  "#15151E",   // card hover state
  border:     "#222230",   // default border
  borderHi:   "#2E2E42",   // highlighted border (hover, focus)

  // Text
  text:       "#E8E0CC",   // primary text — warm off-white (not pure white)
  sub:        "#8A8299",   // secondary text
  muted:      "#3A3A52",   // muted / disabled

  // Accent — antique gold
  accent:     "#C9A84C",   // primary gold
  accentHi:   "#DFC06A",   // gold hover / highlight
  accentDim:  "#8B6914",   // gold dark / gradient end
  accentBg:   "#C9A84C12", // gold tint background
  accentBorder:"#C9A84C33",// gold tint border

  // Status
  success:    "#2ECC71",
  successBg:  "#2ECC7112",
  danger:     "#FF3D5A",
  dangerBg:   "#FF3D5A12",
  info:       "#4F8EF7",
  infoBg:     "#4F8EF712",
  warning:    "#F5A623",
  warningBg:  "#F5A62312",
  purple:     "#A855F7",
  purpleBg:   "#A855F712",
};

// ── FONT FAMILIES ────────────────────────────────────────────────────────
export const fonts = {
  display: "'Exo 2', sans-serif",   // headings, numbers, labels, nav
  body:    "'Plus Jakarta Sans', sans-serif", // body copy, descriptions, inputs
};

// ── GLOBAL STYLES COMPONENT ───────────────────────────────────────────────
// Drop <GlobalStyles /> once at the top of your app
export function GlobalStyles() {
  return (
    <style>{`
      @import url('${FONT_URL}');

      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      *, *::before, *::after { font-family: ${fonts.body}; }
      body {
        background: ${T.bg};
        color: ${T.text};
        font-family: ${fonts.body};
        font-size: 14px;
        line-height: 1.6;
        -webkit-font-smoothing: antialiased;
      }
      /* Exo 2 only for display elements — override body cascade */
      h1, h2, h3, h4 { font-family: ${fonts.display}; }

      /* Scrollbar */
      ::-webkit-scrollbar { width: 4px; height: 4px; }
      ::-webkit-scrollbar-track { background: ${T.bg}; }
      ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 2px; }
      ::-webkit-scrollbar-thumb:hover { background: ${T.borderHi}; }

      /* Animations */
      @keyframes tb-fadeUp   { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
      @keyframes tb-fadeIn   { from { opacity:0; } to { opacity:1; } }
      @keyframes tb-slideIn  { from { transform:translateX(100%); } to { transform:translateX(0); } }
      @keyframes tb-pulse    { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      @keyframes tb-glow     { 0%,100% { box-shadow:0 0 12px ${T.accent}33; } 50% { box-shadow:0 0 28px ${T.accent}66; } }
      @keyframes tb-spin     { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
      @keyframes tb-float    { 0%,100% { transform:translateY(0px); } 50% { transform:translateY(-10px); } }

      .tb-fadeUp  { animation: tb-fadeUp  0.5s ease both; }
      .tb-fadeIn  { animation: tb-fadeIn  0.3s ease both; }
      .tb-slideIn { animation: tb-slideIn 0.3s cubic-bezier(0.25,0.46,0.45,0.94) both; }
      .tb-pulse   { animation: tb-pulse   2s ease infinite; }
      .tb-spin    { animation: tb-spin    2s linear infinite; }
      .tb-float   { animation: tb-float   5s ease-in-out infinite; }

      /* Card hover */
      .tb-card-hover {
        transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
        cursor: pointer;
      }
      .tb-card-hover:hover {
        border-color: ${T.accentBorder} !important;
        background: ${T.cardHover} !important;
        transform: translateY(-1px);
      }

      /* Button base */
      .tb-btn {
        font-family: ${fonts.display};
        font-weight: 700;
        letter-spacing: 0.5px;
        cursor: pointer;
        transition: all 0.15s ease;
        border: none;
        border-radius: 10px;
      }
      .tb-btn:hover { filter: brightness(1.1); transform: scale(1.02); }
      .tb-btn:active { transform: scale(0.98); }

      /* Input base */
      .tb-input {
        font-family: ${fonts.body};
        background: ${T.bg};
        border: 1px solid ${T.border};
        border-radius: 8px;
        padding: 10px 14px;
        color: ${T.text};
        font-size: 14px;
        outline: none;
        width: 100%;
        box-sizing: border-box;
        transition: border-color 0.2s;
      }
      .tb-input:focus { border-color: ${T.accentBorder}; }
      .tb-input::placeholder { color: ${T.muted}; }
    `}</style>
  );
}

// ── SHARED COMPONENT STYLES ───────────────────────────────────────────────
// Call these functions to get inline style objects

export const styles = {
  // Page wrapper
  page: {
    minHeight: "100vh",
    background: T.bg,
    fontFamily: fonts.body,
    color: T.text,
    position: "relative",
    overflow: "hidden",
  },

  // Frosted header bar
  header: {
    position: "relative",
    zIndex: 10,
    borderBottom: `1px solid ${T.border}`,
    background: `${T.bg}CC`,
    backdropFilter: "blur(20px)",
    padding: "14px 24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  // Brand title
  brandTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: 800,
    color: T.accent,
    letterSpacing: 2,
  },

  // Section label
  sectionLabel: {
    fontFamily: fonts.display,
    fontSize: 10,
    fontWeight: 700,
    color: T.muted,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 10,
  },

  // Card
  card: (highlight = false) => ({
    background: highlight ? T.accentBg : T.card,
    borderRadius: 14,
    border: `1px solid ${highlight ? T.accentBorder : T.border}`,
    padding: "16px 18px",
    position: "relative",
    overflow: "hidden",
  }),

  // Accent line (top of card)
  accentLine: (color = T.accent) => ({
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: 2,
    background: `linear-gradient(90deg,${color},${color}44,transparent)`,
  }),

  // Large number display
  bigNum: {
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: 800,
    color: T.text,
    letterSpacing: 1,
  },

  // Gold accent number
  accentNum: {
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: 800,
    color: T.accent,
    letterSpacing: 1,
  },

  // Heading
  h1: {
    fontFamily: fonts.display,
    fontSize: 36,
    fontWeight: 800,
    color: T.text,
    letterSpacing: 0.5,
    lineHeight: 1.1,
  },

  h2: {
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: 700,
    color: T.text,
    letterSpacing: 1,
  },

  h3: {
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: 700,
    color: T.text,
    letterSpacing: 0.5,
  },

  // Body text
  body: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: T.sub,
    lineHeight: 1.6,
  },

  // Primary button (gold)
  btnPrimary: {
    fontFamily: fonts.display,
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: 1,
    background: `linear-gradient(135deg,${T.accent},${T.accentDim})`,
    color: T.bg,
    border: "none",
    borderRadius: 10,
    padding: "10px 20px",
    cursor: "pointer",
  },

  // Ghost button
  btnGhost: (color = T.muted) => ({
    fontFamily: fonts.display,
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: 1,
    background: "transparent",
    color,
    border: `1px solid ${color}44`,
    borderRadius: 10,
    padding: "8px 16px",
    cursor: "pointer",
  }),

  // Badge / pill
  badge: (color = T.accent) => ({
    fontFamily: fonts.display,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1,
    color,
    background: color + "18",
    border: `1px solid ${color}33`,
    borderRadius: 4,
    padding: "2px 7px",
  }),

  // Input field
  input: {
    fontFamily: fonts.body,
    fontSize: 14,
    background: T.bg,
    border: `1px solid ${T.border}`,
    borderRadius: 8,
    padding: "10px 14px",
    color: T.text,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },

  // Divider
  divider: {
    borderBottom: `1px solid ${T.border}`,
    margin: "12px 0",
  },

  // Progress bar track
  barTrack: {
    background: T.border,
    borderRadius: 2,
    height: 4,
    overflow: "hidden",
  },

  // Progress bar fill
  barFill: (pct, color = T.accent) => ({
    height: "100%",
    width: `${pct}%`,
    background: `linear-gradient(90deg,${color},${color}88)`,
    borderRadius: 2,
    transition: "width 0.8s ease",
  }),

  // Atmospheric background elements
  atmosphere: {
    radialGold: {
      position: "fixed",
      top: -200, left: -200,
      width: 500, height: 500,
      background: `radial-gradient(circle,${T.accent}10 0%,transparent 70%)`,
      borderRadius: "50%",
      pointerEvents: "none",
      zIndex: 0,
    },
    radialRed: {
      position: "fixed",
      bottom: -200, right: -200,
      width: 400, height: 400,
      background: `radial-gradient(circle,${T.danger}08 0%,transparent 70%)`,
      borderRadius: "50%",
      pointerEvents: "none",
      zIndex: 0,
    },
    grid: {
      position: "fixed",
      inset: 0,
      backgroundImage: `linear-gradient(${T.border}06 1px,transparent 1px),linear-gradient(90deg,${T.border}06 1px,transparent 1px)`,
      backgroundSize: "60px 60px",
      pointerEvents: "none",
      zIndex: 0,
    },
  },
};

// ── QUICK HELPERS ─────────────────────────────────────────────────────────
// Staggered animation delay
export const fadeUp = (i = 0, base = 0.05) => ({
  animation: `tb-fadeUp 0.5s ease ${i * base}s both`,
});

// Team color with opacity
export const teamColor = (color, opacity = 1) =>
  opacity === 1 ? color : color + Math.round(opacity * 255).toString(16).padStart(2, "0");

// Format points
export const fmtPts = (n) => Number(n || 0).toLocaleString("en-IN");

export default { T, fonts, styles, fadeUp, fmtPts, GlobalStyles };
