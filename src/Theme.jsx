// ── THEME.JSX — Hot Orange · Barlow Condensed + Inter ────────────────────
// Direction: Stadium Scoreboard — coal black, hot orange accent, bold type
// Buttons: B+C fusion — angled clip-path + offset drop-shadow
// ─────────────────────────────────────────────────────────────────────────

import React from "react";

// ── GOOGLE FONTS ──────────────────────────────────────────────────────────
export const FONT_URL =
  "https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap";

// ── COLOR TOKENS ─────────────────────────────────────────────────────────
export const T = {
  bg:          "#080808",
  card:        "#111008",
  cardHover:   "#1A1208",
  border:      "#2A1E0A",
  borderHi:    "#3D2E10",
  text:        "#F5EBD8",
  sub:         "#B09070",
  muted:       "#7A6050",
  accent:      "#FF6B00",
  accentHi:    "#FF8C2A",
  accentDim:   "#CC4400",
  accentBg:    "#FF6B0012",
  accentBorder:"#FF6B0033",
  success:     "#2ECC71",
  successBg:   "#2ECC7112",
  danger:      "#FF3D5A",
  dangerBg:    "#FF3D5A12",
  info:        "#4F8EF7",
  infoBg:      "#4F8EF712",
  warning:     "#F5A623",
  warningBg:   "#F5A62312",
  purple:      "#A855F7",
  purpleBg:    "#A855F712",
};

// ── FONT FAMILIES ─────────────────────────────────────────────────────────
export const fonts = {
  display: "'Oswald', sans-serif",
  body:    "'Inter', sans-serif",
};

// ── BUTTON SYSTEM — B+C FUSION ────────────────────────────────────────────
export const btnClip = "polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)";

export const btn = {
  primary: {
    background: "#FF6B00",
    border: "none",
    padding: "11px 26px",
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 800,
    fontSize: 14,
    letterSpacing: 3,
    color: "#0F0800",
    cursor: "pointer",
    clipPath: "polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",
    textTransform: "uppercase",
    filter: "drop-shadow(3px 3px 0 #CC4400)",
  },
  ghost: {
    background: "transparent",
    border: "2px solid #FF6B00",
    padding: "9px 24px",
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 800,
    fontSize: 14,
    letterSpacing: 3,
    color: "#FF6B00",
    cursor: "pointer",
    clipPath: "polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",
    textTransform: "uppercase",
    filter: "drop-shadow(3px 3px 0 #CC4400)",
  },
  danger: {
    background: "#FF3D5A",
    border: "none",
    padding: "11px 26px",
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 800,
    fontSize: 14,
    letterSpacing: 3,
    color: "#fff",
    cursor: "pointer",
    clipPath: "polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",
    textTransform: "uppercase",
    filter: "drop-shadow(3px 3px 0 #7A0020)",
  },
  success: {
    background: "#2ECC71",
    border: "none",
    padding: "11px 26px",
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 800,
    fontSize: 14,
    letterSpacing: 3,
    color: "#050F05",
    cursor: "pointer",
    clipPath: "polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",
    textTransform: "uppercase",
    filter: "drop-shadow(3px 3px 0 #0A5020)",
  },
  sm: { padding: "7px 18px", fontSize: 12, letterSpacing: 2 },
};

// ── GLOBAL STYLES ─────────────────────────────────────────────────────────
export function GlobalStyles() {
  return (
    <style>{`
      @import url('${FONT_URL}');
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      *, *::before, *::after { font-family: 'Inter', sans-serif; }
      body {
        background: #0F0800;
        color: #F5EBD8;
        font-family: 'Inter', sans-serif;
        font-size: 14px;
        line-height: 1.6;
        -webkit-font-smoothing: antialiased;
      }
      h1, h2, h3, h4 { font-family: 'Oswald', sans-serif; }
      ::-webkit-scrollbar { width: 4px; height: 4px; }
      ::-webkit-scrollbar-track { background: #0F0800; }
      ::-webkit-scrollbar-thumb { background: #2A1A00; border-radius: 0; }
      ::-webkit-scrollbar-thumb:hover { background: #3D2500; }
      @keyframes tb-fadeUp   { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
      @keyframes tb-slideInLeft { from { transform:translateX(-100%); } to { transform:translateX(0); } }
      @keyframes tb-fadeIn   { from { opacity:0; } to { opacity:1; } }
      @keyframes tb-slideInFromLeft { from { opacity:0; transform:translateX(-40px) scale(0.95); } to { opacity:1; transform:translateX(0) scale(1); } }
      @keyframes tb-backdropFade { from { opacity:0; } to { opacity:1; } }
      @keyframes tb-slideIn  { from { transform:translateX(100%); } to { transform:translateX(0); } }
      @keyframes tb-pulse    { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      @keyframes tb-glow     { 0%,100% { filter:drop-shadow(0 0 6px #FF6B0066); } 50% { filter:drop-shadow(0 0 16px #FF6B00AA); } }
      @keyframes tb-spin     { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
      @keyframes tb-float    { 0%,100% { transform:translateY(0px); } 50% { transform:translateY(-10px); } }
      @keyframes tb-flash    { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
      @keyframes tb-ticker   { from { transform:translateX(0); } to { transform:translateX(-50%); } }
      .tb-fadeUp  { animation: tb-fadeUp  0.4s ease both; }
      .slide-in-left { animation: tb-slideInLeft 0.3s cubic-bezier(0.25,0.46,0.45,0.94) both; }
      .tb-modal-slide { animation: tb-slideInFromLeft 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
      .tb-modal-backdrop { animation: tb-backdropFade 0.25s ease both; }
      .tb-fadeIn  { animation: tb-fadeIn  0.25s ease both; }
      .tb-slideIn { animation: tb-slideIn 0.3s cubic-bezier(0.25,0.46,0.45,0.94) both; }
      .tb-pulse   { animation: tb-pulse   2s ease infinite; }
      .tb-spin    { animation: tb-spin    2s linear infinite; }
      .tb-float   { animation: tb-float   5s ease-in-out infinite; }
      .tb-glow    { animation: tb-glow    2s ease-in-out infinite; }
      .tb-flash   { animation: tb-flash   1s ease infinite; }
      .tb-card-hover { transition: border-color 0.15s ease, background 0.15s ease; cursor: pointer; }
      .tb-card-hover:hover { border-color: #FF6B0033 !important; background: #221200 !important; }
      .tb-btn {
        font-family: 'Barlow Condensed', sans-serif;
        font-weight: 800;
        letter-spacing: 3px;
        text-transform: uppercase;
        cursor: pointer;
        border: none;
        clip-path: polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%);
        transition: opacity 0.15s ease;
      }
      .tb-btn:hover { opacity: 0.88; }
      .tb-btn:active { opacity: 0.75; }
      .tb-btn-primary { background: #FF6B00; color: #0F0800; padding: 11px 26px; font-size: 14px; filter: drop-shadow(3px 3px 0 #CC4400); }
      .tb-btn-ghost { background: transparent; color: #FF6B00; border: 2px solid #FF6B00 !important; padding: 9px 24px; font-size: 14px; filter: drop-shadow(3px 3px 0 #CC4400); }
      .tb-btn-danger { background: #FF3D5A; color: #fff; padding: 11px 26px; font-size: 14px; filter: drop-shadow(3px 3px 0 #7A0020); }
      .tb-btn-success { background: #2ECC71; color: #050F05; padding: 11px 26px; font-size: 14px; filter: drop-shadow(3px 3px 0 #0A5020); }
      .tb-btn-sm { padding: 7px 18px !important; font-size: 12px !important; letter-spacing: 2px !important; }
      .tb-input {
        font-family: 'Inter', sans-serif;
        background: #0F0800;
        border: 1px solid #2A1A00;
        border-radius: 0;
        padding: 10px 14px;
        color: #F5EBD8;
        font-size: 14px;
        outline: none;
        width: 100%;
        box-sizing: border-box;
        transition: border-color 0.15s;
      }
      .tb-input:focus { border-color: #FF6B00; }
      .tb-input::placeholder { color: #5A3A20; }
      .tb-label {
        font-family: 'Barlow Condensed', sans-serif;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 4px;
        text-transform: uppercase;
        color: #5A3A20;
      }
      .tb-live {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-family: 'Barlow Condensed', sans-serif;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 3px;
        color: #FF3D5A;
        text-transform: uppercase;
      }
      .tb-live::before {
        content: '';
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #FF3D5A;
        animation: tb-flash 1s ease infinite;
        flex-shrink: 0;
      }

      /* ── MOBILE OPTIMIZATIONS ─────────────────────────────────────────── */
      @media (max-width: 768px) {
        /* Leaderboard: prevent points cutoff */
        .leaderboard-card {
          padding: 12px 8px !important;
        }
        .leaderboard-points {
          font-size: 32px !important;
          min-width: 80px;
          flex-shrink: 0 !important;
        }
        .leaderboard-points-first {
          font-size: 38px !important;
        }
        .leaderboard-team-name {
          font-size: 18px !important;
        }
        /* Draft page: prevent team name cutoff */
        .draft-team-name {
          font-size: 14px !important;
          letter-spacing: 1px !important;
          line-height: 1.2 !important;
          word-break: break-word;
        }
        /* Draft page: independent scrolling columns */
        .draft-left-column {
          width: 40% !important;
          max-height: calc(100vh - 200px) !important;
        }
      }
    `}</style>
  );
}

// ── SHARED STYLES ─────────────────────────────────────────────────────────
export const styles = {
  page: { minHeight: "100vh", background: T.bg, fontFamily: fonts.body, color: T.text, position: "relative", overflow: "hidden" },
  header: { position: "relative", zIndex: 10, borderBottom: `2px solid ${T.border}`, background: T.bg, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  brandTitle: { fontFamily: fonts.display, fontSize: 22, fontWeight: 900, color: T.accent, letterSpacing: 3, textTransform: "uppercase" },
  sectionLabel: { fontFamily: fonts.display, fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: 4, textTransform: "uppercase", marginBottom: 10 },
  card: (highlight = false) => ({
    background: highlight ? T.accentBg : T.card,
    borderRadius: 0,
    border: `1px solid ${highlight ? T.accentBorder : T.border}`,
    borderLeft: `4px solid ${highlight ? T.accent : T.border}`,
    padding: "16px 18px",
    position: "relative",
    overflow: "hidden",
  }),
  accentLine: (color = T.accent) => ({ position: "absolute", top: 0, left: 0, bottom: 0, width: 4, background: color }),
  bigNum: { fontFamily: fonts.display, fontSize: 36, fontWeight: 900, color: T.text, letterSpacing: 2, lineHeight: 1 },
  accentNum: { fontFamily: fonts.display, fontSize: 36, fontWeight: 900, color: T.accent, letterSpacing: 2, lineHeight: 1 },
  h1: { fontFamily: fonts.display, fontSize: 40, fontWeight: 900, color: T.text, letterSpacing: 2, lineHeight: 1, textTransform: "uppercase" },
  h2: { fontFamily: fonts.display, fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: 2, textTransform: "uppercase" },
  h3: { fontFamily: fonts.display, fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: 1, textTransform: "uppercase" },
  body: { fontFamily: fonts.body, fontSize: 13, color: T.sub, lineHeight: 1.6 },
  btnPrimary: { ...btn.primary },
  btnGhost: (color = T.accent) => ({ ...btn.ghost, border: `2px solid ${color}`, color, filter: `drop-shadow(3px 3px 0 ${color}66)` }),
  badge: (color = T.accent) => ({
    fontFamily: fonts.display, fontSize: 9, fontWeight: 700, letterSpacing: 1,
    color, background: color + "18", border: `1px solid ${color}33`,
    borderRadius: 0, padding: "2px 7px", textTransform: "uppercase",
    clipPath: "polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)",
  }),
  input: { fontFamily: fonts.body, fontSize: 14, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 0, padding: "10px 14px", color: T.text, outline: "none", width: "100%", boxSizing: "border-box" },
  divider: { borderBottom: `1px solid ${T.border}`, margin: "12px 0" },
  barTrack: { background: T.border, borderRadius: 0, height: 4, overflow: "hidden" },
  barFill: (pct, color = T.accent) => ({ height: "100%", width: `${pct}%`, background: color, transition: "width 0.8s ease" }),
  atmosphere: {
    radialOrange: { position: "fixed", top: -300, left: -300, width: 600, height: 600, background: `radial-gradient(circle,${T.accent}0A 0%,transparent 70%)`, borderRadius: "50%", pointerEvents: "none", zIndex: 0 },
    radialRed: { position: "fixed", bottom: -200, right: -200, width: 400, height: 400, background: `radial-gradient(circle,${T.danger}06 0%,transparent 70%)`, borderRadius: "50%", pointerEvents: "none", zIndex: 0 },
    grid: { position: "fixed", inset: 0, backgroundImage: `linear-gradient(${T.border}08 1px,transparent 1px),linear-gradient(90deg,${T.border}08 1px,transparent 1px)`, backgroundSize: "60px 60px", pointerEvents: "none", zIndex: 0 },
  },
};

// ── HELPERS ───────────────────────────────────────────────────────────────
export const fadeUp = (i = 0, base = 0.05) => ({ animation: `tb-fadeUp 0.4s ease ${i * base}s both` });
export const teamColor = (color, opacity = 1) => opacity === 1 ? color : color + Math.round(opacity * 255).toString(16).padStart(2, "0");
export const fmtPts = (n) => Number(n || 0).toLocaleString("en-IN");
export default { T, fonts, styles, btn, fadeUp, fmtPts, GlobalStyles };
