import React, { useState, useEffect } from "react";
import MVPSlideshow from './MVPSlideshow';
import FormChart from "./FormChart";
import H2HStats from "./H2HStats";
import MVPStats from "./MVPStats";
import TransferWindowComponent from "./TransferWindow";
import SnatchSection from "./SnatchSection";
import FetchPlayers from "./FetchPlayers";
import WeeklyReport from "./WeeklyReport";
import AllTimeXI from "./AllTimeXI";
import HomeHub from "./HomeHub";
import RulesSheet from "./RulesSheet";
import PlayerImage from "./PlayerImage";
import { T, fonts, GlobalStyles } from "./Theme";
import { parseJSON, cricbuzz, fetchLiveScorecard, extractIPL, parseScorecardToStats, DEFAULT_POINTS, calcPoints, calcBreakdown, sbGet, sbGetMany, sbSet, sbDel, generateTeamId, getSnatchWindowStatus, getUsers, saveUsers, hashPw, SUPABASE_URL, SB_HEADERS } from './utils.js';
import SmartStatsModal from './SmartStatsModal.jsx';
import SplashScreen from './SplashScreen.jsx';
import PasswordModal from './PasswordModal.jsx';
import FeedbackWidget from './FeedbackWidget.jsx';
import PitchHome from './PitchHome.jsx';
import TeamClaimScreen from './TeamClaimScreen.jsx';
import ChatWindow from './ChatWindow.jsx';
import CaptainModal from './CaptainModal.jsx';
import FixOwnershipModal from './FixOwnershipModal.jsx';
import AdminSetupScreen from './AdminSetupScreen.jsx';
import EditPointsForm from './EditPointsForm.jsx';
import ProposeRulesForm from './ProposeRulesForm.jsx';
import EditPlayerModal from './EditPlayerModal.jsx';
import { Spinner, Badge, Btn, Card } from './UI.jsx';
import SetupPage from './SetupPage.jsx';
import TransferPage from './TransferPage.jsx';
import MatchesPage from './MatchesPage.jsx';
import ResultsPage from './ResultsPage.jsx';
import LeaderboardPage from './LeaderboardPage.jsx';
let _pitchId = "p1";
const storeGet = (key) => sbGet(_pitchId + "_" + key);
const storeSet = async (key, val) => { 
  const fullKey = _pitchId + "_" + key;
  try {
    await fetch("https://rmcxhorijitrhqyrvvkn.supabase.co/rest/v1/league_data", {
      method: "POST",
      headers: {
        "apikey": "sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm",
        "Authorization": "Bearer sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify({ key: fullKey, value: val, updated_at: new Date().toISOString() })
    });
  } catch (e) {
    console.error("❌ POST failed:", e);
  }
};
const storeDel = (key) => sbDel(_pitchId + "_" + key);

async function callAI(userPrompt, system = "Return only valid JSON.") {
  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: userPrompt }],
  };
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
}

const PALETTE = ["#FF3D5A","#4F8EF7","#2ECC71","#F5A623","#A855F7","#06B6D4","#FF6B35","#EC4899","#84CC16","#64748B"];
const ROLE_COLORS = { Batsman:"#4F8EF7", Bowler:"#FF3D5A", "All-Rounder":"#2ECC71", "Wicket-Keeper":"#F5A623" };
const ROLES = ["All","Batsman","Bowler","All-Rounder","Wicket-Keeper"];
const IPL_TEAMS = ["CSK","MI","RCB","KKR","SRH","RR","PBKS","DC","GT","LSG"];

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Barlow+Condensed:wght@400;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  :root{--bg:#0C0C0F;--surface:#111118;--card:#111118;--border:#222230;--gold:#C9A84C;--text:#E8E0CC;--muted:#3A3A52;--accent:#4F8EF7;}
  body{font-family:'Barlow Condensed',sans-serif;background:var(--bg);color:var(--text);}
  select,input{font-family:inherit;}
  ::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:var(--surface);}::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}
  .fade-in{animation:fadeIn .3s ease;}
  @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
@keyframes tb-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
  .desk-only{display:inline-flex}
  .mob-only{display:none}
  @media(max-width:600px){
    .desk-only{display:none!important}
    .mob-only{display:inline-flex!important}
    .mvp-slideshow.desk-sidebar{display:none!important}
  }
`;





function App({ pitch, onLeave, onLeaveGuest, user, onLogout, myTeam, myPinHash, isGuest, isAdmin }) {
  // Clone banner shown at very top if this is a clone pitch
  const [page, setPage] = useState(() => { try { return localStorage.getItem("tb_page_" + pitch?.id) || "leaderboard"; } catch { return "leaderboard"; } });
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [matches, setMatches] = useState([]);
  const [tournaments, setTournaments] = useState([{id:"t_ipl",name:"Indian Premier League",open:true}]);
  const [newTournamentName, setNewTournamentName] = useState("");
  const [captainMatch, setCaptainMatch] = useState(null);
  const [captains, setCaptains] = useState({});
  const [points, setPoints] = useState(() => {
  try {
    const cached = localStorage.getItem('tb_appdata_' + (window.location.pathname.split('/')[1] || 'p1'));
    return JSON.parse(cached)?.points || {};
  } catch { return {}; }
});
const [pointsReady, setPointsReady] = useState(() => {
  try {
    const cached = localStorage.getItem('tb_appdata_' + (window.location.pathname.split('/')[1] || 'p1'));
    return !!(JSON.parse(cached)?.points);
  } catch { return false; }
});
  const [loading, setLoading] = useState("");
  const [numTeams, setNumTeams] = useState(4);
  const [tNames, setTNames] = useState(Array.from({length:10},(_,i)=>"Team "+(i+1)));
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(null);
  const [showMvpModal, setShowMvpModal] = useState(false);
  const [pwHash, setPwHash] = useState(null);
  const [recoveryHash, setRecoveryHash] = useState(null);
  const [appReady, setAppReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [teamIdentity, setTeamIdentity] = useState({});
  const [fetchPlayerModal, setFetchPlayerModal] = useState(null);
  const [aiMatchModal, setAiMatchModal] = useState(null); // {tournamentId, tournamentName}
  const [aiMatchCount, setAiMatchCount] = useState(10);
  const [aiMatchGenerating, setAiMatchGenerating] = useState(false);
  const [aiMatchError, setAiMatchError] = useState("");
  const [aiMatchSuccess, setAiMatchSuccess] = useState("");
  const [aiMatchText, setAiMatchText] = useState("");
  const [aiMatchReplace, setAiMatchReplace] = useState(false); // null | { tournamentId, tournamentName }
  const [addTournamentModal, setAddTournamentModal] = useState(false);
  const [addTournamentSource, setAddTournamentSource] = useState(null);
  const [addTournamentSeries, setAddTournamentSeries] = useState([]);
  const [addTournamentSeriesLoading, setAddTournamentSeriesLoading] = useState(false);
  const [addTournamentSeriesInput, setAddTournamentSeriesInput] = useState('');
  const [addTournamentSelected, setAddTournamentSelected] = useState(null);
  const [fetchPlayerSource, setFetchPlayerSource] = useState(null); // 'cb' | 'cd'
  const [fetchPlayerSeries, setFetchPlayerSeries] = useState([]);
  const [fetchPlayerSeriesLoading, setFetchPlayerSeriesLoading] = useState(false);
  const [fetchPlayerSeriesInput, setFetchPlayerSeriesInput] = useState('');
  const [fetchPlayerSelectedSeries, setFetchPlayerSelectedSeries] = useState(null);
  const [teamIdsOpen, setTeamIdsOpen] = useState(false);
  const [ruleProposal, setRuleProposal] = useState(null);
  const [pitchConfig, setPitchConfig] = useState({});
  const [pointsConfig, setPointsConfig] = useState({
    run:1, four:8, six:12, fifty:10, century:20,
    wicket:25, fourWkt:8, fiveWkt:15, ecoBonus:10, ecoThreshold:6, ecoMinOvers:2,
    catch:8, stumping:12, runout:12,
    allRoundMinRuns:30, allRoundMinWkts:2, allRoundBonus:15,
    longestSix:50, captainMult:2, vcMult:1.5
  }); // loaded from supabase
  const [guestToast, setGuestToast] = useState(false);
  const [guestAllowed, setGuestAllowed] = useState(() => pitch?.guestAllowed !== false);
  const [adminClaimModal, setAdminClaimModal] = useState(false);
  const [adminClaimTeam, setAdminClaimTeam] = useState(null);
  const [adminPin, setAdminPin] = useState('');
  const [adminPinConfirm, setAdminPinConfirm] = useState('');
  const [adminPinErr, setAdminPinErr] = useState('');
  const TOURNEY_COLORS = ["#F5A623","#4F8EF7","#2ECC71","#A855F7","#FF3D5A","#06B6D4","#F97316","#EC4899"];
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLastRead, setNotifLastRead] = useState(() => { try { return parseInt(localStorage.getItem('tb_notifLastRead')||'0'); } catch { return 0; } });
  const [broadcastInput, setBroadcastInput] = useState('');
  const [votePin, setVotePin] = useState('');
  const [votePinErr, setVotePinErr] = useState(''); // {pid, fromTeamId}
  const [snatchWindowStatus, setSnatchWindowStatus] = useState(getSnatchWindowStatus());
  const [liveScores, setLiveScores] = useState({});
  const pollRef = React.useRef(null);
  const [unlocked, setUnlocked] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [editPlayer, setEditPlayer] = useState(null); // player being edited
  useEffect(() => {
  console.log("editPlayer state changed:", editPlayer);
}, [editPlayer]);
  const [smartStatsMatch, setSmartStatsMatch] = useState(null);
  const [squadView, setSquadView] = useState(false);
  const [showMVP, setShowMVP] = useState(false);
  const [showAllTimeXI, setShowAllTimeXI] = useState(false);
  const [showWeeklyReport, setShowWeeklyReport] = useState(false);
  const [showFixOwnership, setShowFixOwnership] = useState(false);
  const [showRulesPanel, setShowRulesPanel] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // {msg, fn}
  const [selectedBulk, setSelectedBulk] = useState([]); // toggle squad view
  const [teamFilter, setTeamFilter] = useState(null); // filter by fantasy team
  const [sortOrder, setSortOrder] = useState('null'); // default | az | za
  const [teamLogos, setTeamLogos] = useState({});
  const [safePlayers, setSafePlayers] = useState({}); // {teamId: [pid,pid,pid]}
  const [ruledOut, setRuledOut] = useState([]); // [pid, pid] — players ruled out for season
  const [unsoldPool, setUnsoldPool] = useState([]);
const [poolLoading, setPoolLoading] = useState(true);
const [unsoldSearch, setUnsoldSearch] = useState("");
const [unsoldTierFilter, setUnsoldTierFilter] = useState("All");
  const [myHighlights, setMyHighlights] = useState({});
  const [myNotes, setMyNotes] = useState({});
  const [editingNote, setEditingNote] = useState(null);
  const [noteInput, setNoteInput] = useState(''); // manually managed unsold list
  const [draftTab, setDraftTab] = useState('players');
const [showUnassigned, setShowUnassigned] = useState(false); // players | unsold
const [showCompare, setShowCompare] = useState(false);
const [compareTeam, setCompareTeam] = useState("");
const [compareRole, setCompareRole] = useState("All");
const [compareTier, setCompareTier] = useState("All");
const [highlightPlayer, setHighlightPlayer] = useState(null);
  const [teamRosterModal, setTeamRosterModal] = useState(null); // null or team.id
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerStatsModal, setPlayerStatsModal] = useState(null); // player object
  const [showAllPlayersModal, setShowAllPlayersModal] = useState(false);
  // ownershipLog: {pid: [{teamId, from: isoDate, to: isoDate|null}]}
  const [ownershipLog, setOwnershipLog] = useState({});
  const [transfers, setTransfers] = useState({
    weekNum: 1,
    phase: 'closed', // closed | release | pick | done
    releases: {}, // {teamId: [pid, pid]}
    picks: [],    // [{teamId, pid, timestamp}]
    currentPickTeam: null,
    pickDeadline: null,
    history: [],  // all past transfers
  });
  const [transfersLoaded, setTransfersLoaded] = useState(false);
  const [snatch, setSnatch] = useState({
    weekNum: 1,
    active: null, // {byTeamId, pid, fromTeamId, pointsAtSnatch, startDate}
    history: [],
  });

  useEffect(() => {
    (async () => {
      try {
        // ── Instant load from localStorage cache ──────────────────────────
        try {
          const cached = localStorage.getItem('tb_appdata_' + _pitchId);
          if (cached) {
            const d = JSON.parse(cached);
            if(d.teams)       setTeams(d.teams);
            if(d.players)     setPlayers(d.players);
            if(d.assignments) setAssignments(d.assignments);
            if(d.matches)     setMatches(d.matches);
            if(d.captains)    setCaptains(d.captains);
            // Note: snatch intentionally NOT loaded from cache — always fetch fresh from Supabase
            // Note: transfers intentionally NOT loaded from cache — always fetch fresh from Supabase
            if(d.tournaments && Array.isArray(d.tournaments))  { setTournaments(d.tournaments); const exp={}; d.tournaments.forEach(t=>exp[t.id]=true); setExpandedTournaments(exp); }
            setAppReady(true); // show UI immediately from cache
          }
        } catch {}

        // ── Pass 1: Critical keys from Supabase ───────────────────────────
        const criticalKeys = ["teams","assignments","matches","captains","tnames","numteams","pwhash","transfers","snatch","teamIdentity","pointsConfig","tournaments","safePlayers","pitchConfig","ruledOut","unsoldPool"];
        // ── Batched loading: 5 keys at a time with delays ───────────────
        const batchLoad = async (keys, batchSize = 5) => {
          const results = [];
          for (let i = 0; i < keys.length; i += batchSize) {
            const batch = keys.slice(i, i + batchSize);
            const batchKeys = batch.map(k => _pitchId + "_" + k);
            const batchResults = await sbGetMany(batchKeys);
            results.push(...batchResults);
            
            // Delay between batches to respect rate limits
            if (i + batchSize < keys.length) {
              await new Promise(r => setTimeout(r, 300));
            }
          }
          return results;
        };

        // Load critical keys in batches
        const critResults = await batchLoad(criticalKeys, 5);
        const [t,a,m,c,tn,nt,ph,tr,sn,ti,pc,tv,sp,pcfg,ro,up0] = critResults;
        if(up0) setUnsoldPool(up0);
setPoolLoading(false);
        if(t) setTeams(t);
        if(a) setAssignments(a);
        if(m) setMatches(m);
        if(c) setCaptains(c);
        if(tn) setTNames(tn);
        if(nt) setNumTeams(nt);
        if(ph) setPwHash(ph);
        else { const ah = await sbGet(_pitchId + "_adminHash"); if(ah) { setPwHash(ah); storeSet("pwhash", ah); } }
        if(tr && typeof tr === 'object') { setTransfers(tr); setTransfersLoaded(true); }
        else setTransfersLoaded(true);
        if(sn && typeof sn === 'object') setSnatch(sn);
        if(ti && typeof ti === 'object') setTeamIdentity(ti);
        if(pc && typeof pc === 'object') setPointsConfig(prev=>({...prev,...pc}));
        if(tv && Array.isArray(tv)) { setTournaments(tv); const exp={}; tv.forEach(t=>exp[t.id]=true); setExpandedTournaments(exp); }
        if(sp) setSafePlayers(sp);
        if(pcfg && typeof pcfg === 'object') setPitchConfig(pcfg);
        if(ro && Array.isArray(ro)) setRuledOut(ro);
        setAppReady(true);

        // ── Pass 2: Heavy keys in batches ────────────────────────────────
        const heavyKeys = ["players","points","ownershipLog","recoveryHash","teamLogos","ruleProposal"];
        const heavyResults = await batchLoad(heavyKeys, 3); // Smaller batches for heavy data
        const [p,pts,ol,rh,tl,rp] = heavyResults;
        if(p) setPlayers(p);
        if(pts) { setPoints(pts); setPointsReady(true); }
        if(ol && typeof ol === 'object') setOwnershipLog(ol);
        if(rh) setRecoveryHash(rh);
        if(tl) setTeamLogos(tl);
        if(rp && typeof rp === 'object') setRuleProposal(rp);

        // ── Save fresh data to localStorage for next instant load ─────────
        try {
          const toCache = { teams: t, players: p, assignments: a, matches: m, captains: c, tournaments: tv, points: pts };
          localStorage.setItem('tb_appdata_' + _pitchId, JSON.stringify(toCache));
        } catch {}

      } catch(e) {
        console.error("Load error:", e.message);
        setAppReady(true);
      }
    })();
  }, []);

  // ── AUTO-BACKUP SYSTEM ─────────────────────────────────────────────────
  useEffect(() => {
    // Only backup when we have actual player data loaded
    if (players.length > 0) {
      const timestamp = Date.now();
      const backupKey = `tb_backup_p1_${timestamp}`;
      const currentData = localStorage.getItem('tb_appdata_p1');
      
      if (currentData && currentData !== 'null') {
        localStorage.setItem(backupKey, currentData);
        console.log(`✅ Auto-backup created: ${backupKey}`);
        
        // Keep only last 5 backups to save space
        const allBackups = Object.keys(localStorage)
          .filter(k => k.startsWith('tb_backup_p1_'))
          .sort();
        if (allBackups.length > 5) {
          allBackups.slice(0, -5).forEach(k => localStorage.removeItem(k));
        }
      }
    }
  }, [players]);

  // Auto-navigate admin to setup when no teams exist
  useEffect(() => {
    if (!appReady) return;
    if (isAdmin && teams.length === 0 && page !== "setup") {
      setPage("setup");
    }
  }, [appReady, isAdmin, teams.length]);

  // ── Refs to prevent double-firing of auto actions ────────────────────────
  const autoReleaseRanRef = React.useRef(false);
  const autoPickRanRef    = React.useRef(null); // stores last pickDeadline processed

  // ── AUTO-RELEASE & AUTO-START TRADE ──────────────────────────────────────
  useEffect(() => {
    if (!appReady) return;

    // ── Helper: IST date string ───────────────────────────────────────────
    const istNow = () => new Date(Date.now() + new Date().getTimezoneOffset()*60000 + 5.5*3600000);

    // ── Helper: find next match start time ───────────────────────────────
    const getNextMatchTime = () => {
      if (transfers.matchStartTime) return new Date(transfers.matchStartTime);
      const now = istNow();
      const todayStr = now.toISOString().split("T")[0]; // IST date
      const upcoming = [...matches]
        .filter(m => m.status !== "completed" && m.date >= todayStr)
        .sort((a, b) => {
          const da = a.date + (a.time ? " " + a.time : " 20:00");
          const db = b.date + (b.time ? " " + b.time : " 20:00");
          return da.localeCompare(db);
        });
      if (upcoming.length > 0) {
        const m = upcoming[0];
        const timeStr = m.time || "20:00";
        const dt = new Date(`${m.date}T${timeStr}:00+05:30`);
        if (dt > Date.now()) return dt;
      }
      return new Date(Date.now() + 8 * 3600000); // fallback
    };

    // ── Auto-release: when release deadline passes ────────────────────────
    if (transfers.phase === 'release') {
      const deadline = transfers.releaseDeadline ? new Date(transfers.releaseDeadline) : null;
      const isAfterNoon = istNow().getUTCHours() >= 12;

      // Only auto-release if: deadline passed AND past noon AND haven't run yet this session
      if (deadline && Date.now() > deadline.getTime() && isAfterNoon && !autoReleaseRanRef.current) {
        autoReleaseRanRef.current = true; // prevent double-fire in this session

        const newReleases = { ...transfers.releases };
        const newAssign = { ...assignments };
        const newPool = [...unsoldPool];
        const notifications = [];

        for (const team of teams) {
          const released = [...(newReleases[team.id] || [])];
          if (released.length >= 3) { newReleases[team.id] = released; continue; }
          const eligible = players.filter(p =>
            assignments[p.id] === team.id &&
            !released.includes(p.id) &&
            !Object.values(safePlayers || {}).flat().includes(p.id)
          );
          const shuffled = [...eligible].sort(() => Math.random() - 0.5);
          const toRelease = shuffled.slice(0, 3 - released.length);
          for (const p of toRelease) {
            delete newAssign[p.id];
            if (!newPool.includes(p.id)) newPool.push(p.id);
            released.push(p.id);
          }
          newReleases[team.id] = released;
          if (toRelease.length > 0) {
            notifications.push(`⚠️ System auto-released ${toRelease.map(p=>p.name).join(", ")} for ${team.name} (missed deadline)`);
          }
        }

        // Save auto-released players
        updAssign(newAssign);
        setUnsoldPool(newPool); storeSet("unsoldPool", newPool);
        for (const msg of notifications) pushNotif('transfer', msg, '🤖');

        // Auto-start trade phase immediately
        const matchTime = getNextMatchTime();
        const totalPicks = Object.values(newReleases).reduce((s, arr) => s + arr.length, 0);
        const msAvail = Math.max(0, matchTime.getTime() - Date.now() - 30 * 60000);
        const msPerPick = totalPicks > 0 ? Math.max(15 * 60000, Math.floor(msAvail / totalPicks)) : 45 * 60000;
        const minPerPick = Math.round(msPerPick / 60000);
        const firstTeam = [...teams].sort((a,b) =>
          players.filter(p => newAssign[p.id] === a.id).length -
          players.filter(p => newAssign[p.id] === b.id).length
        )[0]?.id;
        updTransfers({
          ...transfers,
          phase: 'trade',
          releases: newReleases,
          currentPickTeam: firstTeam,
          pickDeadline: new Date(Date.now() + msPerPick).toISOString(),
          matchStartTime: matchTime.toISOString(),
          msPerPick,
          tradedPairs: [],
          ineligible: [],
        });
        pushNotif('transfer', `🏁 Trade phase auto-started! ⏱ ${minPerPick} min per pick · Match at ${matchTime.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})} IST`, '🏁');
      }
    }

    // ── Auto-pick: when pick deadline expires ─────────────────────────────
    // Guard: only fire once per unique pickDeadline value
    if (
      transfers.phase === 'trade' &&
      transfers.pickDeadline &&
      transfers.currentPickTeam &&
      autoPickRanRef.current !== transfers.pickDeadline && // not already processed
      Date.now() > new Date(transfers.pickDeadline).getTime()
    ) {
      autoPickRanRef.current = transfers.pickDeadline; // mark as processed

      const currentTeamId = transfers.currentPickTeam;
      const released = (transfers.releases[currentTeamId] || []);
      const traded = (transfers.tradedPairs || []).filter(p => p.teamId === currentTeamId).map(p => p.releasedPid);
      const releasedPid = released.find(pid => !traded.includes(pid));

      if (releasedPid && unsoldPool.length > 0) {
        const available = unsoldPool
          .map(pid => players.find(p => p.id === pid))
          .filter(Boolean)
          .sort((a, b) => {
            const pA = Object.values(points[a.id]||{}).reduce((s,d)=>s+(d?.base||0),0);
            const pB = Object.values(points[b.id]||{}).reduce((s,d)=>s+(d?.base||0),0);
            return pB - pA;
          });
        const pick = available[0];
        if (pick) {
          const newAssign2 = { ...assignments, [pick.id]: currentTeamId };
          const newPool2 = unsoldPool.filter(x => x !== pick.id);
          const newLog = recordOwnership(pick.id, currentTeamId, ownershipLog);
          updAssign(newAssign2);
          setUnsoldPool(newPool2); storeSet("unsoldPool", newPool2);
          updOwnership(newLog);
          const newPairs = [...(transfers.tradedPairs||[]), { teamId: currentTeamId, pickedPid: pick.id, releasedPid, timestamp: new Date().toISOString(), autoPicked: true }];
          const msPerPick = transfers.msPerPick || 45*60000;
          const getNext = () => {
            const order = [...teams].sort((a,b) =>
              players.filter(p=>newAssign2[p.id]===a.id).length -
              players.filter(p=>newAssign2[p.id]===b.id).length
            ).map(t=>t.id);
            const idx = order.indexOf(currentTeamId);
            for (let i = 1; i <= order.length; i++) {
              const tid = order[(idx+i)%order.length];
              const rel = (transfers.releases[tid]||[]);
              const trd = newPairs.filter(p=>p.teamId===tid).map(p=>p.releasedPid);
              if (rel.filter(pid=>!trd.includes(pid)).length > 0) return tid;
            }
            return null;
          };
          const nextTeam = getNext();
          const newPhase = nextTeam ? 'trade' : 'done';
          updTransfers({ ...transfers, tradedPairs: newPairs, currentPickTeam: nextTeam, pickDeadline: nextTeam ? new Date(Date.now()+msPerPick).toISOString() : null, phase: newPhase });
          pushNotif('transfer', `🤖 System auto-picked ${pick.name} for ${teams.find(t=>t.id===currentTeamId)?.name} (time expired)`, '🤖');
        }
      }
    }
  }, [appReady, transfers.phase, transfers.pickDeadline, transfers.releaseDeadline]);
 // Checks every minute whether the transfer window should open.
  // Fires for everyone — whoever is on the app triggers it.
  // Writes to Supabase only once (when window first opens).
  useEffect(() => {
    if (!appReady || !transfersLoaded) return;

    const IST_OFFSET = 5.5 * 60 * 60 * 1000;

    const parseDay = (str, def) => {
      const days = {Sunday:0,Monday:1,Tuesday:2,Wednesday:3,Thursday:4,Friday:5,Saturday:6};
      if (!str) return def;
      const d = str.split(" ")[0];
      return days[d] ?? def;
    };
    const parseTime = (str, defH, defM) => {
      if (!str) return {h: defH, m: defM};
      const parts = str.split(" ");
      const hhmm = parts[parts.length - 2] || "11:59";
      const ampm = parts[parts.length - 1] || "PM";
      let [hh, mm] = hhmm.split(":").map(Number);
      if (ampm === "PM" && hh !== 12) hh += 12;
      if (ampm === "AM" && hh === 12) hh = 0;
      return {h: hh, m: mm};
    };

    const check = () => {
      // Exit immediately if window already open — zero Supabase calls
      if (transfers.phase !== 'closed') return;
      // Exit if admin manually closed/reset this week — wait for next window
      if (transfers.suppressUntil && Date.now() < new Date(transfers.suppressUntil)) return;

      const ist = new Date(Date.now() + IST_OFFSET);
      const day = ist.getUTCDay(), h = ist.getUTCHours(), m = ist.getUTCMinutes();

      const startDay = parseDay(pitchConfig?.transferStart, 0);
      const startTime = parseTime(pitchConfig?.transferStart, 23, 59);
      const endDay = parseDay(pitchConfig?.transferEnd, 1);
      const endTime = parseTime(pitchConfig?.transferEnd, 11, 0);

      const afterStart = day === startDay && (h > startTime.h || (h === startTime.h && m >= startTime.m));
      const beforeEnd = day === endDay && (h < endTime.h || (h === endTime.h && m < endTime.m));
      const sameDay = startDay === endDay;
      const betweenDays = !sameDay && startDay !== endDay && (
        startDay < endDay
          ? (day > startDay && day < endDay)
          : (day > startDay || day < endDay)
      );
      const inWindow = afterStart || betweenDays || (!sameDay && day === endDay && beforeEnd);

      if (!inWindow) return;

      // Calculate release deadline
      const dlEndDay = parseDay(pitchConfig?.transferEnd, 1);
      const dlEndTime = parseTime(pitchConfig?.transferEnd, 11, 0);
      const istNow2 = new Date(Date.now() + IST_OFFSET);
      const daysUntilEnd = (dlEndDay - istNow2.getUTCDay() + 7) % 7;
      const deadline = new Date(istNow2);
      deadline.setUTCDate(istNow2.getUTCDate() + daysUntilEnd);
      const totalMinsUTC = dlEndTime.h * 60 + dlEndTime.m - 330;
      deadline.setUTCHours(Math.floor(totalMinsUTC / 60), totalMinsUTC % 60, 0, 0);

      const updated = { ...transfers, phase: 'release', weekNum: transfers.weekNum, releaseDeadline: deadline.toISOString() };
      updTransfers(updated);
      pushNotif('transfer', 'Transfer window is now open — release your players!', '📤');
    };

    check(); // run immediately on mount
    const interval = setInterval(check, 60000); // re-check every minute
    return () => clearInterval(interval); // cleanup on unmount
  }, [appReady, transfersLoaded, transfers.phase, transfers.weekNum, pitchConfig]);

  // ── LOAD USER-SPECIFIC NOTES & HIGHLIGHTS ────────────────────────────────
  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      try {
        const emailKey = user.email.replace(/[@.]/g, "_");
        const hlKey    = _pitchId + "_hl_" + emailKey;
        const notesKey = _pitchId + "_notes_" + emailKey;
        const [hl, notes] = await sbGetMany([hlKey, notesKey]);
        if (hl && typeof hl === "object") setMyHighlights(hl);
        if (notes && typeof notes === "object") setMyNotes(notes);
      } catch {}
    })();
  }, [user?.email]);

  // ── CRICKETDATA fetch ──────────────────────────────────────────────────────
  const fetchFromCricketData = async (tournamentId, tournamentName) => {
    setLoading("Fetching from CricketData for " + tournamentName + "…");
    try {
      // First fetch series to understand structure
      const fetchWithTimeout = (url, ms=8000) => {
        const controller = new AbortController();
        const timer = setTimeout(()=>controller.abort(), ms);
        return fetch(url, {signal:controller.signal}).then(r=>r.json()).catch(()=>({})).finally(()=>clearTimeout(timer));
      };
      const [scheduleRes, liveRes, resultsRes] = await Promise.all([
        fetchWithTimeout("/api/cricketdata?path=cricket-schedule"),
        fetchWithTimeout("/api/cricketdata?path=currentMatches"),
        fetchWithTimeout("/api/cricketdata?path=cricket-results"),
      ]);
      const seriesRes = {};

      // Parse matches from CricketData schedule structure:
      // response.schedules[].scheduleAdWrapper.matchScheduleList[].{seriesName, matchInfo[]}
      const found = [];
      const schedules = scheduleRes?.response?.schedules || [];
      // CricketData live scores structure: response is array of live match objects
      const liveList = liveRes?.response || [];
      const liveMatches = Array.isArray(liveList) ? liveList : [];


      const liveMap = {};
      liveMatches.forEach(m => {
        const id = m?.matchId || m?.matchInfo?.matchId || m?.id;
        if (id) liveMap[String(id)] = m;
      });






      // Update match statuses using cricbuzzId (same IDs across both sources)
      const updatedExisting = matches.map(m => {
        if (m.status === "completed") return m;
        const lm = liveMap[String(m.cricbuzzId)];
        if (lm) {
          const isComplete = lm?.matchStatus === "complete" || lm?.status === "Complete";
          return {...m, status: isComplete ? "completed" : "live"};
        }
        return m;
      });
      if (JSON.stringify(updatedExisting) !== JSON.stringify(matches)) {
        updMatches(updatedExisting);
      }

      schedules.forEach(s => {
        (s?.scheduleAdWrapper?.matchScheduleList || []).forEach(item => {
          const seriesName = item?.seriesName || "";
          if (!seriesName.toLowerCase().includes(tournamentName.toLowerCase())) return;
          (item?.matchInfo || []).forEach(m => {
            const live = liveMap[m?.matchId];
            found.push({ info: m, live });
          });
        });
      });

      // Add completed matches from results endpoint
      const resultsList = resultsRes?.response || [];
      const completedMatches = Array.isArray(resultsList) ? resultsList : [];
      completedMatches.forEach(m => {
        const seriesName = m?.seriesName || m?.series || m?.name || "";
        if (!seriesName.toLowerCase().includes(tournamentName.toLowerCase())) return;
        const matchId = m?.matchId || m?.id;
        if (!matchId) return;
        if (!found.some(f => String(f.info?.matchId) === String(matchId))) {
          found.push({ info: { ...m, matchId }, live: { ...m, matchStatus: "complete", status: "Complete" } });
        }
      });

      if (found.length === 0) {
        // Show available series names to help admin find correct name
        const availableSeries = [];
        const debugSeries = [];
        schedules.forEach(s => {
          (s?.scheduleAdWrapper?.matchScheduleList || []).forEach(item => {
            const n = item?.seriesName || "";
            if(n && !debugSeries.includes(n)) debugSeries.push(n);
          });
        });
        const allItems2 = debugSeries;
        allItems2.forEach(item => {
          const n = item || "";
          if (n && !availableSeries.includes(n)) availableSeries.push(n);
        });
        alert("No matches found for [" + tournamentName + "] in CricketData.\n\nAvailable series:\n" + (availableSeries.slice(0,10).join("\n") || "None returned"));
        setLoading(""); return;
      }

      const existingIds = new Set(matches.map(m => m.cricbuzzId).filter(Boolean));
      const updated = [...matches];
      let nextNum = matches.length + 1;

      found.forEach(({ info: m, live }) => {
        if (!m?.matchId) return;
        const existing = updated.find(x => x.cdMatchId === m.matchId || x.cricbuzzId === m.matchId);
        const isLive = !!live;
        const isComplete = m?.status === "Complete" || m?.matchStatus === "complete";
        const status = isComplete ? "completed" : isLive ? "live" : "upcoming";

        if (existing) {
          existing.status = existing.status === "completed" ? "completed" : status;
          if (!existing.cdMatchId) existing.cdMatchId = m.matchId;
        } else if (!existingIds.has(m.matchId)) {
          updated.push({
            id: "cd_" + m.matchId,
            cricbuzzId: m.matchId,
            tournamentId,
            matchNum: nextNum++,
            date: m.startDate ? new Date(parseInt(m.startDate)).toISOString().split("T")[0] : "TBD",
            time: m.startDate ? new Date(parseInt(m.startDate)).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Kolkata"}) : "",
            team1: m.team1?.teamSName || m.team1?.teamName || "TBA",
            team2: m.team2?.teamSName || m.team2?.teamName || "TBA",
            venue: m.venueInfo?.ground ? m.venueInfo.ground + (m.venueInfo.city ? ", " + m.venueInfo.city : "") : "TBD",
            status,
            result: m.matchDesc || null,
          });
        }
      });

      updMatches(updated);
      const tM = updated.filter(m => m.tournamentId === tournamentId);
      alert("CricketData: " + tM.filter(m=>m.status==="completed").length + " completed, " + tM.filter(m=>m.status==="live").length + " live, " + tM.filter(m=>m.status==="upcoming").length + " upcoming.");
    } catch(e) {
      alert("CricketData error: " + e.message);
    }
    setLoading("");
  };



  const fetchTournamentSeriesSuggestions = async (source) => {
    setAddTournamentSeriesLoading(true);
    setAddTournamentSeries([]);
    try {
      if (source === 'cb') {
        const [r1, r2] = await Promise.all([
          fetch("/api/cricbuzz?path=" + encodeURIComponent("series/v1/domestic")).then(r=>r.json()).catch(()=>({})),
          fetch("/api/cricbuzz?path=" + encodeURIComponent("series/v1/international")).then(r=>r.json()).catch(()=>({})),
        ]);
        const all = [];
        [r1, r2].forEach(data => {
          (data?.seriesMapProto || data?.seriesMap || []).forEach(month => {
            (month?.series || []).forEach(s => {
              if (s?.id && s?.name) all.push({ id: s.id, name: s.name, source: 'cb' });
            });
          });
        });
        setAddTournamentSeries(all);
      } else {
        const res = await fetch("/api/cricketdata?path=cricket-series").then(r=>r.json()).catch(()=>({}));
        const seriesData = res?.response || [];
        const all = [];
        (Array.isArray(seriesData) ? seriesData : []).forEach(s => {
          const name = s?.title || s?.series || s?.name || "";
          const id = s?.url || s?.id || name;
          if (name) all.push({ id, name, source: 'cd' });
        });
        setAddTournamentSeries(all);
      }
    } catch(e) { console.error(e); }
    setAddTournamentSeriesLoading(false);
  };

  const confirmAddTournament = async () => {
    if (!addTournamentSelected) return;
    const newT = {
      id: "t_" + Date.now(),
      name: addTournamentSelected.name,
      seriesId: addTournamentSelected.id,
      source: addTournamentSource,
    };
    const updated = [...tournaments, newT];
    setTournaments(updated);
    setExpandedTournaments(prev => ({...prev, [newT.id]: true}));
    storeSet("tournaments", updated);
    setAddTournamentModal(false);
    setAddTournamentSource(null);
    setAddTournamentSeries([]);
    setAddTournamentSeriesInput('');
    setAddTournamentSelected(null);
  };

  const fetchSeriesSuggestions = async (source) => {
    setFetchPlayerSeriesLoading(true);
    setFetchPlayerSeries([]);
    try {
      if (source === 'cb') {
        // Cricbuzz: fetch series list
        const res = await fetch("/api/cricbuzz?path=" + encodeURIComponent("series/v1/domestic")).then(r=>r.json()).catch(()=>({}));
        const res2 = await fetch("/api/cricbuzz?path=" + encodeURIComponent("series/v1/international")).then(r=>r.json()).catch(()=>({}));
        const all = [];
        [res, res2].forEach(data => {
          (data?.seriesMapProto || data?.seriesMap || []).forEach(month => {
            (month?.series || []).forEach(s => {
              if (s?.id && s?.name) all.push({ id: s.id, name: s.name });
            });
          });
        });
        setFetchPlayerSeries(all);
      } else {
        // CricketData: fetch series
        const res = await fetch("/api/cricketdata?path=cricket-series").then(r=>r.json()).catch(()=>({}));
        const seriesData = res?.response || [];
        const all = [];
        (Array.isArray(seriesData) ? seriesData : []).forEach(s => {
          const name = s?.title || s?.series || s?.name || "";
          const id = s?.url || s?.id || name;
          if (name) all.push({ id, name });
        });
        setFetchPlayerSeries(all);
      }
    } catch(e) {
      console.error("Series fetch error:", e);
    }
    setFetchPlayerSeriesLoading(false);
  };

  const fetchPlayersFromSeries = async () => {
    if (!fetchPlayerSelectedSeries) return;
    setFetchPlayerModal(false);
    if (fetchPlayerSource === 'cb') {
      // Use existing Cricbuzz fetchPlayers with selected series ID
      const seriesId = fetchPlayerSelectedSeries.id;
      await fetchPlayersFromCricbuzz(seriesId);
    } else {
      alert("CricketData player fetch coming soon — use Cricbuzz for now.");
    }
  };


  // ── NOTIFICATIONS ─────────────────────────────────────────────────────────
  const pushNotif = async (type, text, emoji) => {
    const data = await storeGet("notifications") || {};
    const existing = data.list || [];
    const notif = { id: Date.now().toString(), type, text, emoji: emoji||"🔔", ts: Date.now() };
    const updated = [...existing, notif].slice(-30);
    await storeSet("notifications", {list: updated});
    setNotifications(updated);
  };

  const loadNotifications = async () => {
    const data = await storeGet("notifications") || {};
    setNotifications(data.list || []);
  };

  const markNotifsRead = () => {
    const now = Date.now();
    setNotifLastRead(now);
    try { localStorage.setItem('tb_notifLastRead', now.toString()); } catch {}
  };

  const clearNotifications = async () => {
    await storeSet("notifications", {list: []});
    setNotifications([]);
  };

  const broadcastNotif = async () => {
    if (!broadcastInput.trim()) return;
    await pushNotif("broadcast", broadcastInput.trim(), "📢");
    setBroadcastInput('');
  };

  React.useEffect(() => {
    loadNotifications();
    const t = setInterval(loadNotifications, 120000);
    return () => clearInterval(t);
  }, []);

  const unreadNotifCount = notifications.filter(n => n.ts > notifLastRead).length;

  const nav=(pg)=>{setPage(pg);storeSet("page",pg);try{localStorage.setItem("tb_page_"+pitch?.id,pg);}catch{}};
  const upd=(setter,key)=>(val)=>{setter(val);storeSet(key,val);};
  const updTeams=upd(setTeams,"teams"),updAssign=upd(setAssignments,"assignments"),
        updMatches=upd(setMatches,"matches"),updCaptains=upd(setCaptains,"captains"),
        updPoints=upd(setPoints,"points");

  const saveHighlights = async (updated) => { setMyHighlights(updated); await storeSet("hl_"+(user?.email||"").replace(/[@.]/g,"_"), updated); };
  const saveNotes = async (updated) => { setMyNotes(updated); await storeSet("notes_"+(user?.email||"").replace(/[@.]/g,"_"), updated); };

  const toggleSafePlayer = (teamId, pid) => {
    withPassword(() => {
      const current = safePlayers[teamId] || [];
      let updated;
      if (current.includes(pid)) {
        updated = current.filter(x => x !== pid);
      } else {
        if (current.length >= 3) { alert("Max 3 safe players per team!"); return; }
        updated = [...current, pid];
      }
      const newSafe = { ...safePlayers, [teamId]: updated };
      setSafePlayers(newSafe);
      storeSet("safePlayers", newSafe);
    });
  };

  const isPlayerSafe = (pid) => Object.values(safePlayers).some(arr => arr.includes(pid));
  const isPlayerSafeForTeam = (teamId, pid) => (safePlayers[teamId]||[]).includes(pid);

  const addToUnsoldPool = (pid) => {
    withPassword(() => {
      if (unsoldPool.includes(pid)) return;
      const updated = [...unsoldPool, pid];
      setUnsoldPool(updated);
      storeSet("unsoldPool", updated);
    });
  };

  const removeFromUnsoldPool = (pid) => {
    withPassword(() => {
      const updated = unsoldPool.filter(x => x !== pid);
      setUnsoldPool(updated);
      storeSet("unsoldPool", updated);
    });
  };

  // ── TRANSFER HELPERS ────────────────────────────────────────────────────────
  const updOwnership = (val) => { setOwnershipLog(val); storeSet("ownershipLog", val); };

  // Record ownership change — close previous period, open new one
  const recordOwnership = (pid, newTeamId, log) => {
    const now = new Date().toISOString();
    const history = log[pid] ? [...log[pid]] : [];
    // Close previous period
    if (history.length > 0 && !history[history.length-1].to) {
      history[history.length-1].to = now;
    }
    // Open new period (null to = currently owned)
    if (newTeamId) history.push({ teamId: newTeamId, from: now, to: null });
    return { ...log, [pid]: history };
  };

  const updTransfers = (val) => { setTransfers(val); storeSet("transfers", val); };
  const updSnatch = (val) => { setSnatch(val); storeSet("snatch", val); };

  const openReleaseWindow = () => withPassword(() => {
    const updated = {...transfers, phase:'release', weekNum: transfers.weekNum};
    updTransfers(updated);
    pushNotif('transfer', 'Transfer window opened — release your players now', '📤');
    alert("✅ Release window is now OPEN. Teams can release up to 3 players until Monday 11 AM.");
  });

  const closeReleaseWindow = () => withPassword(() => {
    const updated = {...transfers, phase:'pick'};
    // Set first picking team = #1 on leaderboard
    const firstTeam = leaderboard[0]?.id || null;
    const deadline = new Date(Date.now() + 45*60*1000).toISOString();
    updated.currentPickTeam = firstTeam;
    updated.pickDeadline = deadline;
    updTransfers(updated);
    alert(`✅ Release window CLOSED. ${leaderboard[0]?.name} picks first! 45 minutes on the clock.`);
  });

  const releasePlayer = (teamId, pid) => withPassword(() => {
    if (transfers.phase !== 'release') { alert("Release window is not open"); return; }
    const currentReleases = transfers.releases[teamId] || [];
    if (currentReleases.includes(pid)) { alert("Already released"); return; }
    if (currentReleases.length >= 3) { alert("Max 3 releases per team"); return; }
    if (isPlayerSafeForTeam(teamId, pid)) { alert("Safe players cannot be released!"); return; }

    // Remove from team assignment
    const newAssign = {...assignments};
    delete newAssign[pid];
    updAssign(newAssign);

    // Add to unsold pool
    const newUnsold = unsoldPool.includes(pid) ? unsoldPool : [...unsoldPool, pid];
    setUnsoldPool(newUnsold); storeSet("unsoldPool", newUnsold);

    // Record release
    const newReleases = {...transfers.releases, [teamId]: [...currentReleases, pid]};
    const updated = {...transfers, releases: newReleases};
    updTransfers(updated);
    alert(`✅ Player released to unsold pool`);
  });

  const pickPlayer = (pid) => withPassword(() => {
    if (transfers.phase !== 'pick') { alert("Pick phase not active"); return; }
    const pickingTeam = transfers.currentPickTeam;
    if (!pickingTeam) { alert("No team is currently picking"); return; }

    const releasedCount = (transfers.releases[pickingTeam]||[]).length;
    const pickedCount = transfers.picks.filter(pk=>pk.teamId===pickingTeam).length;
    if (pickedCount >= releasedCount) { alert("You can only pick as many as you released"); return; }
    if (!unsoldPool.includes(pid)) { alert("Player not in unsold pool"); return; }

    // Assign player to picking team
    const newAssign = {...assignments, [pid]: pickingTeam};
    updAssign(newAssign);

    // Remove from unsold pool
    const newUnsold = unsoldPool.filter(x => x !== pid);
    setUnsoldPool(newUnsold); storeSet("unsoldPool", newUnsold);

    // ✅ Record ownership transfer — points reset for new team from this moment
    const newLog = recordOwnership(pid, pickingTeam, ownershipLog);
    updOwnership(newLog);

    // Record pick and advance to next team
    const newPicks = [...transfers.picks, {teamId: pickingTeam, pid, timestamp: new Date().toISOString()}];
    const nextTeam = getNextPickTeam(pickingTeam, newPicks);
    const deadline = nextTeam ? new Date(Date.now() + 45*60*1000).toISOString() : null;
    const newPhase = nextTeam ? 'pick' : 'done';
    const updated = {...transfers, picks: newPicks, currentPickTeam: nextTeam, pickDeadline: deadline, phase: newPhase};
    if (newPhase === 'done') {
      updated.history = [...(transfers.history||[]), {week: transfers.weekNum, releases: transfers.releases, picks: newPicks, date: new Date().toISOString()}];
    }
    updTransfers(updated);
  });

  const skipCurrentTeam = () => withPassword(() => {
    const pickingTeam = transfers.currentPickTeam;
    const nextTeam = getNextPickTeam(pickingTeam, transfers.picks);
    const deadline = nextTeam ? new Date(Date.now() + 45*60*1000).toISOString() : null;
    const newPhase = nextTeam ? 'pick' : 'done';
    const updated = {...transfers, currentPickTeam: nextTeam, pickDeadline: deadline, phase: newPhase};
    updTransfers(updated);
    alert(nextTeam ? `Skipped. Now it's ${teams.find(t=>t.id===nextTeam)?.name}'s turn.` : "Transfer window complete!");
  });

  const getNextPickTeam = (currentTeamId, currentPicks) => {
    // Order by leaderboard. Each team picks once per released player
    const lb = [...teams].map(t=>({...t, total:getTeamTotal(t.id)})).sort((a,b)=>b.total-a.total);
    // Find teams that still have picks remaining
    for (const team of lb) {
      if (team.id === currentTeamId) continue; // skip current (they just picked)
      const released = (transfers.releases[team.id]||[]).length;
      const picked = currentPicks.filter(pk=>pk.teamId===team.id).length;
      if (released > 0 && picked < released) return team.id;
    }
    // Second round — check if current team has more picks
    const currentReleased = (transfers.releases[currentTeamId]||[]).length;
    const currentPicked = currentPicks.filter(pk=>pk.teamId===currentTeamId).length;
    if (currentPicked < currentReleased) return currentTeamId;
    return null; // all done
  };

  const resetTransferWindow = () => withPassword(() => {
    if (!confirm("Reset transfer window for new week?")) return;
    // Archive current window to history before clearing
    const hasActivity = (transfers.tradedPairs||[]).length > 0 || Object.values(transfers.releases||{}).some(a=>a.length>0);
    const newHistory = hasActivity
      ? [...(transfers.history||[]), { week: transfers.weekNum, releases: transfers.releases||{}, tradedPairs: transfers.tradedPairs||[], date: new Date().toISOString() }]
      : (transfers.history||[]);
    const updated = {
      weekNum: transfers.weekNum + 1,
      phase: 'closed', releases: {}, picks: [], tradedPairs: [], ineligible: [],
      currentPickTeam: null, pickDeadline: null,
      history: newHistory,
    };
    updTransfers(updated);
  });

  // ── SNATCH HELPERS ───────────────────────────────────────────────────────






  const uploadTeamLogo=(teamId, file)=>{
    const reader = new FileReader();
    reader.onload = (e) => {
      const newLogos = {...teamLogos, [teamId]: e.target.result};
      setTeamLogos(newLogos);
      storeSet('teamLogos', newLogos);
    };
    reader.readAsDataURL(file);
  };

  const showGuestMsg = () => {
    setGuestToast(true);
    setTimeout(() => setGuestToast(false), 2500);
  };

  const withPassword=(action)=>{
    if(isGuest){showGuestMsg();return;}
    if(unlocked){action();return;}
    setPendingAction({fn:action});setShowPwModal(true);
  };
  const handlePwSuccess=(newHash,isSetting,newRecoveryHash)=>{
    if(isSetting&&newHash){setPwHash(newHash);storeSet("pwhash",newHash);}
    if(newRecoveryHash){setRecoveryHash(newRecoveryHash);storeSet("recoveryHash",newRecoveryHash);}
    if(!isSetting&&!newRecoveryHash)setUnlocked(true);
    // After first time setting password, prompt to set recovery phrase
    if(isSetting&&newHash&&!recoveryHash){
      setShowPwModal(true); // keep modal open but switch to setRecovery mode - handled via re-render
    } else {
      setShowPwModal(false);
    }
    if(!isSetting&&!newRecoveryHash&&pendingAction){pendingAction.fn();setPendingAction(null);}
  };

  const createTeams=()=>{
    const t=Array.from({length:numTeams},(_,i)=>({id:`t${i}`,name:tNames[i]||`Team ${i+1}`,color:PALETTE[i]}));
    updTeams(t);storeSet("tnames",tNames);storeSet("numteams",numTeams);nav("draft");
  };

  const fetchPlayersFromCricbuzz=async(seriesId)=>{
    const useSeriesId = seriesId || 9241;
    setLoading("Fetching squads from Cricbuzz…");
    try {
      let allPlayers = [];
      let cricbuzzSuccess = false;

      try {
        setLoading("Fetching squad list from Cricbuzz…");
        const squadsRes = await fetch(`/api/cricbuzz?path=${encodeURIComponent("series/v1/" + useSeriesId + "/squads")}`);
        const squadsData = await squadsRes.json();

        const squadList = squadsData.squads || squadsData.squadItems ||
          squadsData.squadDetailsList || squadsData.teamSquadList || [];

        console.log("Squads response keys:", Object.keys(squadsData), "List length:", squadList.length);

        // Filter out header rows (isHeader:true), keep only real squads
        const realSquads = squadList.filter(s => !s.isHeader && s.squadId);
        if (realSquads.length === 0) throw new Error("No real squads found");

        for (let i = 0; i < realSquads.length; i++) {
          const squad = realSquads[i];
          const squadId = squad.squadId;
          // squadType holds the full team name e.g. "Chennai Super Kings"
          const teamName = squad.squadType || "";
          setLoading(`Cricbuzz: Fetching ${teamName}… (${i+1}/${realSquads.length})`);

          const teamRes = await fetch(`/api/cricbuzz?path=${encodeURIComponent("series/v1/" + useSeriesId + "/squads/" + squadId)}`);
          const teamData = await teamRes.json();

          // Players are under "player" key, with isHeader rows mixed in
          const playerList = (teamData.player || []).filter(p => !p.isHeader && p.id);

          // Map full team name to short code
          const TEAM_MAP = {
            "Chennai Super Kings": "CSK", "Mumbai Indians": "MI",
            "Royal Challengers Bengaluru": "RCB", "Royal Challengers Bangalore": "RCB",
            "Kolkata Knight Riders": "KKR", "Sunrisers Hyderabad": "SRH",
            "Rajasthan Royals": "RR", "Punjab Kings": "PBKS",
            "Delhi Capitals": "DC", "Gujarat Titans": "GT",
            "Lucknow Super Giants": "LSG",
          };
          const shortName = TEAM_MAP[teamName] ||
            IPL_TEAMS.find(t => teamName.toUpperCase().includes(t)) ||
            teamName.slice(0,3).toUpperCase();

          for (const p of playerList) {
            const name = p.name || "";
            if (!name) continue;
            const role = (p.role || "").toLowerCase();
            let mappedRole = "Batsman";
            if (role.includes("wk") || role.includes("wicket")) mappedRole = "Wicket-Keeper";
            else if (role.includes("bowling allrounder") || role.includes("batting allrounder")) mappedRole = "All-Rounder";
            else if (role.includes("bowler") || role.includes("fast") || role.includes("spin")) mappedRole = "Bowler";
            else if (role.includes("batsman") || role.includes("batter")) mappedRole = "Batsman";
            const pid = (p.id ? String(p.id) : name.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,""));
            // Skip duplicates
            if (!allPlayers.find(x => x.id === pid)) {
              allPlayers.push({
                id: pid, name, iplTeam: shortName, role: mappedRole, cricbuzzId: p.id,
              });
            }
          }
        }
        if (allPlayers.length > 30) cricbuzzSuccess = true;
      } catch(e) {
        console.warn("Cricbuzz squad fetch failed:", e.message);
        setLoading("Cricbuzz failed — using AI fallback…");
      }

      // Fallback to AI
      if (!cricbuzzSuccess || allPlayers.length < 30) {
        setLoading("Using AI for squad data…");
        allPlayers = [];
        for (let i = 0; i < IPL_TEAMS.length; i++) {
          const team = IPL_TEAMS[i];
          setLoading(`AI: Fetching ${team} squad… (${i+1}/10)`);
          try {
            const text = await callAI(
              `List exactly 20 players in the ${team} IPL 2026 squad. Return ONLY a JSON array, nothing else: [{"id":"name-slug","name":"Full Name","iplTeam":"${team}","role":"Batsman|Bowler|All-Rounder|Wicket-Keeper"}]`,
              "Return ONLY a valid JSON array. No markdown. No explanation. No extra text."
            );
            // Try to salvage even truncated JSON
            let squad = [];
            try { squad = parseJSON(text); }
            catch {
              const lastBrace = text.lastIndexOf("}");
              if (lastBrace > 0) {
                try { squad = JSON.parse(text.slice(0, lastBrace+1) + "]"); } catch {}
              }
            }
            allPlayers = [...allPlayers, ...squad];
          } catch(e) {
            console.warn(`Failed to fetch ${team}:`, e.message);
          }
        }
      }

      setPlayers(allPlayers);
      storeSet("players", allPlayers);
      alert(`✅ Loaded ${allPlayers.length} players from ${cricbuzzSuccess ? "Cricbuzz 🏏" : "AI (Cricbuzz fallback)"}`);
    } catch(e) {
      alert("Failed: " + e.message);
    }
    setLoading("");
  };

  // ── Toggle Ruled Out ──────────────────────────────────────────────────────
  const toggleRuledOut = async (pid) => {
    const newRuledOut = ruledOut.includes(pid) 
      ? ruledOut.filter(id => id !== pid) 
      : [...ruledOut, pid];
    setRuledOut(newRuledOut);
    storeSet("ruledOut", newRuledOut);
    pushNotif("system", ruledOut.includes(pid) ? "✅ Player reinstated" : "🚫 Player ruled out for season", "🚫");
  };

  const assignPlayer=(pid,tid)=>withPassword(()=>{
    const a={...assignments};
    if(!tid) { delete a[pid]; }
    else {
      a[pid]=tid;
      // Record ownership — always use season start so ALL historical match points count
      const seasonStart = "2025-01-01T00:00:00.000Z";
      const existingPeriods = ownershipLog[pid] || [];
      const alreadyOwned = existingPeriods.some(o => o.teamId === tid && !o.to);
      if (alreadyOwned) {
        // Fix existing period — ensure from is season start (in case it was set to today)
        const updatedPeriods = existingPeriods.map(o =>
          o.teamId === tid && !o.to ? { ...o, from: seasonStart } : o
        );
        updOwnership({ ...ownershipLog, [pid]: updatedPeriods });
      } else {
        // Close any open period for another team, open new from season start
        const updatedPeriods = existingPeriods.map(o => !o.to ? {...o, to: new Date().toISOString()} : o);
        updatedPeriods.push({ teamId: tid, from: seasonStart, to: null });
        updOwnership({ ...ownershipLog, [pid]: updatedPeriods });
      }
    }
    updAssign(a);
  });
  const removePlayer=(pid)=>withPassword(()=>{const a={...assignments};delete a[pid];updAssign(a);});
  const deletePlayer=(pid)=>withPassword(()=>{
    if(!confirm("Delete this player completely?")) return;
    const a={...assignments};delete a[pid];updAssign(a);
    const up=players.filter(p=>p.id!==pid);setPlayers(up);storeSet("players",up);
  });

  const filteredPlayers=players.filter(p=>{
    const s=search.toLowerCase();
    const matchesSearch=(p.name.toLowerCase().includes(s)||(p.iplTeam||"").toLowerCase().includes(s));
    const matchesRole=(roleFilter==="All"||p.role===roleFilter);
    const matchesTeam=!teamFilter||(teamFilter==="unassigned"?!assignments[p.id]:assignments[p.id]===teamFilter);
    return matchesSearch&&matchesRole&&matchesTeam;
  }).sort((a,b)=>{
    if(sortOrder==="az") return a.name.localeCompare(b.name);
    if(sortOrder==="za") return b.name.localeCompare(a.name);
    return 0;
  });

  // ── CRICBUZZ fetch ────────────────────────────────────────────────────────
  const generateAiMatches = async () => {
    if (!aiMatchModal) return;
    const { tournamentId, tournamentName } = aiMatchModal;
    if (!aiMatchText.trim()) { setAiMatchError("Please paste the schedule text first."); return; }
    setAiMatchGenerating(true);
    setAiMatchError("");
    try {
      const prompt = `Extract ALL cricket matches from this Cricbuzz schedule text. Return ONLY a JSON array, nothing else.

Each match object must have exactly these fields:
- matchNum: integer match number
- team1: short code like SRH, RCB, MI, CSK, KKR, RR, GT, PBKS, DC, LSG
- team2: short code
- date: YYYY-MM-DD format
- venue: stadium name and city
- status: "completed" if scores/result shown, "upcoming" if not
- result: result string if available, else empty string

Team name mappings:
Sunrisers Hyderabad=SRH, Royal Challengers Bengaluru=RCB, Royal Challengers Bangalore=RCB,
Mumbai Indians=MI, Kolkata Knight Riders=KKR, Chennai Super Kings=CSK,
Rajasthan Royals=RR, Gujarat Titans=GT, Punjab Kings=PBKS,
Delhi Capitals=DC, Lucknow Super Giants=LSG

IMPORTANT: Extract ONLY what is in the text. Do not invent matches.

Schedule text:
${aiMatchText.slice(0, 3000)}`;

      const text = await callAI(prompt, "You extract cricket match data from text. Return ONLY a valid JSON array. No markdown fences. No explanation. No extra text.");
      const clean = text.replace(/\`\`\`json|\`\`\`/g, "").trim();
      const jsonStart = clean.indexOf("[");
      const jsonEnd = clean.lastIndexOf("]");
      if (jsonStart === -1 || jsonEnd === -1) {
        setAiMatchError("Could not parse schedule. Try pasting a smaller portion of the text.");
        setAiMatchGenerating(false); return;
      }
      const parsed = JSON.parse(clean.slice(jsonStart, jsonEnd + 1));
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setAiMatchError("No matches found in the pasted text.");
        setAiMatchGenerating(false); return;
      }

      const base = aiMatchReplace ? matches.filter(m => m.tournamentId !== tournamentId) : [...matches];
      const existing = aiMatchReplace ? [] : matches.filter(m => m.tournamentId === tournamentId);
      let nextNum = Math.max(...(existing.map(m => m.matchNum || 0)), 0) + 1;
      let added = 0, skipped = 0;

      parsed.forEach(m => {
        if (!m.team1 || !m.team2 || !m.date) return;
        if (!aiMatchReplace) {
          const isDup = existing.some(ex =>
            ex.date === m.date &&
            ((ex.team1 === m.team1 && ex.team2 === m.team2) ||
             (ex.team1 === m.team2 && ex.team2 === m.team1))
          );
          if (isDup) { skipped++; return; }
        }
        base.push({
          id: "ai_" + tournamentId + "_" + (m.matchNum || nextNum) + "_" + Date.now() + "_" + Math.random().toString(36).slice(2),
          tournamentId,
          matchNum: m.matchNum || nextNum,
          team1: m.team1, team2: m.team2,
          date: m.date, time: "7:30 PM",
          venue: m.venue || "",
          status: m.status || "upcoming",
          result: m.result || "",
          aiGenerated: true,
        });
        nextNum++; added++;
      });

      updMatches(base);
      setAiMatchSuccess("Added " + added + " matches" + (skipped > 0 ? " (" + skipped + " skipped — already exist)" : "") + ". Sync stats for completed matches via scorecard paste.");
    } catch(e) {
      setAiMatchError("Error: " + e.message);
    }
    setAiMatchGenerating(false);
  };

  
    const fetchMatchesForTournament = async (tournamentId, tournamentName) => {
    setLoading("Fetching from Cricbuzz for " + tournamentName + "…");
    try {
      const extractForTournament = (data) => {
        const found = [];
        if (!data || !data.typeMatches) return found;
        for (const type of data.typeMatches) {
          for (const series of (type.seriesMatches || [])) {
            const sm = series.seriesAdWrapper || series;
            if (sm.seriesName && sm.seriesName.toLowerCase().includes(tournamentName.toLowerCase())) {
              for (const match of (sm.matches || [])) {
                found.push({info: match.matchInfo, score: match.matchScore});
              }
            }
          }
        }
        return found;
      };

      const [recentData, upcomingData, liveData] = await Promise.all([
        fetch("/api/cricbuzz?path="+encodeURIComponent("matches/v1/recent")).then(r=>r.json()).catch(()=>({})),
        fetch("/api/cricbuzz?path="+encodeURIComponent("matches/v1/upcoming")).then(r=>r.json()).catch(()=>({})),
        fetch("/api/cricbuzz?path="+encodeURIComponent("matches/v1/live")).then(r=>r.json()).catch(()=>({})),
      ]);

      // Merge all three sources — "Complete" state always wins over "In Progress"
      const matchMap = new Map();
      for (const m of [...extractIPL(liveData), ...extractIPL(recentData), ...extractIPL(upcomingData)]) {
        const id = m.info?.matchId;
        if (!id) continue;
        const existing = matchMap.get(id);
        if (!existing || m.info?.state === "Complete") {
          matchMap.set(id, m);
        }
      }
      const fetched = Array.from(matchMap.values());

      if (fetched.length === 0) {
        alert("No IPL matches found from Cricbuzz right now.");
        setLoading(""); return;
      }

      const fetchedMap = {};
      fetched.forEach(m => { if (m.info?.matchId) fetchedMap[m.info.matchId] = m; });

      const updated = matches.map(m => {
        if (m.cricbuzzId && fetchedMap[m.cricbuzzId]) {
          const f = fetchedMap[m.cricbuzzId].info;
          return {
            ...m,
            status: m.status === "completed" ? "completed" : f.state === "Complete" ? "completed" : f.state === "In Progress" ? "live" : "upcoming",
            result: m.result || f.status || null,
          };
        }
        return m;
      });

      const existingCricbuzzIds = new Set(matches.map(m => m.cricbuzzId).filter(Boolean));
      let nextNum = matches.length + 1;
      fetched.forEach(({info: m}) => {
        if (!m || existingCricbuzzIds.has(m.matchId)) return;
        updated.push({
          id: "m"+m.matchId,
          cricbuzzId: m.matchId,
          tournamentId: tournamentId,
          matchNum: nextNum++,
          date: m.startDate ? new Date(parseInt(m.startDate)).toISOString().split("T")[0] : "TBD",
          time: m.startDate ? new Date(parseInt(m.startDate)).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Kolkata"}) : "",
          team1: m.team1?.teamSName || m.team1?.teamName || "TBA",
          team2: m.team2?.teamSName || m.team2?.teamName || "TBA",
          venue: m.venueInfo?.ground ? m.venueInfo.ground+(m.venueInfo.city?", "+m.venueInfo.city:"") : (m.venueInfo?.city || "TBD"),
          status: m.state === "Complete" ? "completed" : m.state === "In Progress" ? "live" : "upcoming",
          result: m.status || null,
        });
      });

      updMatches(updated);
      const tMatches = updated.filter(m => m.tournamentId === tournamentId);
      const live = tMatches.filter(m => m.status === "live").length;
      const upcoming = tMatches.filter(m => m.status === "upcoming").length;
      const completed = tMatches.filter(m => m.status === "completed").length;
      alert(tournamentName + ": " + completed + " completed, " + live + " live, " + upcoming + " upcoming.");
    } catch(e){
      alert("Error: "+e.message);
    }
    setLoading("");
  };

  const syncPoints=async(match)=>{
    setLoading(`Syncing Match ${match.matchNum}……`);
    try {
      let stats = [];
      if (match.cricbuzzId) {
        // Use real Cricbuzz scorecard
        try {
          const scorecard = await fetchLiveScorecard(match.cricbuzzId);
          const playerIndex = players.map(p=>({name:p.name, id:p.id}));
          stats = parseScorecardToStats(scorecard, playerIndex);
        } catch(e) {
          console.warn("Cricbuzz scorecard failed, falling back to AI:", e.message);
        }
      }
      // Fallback to AI if Cricbuzz fails or no cricbuzzId
      if (stats.length === 0) {
        setLoading(`Syncing Match ${match.matchNum} via AI…`);
        const playerIndex=players.map(p=>`${p.name}::${p.id}`).join("|");
        const text=await callAI(
          `Scorecard for IPL 2026 Match ${match.matchNum}: ${match.team1} vs ${match.team2} on ${match.date} at ${match.venue}. Match names to IDs from: ${playerIndex}. Return ONLY a JSON array: [{"playerId":"id","name":"name","runs":0,"fours":0,"sixes":0,"wickets":0,"economy":null,"overs":0,"catches":0,"stumpings":0,"runouts":0,"longestSix":false}].`,
          "Cricket expert. Return ONLY a raw JSON array."
        );
        stats = parseJSON(text);
      }
      const newPts={...points};
      for(const s of stats){
        if(!s.playerId)continue;
        const pts=calcPoints(s, pointsConfig);
        if(!newPts[s.playerId])newPts[s.playerId]={};
        newPts[s.playerId][match.id]={base:pts,stats:s};
      }
      updPoints(newPts);
      alert(`✅ Points synced for Match ${match.matchNum}!`);
    } catch(e){alert("Sync failed: "+e.message);}
    setLoading("");
  };

  const setCap=(matchId,teamId,type,pid)=>{
    const key=`${matchId}_${teamId}`;
    updCaptains({...captains,[key]:{...(captains[key]||{}),[type]:pid}});
  };

  // Fix active snatch pointsAtSnatch to include C/VC multipliers — only pre-snatch matches
  useEffect(()=>{
    if(!snatch.active) return;
    const {pid, fromTeamId, startDate} = snatch.active;
    const snatchDateStr = startDate?.split('T')[0] || '9999-01-01';
    const correctPts = Object.entries(points[pid]||{}).reduce((s,[mid,d])=>{
      const m = matches.find(x=>x.id===mid);
      if(!m || m.date >= snatchDateStr) return s; // skip post-snatch matches
      const cap = captains[mid+"_"+fromTeamId]||{};
      let pts = d.base||0;
      if(cap.captain===pid) pts*=2; else if(cap.vc===pid) pts*=1.5;
      return s + Math.round(pts);
    },0);
    if(correctPts !== snatch.active.pointsAtSnatch) {
      const updated = {...snatch, active:{...snatch.active, pointsAtSnatch: correctPts}};
      setSnatch(updated);
      storeSet("snatch", updated);
    }
  },[snatch.active?.pid, snatch.active?.pointsAtSnatch, points, captains, matches]);

  const getTeamTotal=(teamId)=>{
    let total=0;
    const allPids = new Set([
      ...players.filter(p=>assignments[p.id]===teamId).map(p=>p.id),
      ...Object.entries(ownershipLog).filter(([pid,periods])=>periods.some(o=>o.teamId===teamId)).map(([pid])=>pid)
    ]);

    // Add snatched-in player (currently on loan to this team)
    if (snatch.active?.byTeamId===teamId) allPids.add(snatch.active.pid);
    // Add snatched-away player to original team so freeze logic runs
    if (snatch.active?.fromTeamId===teamId) allPids.add(snatch.active.pid);

    for(const pid of allPids){
      const periods = (ownershipLog[pid]||[]).filter(o=>o.teamId===teamId);

      // If this player is currently snatched AWAY from this team — freeze at pointsAtSnatch
      const isSnatchedAway = snatch.active?.pid===pid && 
        (snatch.active?.fromTeamId===teamId || 
         (assignments[pid]===teamId && snatch.active?.byTeamId!==teamId));
      if(isSnatchedAway) {
        total += snatch.active.pointsAtSnatch || 0;
        continue;
      }

      // If this player is currently snatched IN to this team — only count post-snatch points with C/VC
      if(snatch.active?.pid===pid && snatch.active?.byTeamId===teamId) {
        const snatchDate = snatch.active.startDate.split('T')[0];
        for(const[mid,d] of Object.entries(points[pid]||{})){
          const m = matches.find(x=>x.id===mid);
          if(!m || m.date < snatchDate) continue;
          const cap=captains[mid+"_"+teamId]||{};
          let pts=d.base;
          if(cap.captain===pid) pts*=2; else if(cap.vc===pid) pts*=1.5;
          total+=Math.round(pts);
        }
        continue;
      }

      // Historical snatch: player was snatched away, now returned — freeze contributed pts
      const histSnatchedAway = (snatch.history||[]).find(h=>h.pid===pid && h.fromTeamId===teamId);
      if(histSnatchedAway) {
        // Count all points EXCEPT those during the snatch period
        for(const[mid,d] of Object.entries(points[pid]||{})){
          const m = matches.find(x=>x.id===mid);
          if(!m) continue;
          const matchDate = m.date;
          const snatchStart = histSnatchedAway.startDate.split('T')[0];
          const snatchEnd = histSnatchedAway.returnDate ? histSnatchedAway.returnDate.split('T')[0] : '2099-01-01';
          if(matchDate >= snatchStart && matchDate <= snatchEnd) continue; // same day as return = still snatched
          const cap=captains[mid+"_"+teamId]||{};
          let pts=d.base;
          if(cap.captain===pid)pts*=2;else if(cap.vc===pid)pts*=1.5;
          total+=Math.round(pts);
        }
        continue;
      }

      // Historical snatch: player was snatched IN, now returned — freeze snatch week pts
      const histSnatchedIn = (snatch.history||[]).find(h=>h.pid===pid && h.byTeamId===teamId);
      if(histSnatchedIn) {
        total += (histSnatchedIn.snatchWeekPts||0);
        continue;
      }

      // Normal ownership
      for(const[mid,d] of Object.entries(points[pid]||{})){
        const m = matches.find(x=>x.id===mid);
        if(!m) continue;
        // If no ownership log periods, player must be currently assigned to this team
        if(periods.length === 0) {
          if(assignments[pid] !== teamId) continue; // not their player — skip
          // Currently assigned, count all points
          const cap=captains[mid+"_"+teamId]||{};
          let pts=d.base;
          if(cap.captain===pid)pts*=2;else if(cap.vc===pid)pts*=1.5;
          total+=Math.round(pts);
          continue;
        }
        const owned = periods.some(o=>{
          const fromDate = (o.from||"").split("T")[0];
          const toDate   = o.to ? o.to.split("T")[0] : "2099-01-01";
          const mDate    = m.date;
          return mDate >= fromDate && mDate <= toDate;
        });
        if(!owned) continue;
        const cap=captains[mid+"_"+teamId]||{};
        let pts=d.base;
        if(cap.captain===pid)pts*=2;else if(cap.vc===pid)pts*=1.5;
        total+=Math.round(pts);
      }
    }
    return total;
  };

  const getPlayerBreakdown=(teamId)=>{
    // Helper: get points for player during team's ownership period(s)
    const getPtsForTeam = (pid, tid) => {
      const periods = (ownershipLog[pid]||[]).filter(o=>o.teamId===tid);
      let tot = 0;

      // Active snatch: player currently snatched away from this team — freeze at pointsAtSnatch
      if(snatch.active?.pid===pid && snatch.active?.fromTeamId===tid) {
        return snatch.active.pointsAtSnatch || 0;
      }
      // Active snatch: player currently on loan TO this team — only post-snatch points
      if(snatch.active?.pid===pid && snatch.active?.byTeamId===tid) {
        const snatchDate = snatch.active.startDate.split('T')[0];
        for(const[mid,d] of Object.entries(points[pid]||{})){
          const m = matches.find(x=>x.id===mid);
          if(!m || m.date < snatchDate) continue;
          const cap=captains[`${mid}_${tid}`]||{};
          let pts=d.base;
          if(cap.captain===pid)pts*=2;else if(cap.vc===pid)pts*=1.5;
          tot+=Math.round(pts);
        }
        return tot;
      }

      // Historical snatch: player was snatched away from this team, now returned
      const histSnatchedAway = (snatch.history||[]).find(h=>h.pid===pid && h.fromTeamId===tid);
      // Historical snatch: player was snatched IN to this team, now returned — use frozen pts
      const histSnatchedIn = (snatch.history||[]).find(h=>h.pid===pid && h.byTeamId===tid);
      if(histSnatchedIn) return histSnatchedIn.snatchWeekPts || 0;

      for(const[mid,d] of Object.entries(points[pid]||{})){
        const m = matches.find(x=>x.id===mid);
        if(!m) continue;
        // Skip matches during snatch period for original team
        if(histSnatchedAway) {
          const snatchStart = histSnatchedAway.startDate.split('T')[0];
          const snatchEnd = histSnatchedAway.returnDate ? histSnatchedAway.returnDate.split('T')[0] : '2099-01-01';
          if(m.date >= snatchStart && m.date <= snatchEnd) continue; // include same day as return only after next day
        }
        // Check if match falls within any ownership period for this team
        const owned = periods.length === 0
          ? true // no log = original owner, count all
          : periods.some(o => {
              const fromDate = (o.from||"").split("T")[0];
              const toDate   = o.to ? o.to.split("T")[0] : "2099-01-01";
              return m.date >= fromDate && m.date <= toDate;
            });
        if(!owned) continue;
        const cap=captains[`${mid}_${tid}`]||{};
        let pts=d.base;
        if(cap.captain===pid)pts*=2;else if(cap.vc===pid)pts*=1.5;
        tot+=Math.round(pts);
      }
      return tot;
    };

    // Collect ALL traded-out/in pids across ALL history + current window
    const allTradedOutPids = new Set(); // all players ever traded OUT of this team
    const allTradedInPids  = new Set(); // all players ever traded INTO this team
    const tradedOutMeta = {}; // pid -> {tradedFor name}
    const tradedInMeta  = {}; // pid -> {tradedFor name}

    for (const w of [...(transfers.history||[]), { tradedPairs: transfers.tradedPairs||[], releases: transfers.releases||{} }]) {
      for (const pr of (w.tradedPairs||[]).filter(pr=>pr.teamId===teamId)) {
        allTradedOutPids.add(pr.releasedPid);
        allTradedInPids.add(pr.pickedPid);
        const incoming = players.find(x=>x.id===pr.pickedPid);
        const outgoing = players.find(x=>x.id===pr.releasedPid);
        tradedOutMeta[pr.releasedPid] = incoming?.name || "?";
        tradedInMeta[pr.pickedPid]    = outgoing?.name || "?";
      }
    }

    // Players in BOTH sets = traded out then returned (boomerang)
    // BUT only count as "returned" if they were originally on this team BEFORE any trades
    // i.e. they appear in tradedOut first (week-chronologically) then tradedIn
    // If they were tradedIn first then tradedOut, they're just gone — show as traded-out
    const allWeeks = [...(transfers.history||[]), { tradedPairs: transfers.tradedPairs||[], releases: transfers.releases||{} }];
    const firstAppearance = {}; // pid -> 'in' or 'out' (whichever came first for this team)
    for (const w of allWeeks) {
      for (const pr of (w.tradedPairs||[]).filter(pr=>pr.teamId===teamId)) {
        if (!firstAppearance[pr.releasedPid]) firstAppearance[pr.releasedPid] = 'out';
        if (!firstAppearance[pr.pickedPid])   firstAppearance[pr.pickedPid]   = 'in';
      }
    }
    // "returned" = originally traded OUT first, then came back IN
    const returnedPids    = new Set([...allTradedInPids].filter(id =>
      allTradedOutPids.has(id) &&
      assignments[id]===teamId &&
      firstAppearance[id] === 'out' // was released first, then came back
    ));
    // traded-out-then-back-in but originally picked = just gone (not returned)
    const pickThenReleasedPids = new Set([...allTradedInPids].filter(id =>
      allTradedOutPids.has(id) && firstAppearance[id] === 'in'
    ));
    // Net traded-in: came in and stayed (not released later)
    const netTradedInPids  = new Set([...allTradedInPids].filter(id => !allTradedOutPids.has(id)));
    // Net traded-out: originally released and never came back, OR picked then released
    const netTradedOutPids = new Set([
      ...[...allTradedOutPids].filter(id => !returnedPids.has(id) && !pickThenReleasedPids.has(id)),
      ...pickThenReleasedPids
    ]);

    // Source of truth for who is physically in the squad right now
    const inSquadNow = new Set(players.filter(p=>assignments[p.id]===teamId).map(p=>p.id));

    // Active players — physically in squad now, not a trade-history special case
    // Note: we intentionally DON'T exclude netTradedOutPids here —
    // if a traded-out player was manually re-added, inSquadNow catches them as active
    // and currentTradedAway's cross-check (inSquadNow.has → null) prevents double-display
    const active = players.filter(p=>
      inSquadNow.has(p.id) &&
      !netTradedInPids.has(p.id) &&
      !returnedPids.has(p.id) &&
      !(snatch.active?.pid === p.id && snatch.active?.byTeamId === teamId)
    ).map(p=>{
      const tot = getPtsForTeam(p.id, teamId);
      const isSnatched = snatch.active?.pid===p.id && snatch.active?.fromTeamId===teamId;
      return{...p,total:tot,status:isSnatched?"snatched":"active"};
    });

    // Returned players (↩️ yellow — traded out then came back, and currently in squad)
    const returnedPlayers = [...returnedPids].map(pid=>{
      const p = players.find(x=>x.id===pid);
      if(!p) return null;
      if(!inSquadNow.has(pid)) return null;
      const tot = getPtsForTeam(pid, teamId);
      return {...p, total:tot, status:"returned", tradedFor: tradedInMeta[pid]||"?"};
    }).filter(Boolean);

    // Traded-in players (green ⬆️ — in trade history AND currently in squad)
    const currentTradedIn = [...netTradedInPids].map(pid=>{
      const p = players.find(x=>x.id===pid);
      if(!p) return null;
      if(!inSquadNow.has(pid)) return null;
      const tot = getPtsForTeam(pid, teamId);
      return {...p, total:tot, status:"traded-in", tradedFor: tradedInMeta[pid]||"?"};
    }).filter(Boolean);

    // Traded-out players (strikethrough ⬇️ — in trade history AND NOT currently in squad)
    const currentTradedAway = [...netTradedOutPids].map(pid=>{
      const p = players.find(x=>x.id===pid);
      if(!p) return null;
      if(inSquadNow.has(pid)) return null; // manually re-added → show as active instead
      const tot = getPtsForTeam(pid, teamId);
      return {...p, total:tot, status:"traded-out", tradedFor: tradedOutMeta[pid]||"?"};
    }).filter(Boolean);

    const historical = [];

    // Snatched player this team borrowed
    const snatchedIn = snatch.active?.byTeamId===teamId ? (() => {
      const p = players.find(x=>x.id===snatch.active.pid);
      if(!p) return null;
      const snatchDate = snatch.active.startDate.split('T')[0];
      let tot=0;
      for(const[mid,d]of Object.entries(points[p.id]||{})){
        const m = matches.find(x=>x.id===mid);
        if(!m || m.date < snatchDate) continue;
        const cap=captains[`${mid}_${teamId}`]||{};
        let pts=d.base;
        if(cap.captain===p.id)pts*=2;else if(cap.vc===p.id)pts*=1.5;
        tot+=Math.round(pts);
      }
      return p?{...p,total:tot,status:"snatched-in",frozenAt:tot}:null;
    })() : null;

    // Players currently snatched AWAY from this team (show struck-through, frozen pts)
    const snatchedOut = (snatch.active?.fromTeamId===teamId) ? (() => {
      const p = players.find(x=>x.id===snatch.active.pid);
      if(!p) return null;
      return {...p, total: snatch.active.pointsAtSnatch, status:"snatched-out", frozenAt: snatch.active.pointsAtSnatch};
    })() : null;

    // Historical: players returned after snatch
    const snatchHistoryForTeam = (snatch.history||[]).map(h => {
      const p = players.find(x=>x.id===h.pid);
      if(!p) return null;
      // Snatching team — show their loan pts
      if(h.byTeamId===teamId) return {...p, total: h.snatchWeekPts||0, status:"snatch-returned-in", frozenAt: h.snatchWeekPts||0};
      // Original team — show player with their total (all pts minus snatch period, handled by getPtsForTeam via ownershipLog)
      if(h.fromTeamId===teamId && assignments[p.id]===teamId) return null; // already in active list
      return null;
    }).filter(Boolean);

    const allActive = [...active, ...(snatchedOut?[snatchedOut]:[])];
    return [...allActive, ...returnedPlayers, ...currentTradedIn, ...currentTradedAway, ...historical, ...(snatchedIn?[snatchedIn]:[]), ...snatchHistoryForTeam].sort((a,b)=>b.total-a.total);
  };

  // Leaderboard — total derived from getPlayerBreakdown so it always matches individual player sum
  const leaderboard = [...teams].map(t => {
    const breakdown = getPlayerBreakdown(t.id);
    const total = breakdown.reduce((s, p) => s + (p.total || 0), 0);
    return { ...t, total };
  }).sort((a, b) => b.total - a.total);

  const shareLeaderboard = async () => {
    const element = document.getElementById('leaderboard-capture');
    if (!element) {
      alert('❌ Leaderboard not found');
      return;
    }
    
    // Load html2canvas dynamically if not already loaded
    if (!window.html2canvas) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      document.head.appendChild(script);
      
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load html2canvas'));
        setTimeout(() => reject(new Error('Timeout loading html2canvas')), 5000);
      });
    }
    
    try {
      const canvas = await window.html2canvas(element, {
        backgroundColor: '#0F0800',
        scale: 2,
        logging: false,
        useCORS: true,
      });
      
      canvas.toBlob(async (blob) => {
        if (!blob) {
          alert('❌ Failed to create image');
          return;
        }
        
        const file = new File([blob], 'leaderboard.png', { type: 'image/png' });
        
        // Try Web Share API
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: '🏏 Teekha Bouncer Leaderboard',
              text: `${pitch?.name || 'League'} Leaderboard\n\nteekha-bouncer.vercel.app`,
            });
            return;
          } catch (err) {
            if (err.name !== 'AbortError') {
              console.error('Share failed:', err);
            }
          }
        }
        
        // Fallback: Download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'teekha-bouncer-leaderboard.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert('📸 Leaderboard downloaded! Share it on WhatsApp.');
      }, 'image/png');
      
    } catch (err) {
      console.error('Capture error:', err);
      alert('❌ Screenshot failed: ' + err.message);
    }
  };

  const fetchLiveScores = async () => {
    try {
      // Use recent endpoint which has live matches
      const res = await fetch("/api/cricbuzz?path=" + encodeURIComponent("matches/v1/recent"));
      const data = await res.json();
      const scores = {};
      if (data && data.typeMatches) {
        for (const type of data.typeMatches) {
          for (const series of (type.seriesMatches || [])) {
            const sm = series.seriesAdWrapper || series;
            if (sm.seriesName && sm.seriesName.includes("Indian Premier League")) {
              for (const m of (sm.matches || [])) {
                const info = m.matchInfo;
                const score = m.matchScore;
                if (info && info.matchId && info.state === "In Progress") {
                  const t1 = score?.team1Score?.inngs1;
                  const t2 = score?.team2Score?.inngs1;
                  scores["m"+info.matchId] = {
                    team1Score: t1 ? t1.runs+"/"+t1.wickets+" ("+parseFloat(t1.overs).toFixed(1)+" ov)" : null,
                    team2Score: t2 ? t2.runs+"/"+t2.wickets+" ("+parseFloat(t2.overs).toFixed(1)+" ov)" : null,
                    status: info.status || "",
                    state: info.state,
                  };
                }
              }
            }
          }
        }
      }
      setLiveScores(scores);
    } catch(e) { console.warn("Live scores fetch failed:", e.message); }
  };

  // Poll live scores every 60s when on matches page
  useEffect(() => {
    if (page === "matches") {
      fetchLiveScores();
      pollRef.current = setInterval(fetchLiveScores, 60000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [page]);

  // Auto-update match statuses + auto-lock C/VC when match goes live
  // Smart polling: +1+2+3 mins then every 30 mins for status
  // +0+1 mins then every 10 mins for C/VC lock
  useEffect(() => {
    if (!appReady || matches.length === 0) return;

    const checkAndUpdate = async (matchesToCheck) => {
      try {
        const [liveRes, resultsRes] = await Promise.all([
          fetch("/api/cricketdata?path=currentMatches").then(r=>r.json()).catch(()=>({})),
          fetch("/api/cricketdata?path=cricket-results").then(r=>r.json()).catch(()=>({})),
        ]);
        const liveList = Array.isArray(liveRes?.response) ? liveRes.response : [];
        const liveIds = new Set(liveList.map(m => String(m?.matchId || m?.id)).filter(Boolean));
        const resultsList = Array.isArray(resultsRes?.response) ? resultsRes.response : [];
        const completedIds = new Set(resultsList.map(m => String(m?.matchId || m?.id)).filter(Boolean));

        let matchesChanged = false;
        let captainsChanged = false;
        const updatedMatches = matches.map(m => {
          if (!m.cricbuzzId) return m;
          const id = String(m.cricbuzzId);
          if (m.status === "completed") return m;
          if (completedIds.has(id)) { matchesChanged = true; return { ...m, status: "completed" }; }
          if (liveIds.has(id)) { matchesChanged = true; return { ...m, status: "live" }; }
          return m;
        });
        if (matchesChanged) updMatches(updatedMatches);

        // Auto-lock C/VC for matches that just went live
        const newCaptains = { ...captains };
        matches.forEach(m => {
          if (!m.cricbuzzId) return;
          const id = String(m.cricbuzzId);
          const isLive = liveIds.has(id) || completedIds.has(id);
          const alreadyLocked = !!captains[m.id + "_locked"];
          if (isLive && !alreadyLocked) {
            newCaptains[m.id + "_locked"] = true;
            captainsChanged = true;
            pushNotif('match', `🔒 C/VC locked for ${m.team1} vs ${m.team2} — match is live!`, '🔒');
          }
        });
        if (captainsChanged) updCaptains(newCaptains);

      } catch(e) { console.warn("Auto status/lock check failed:", e.message); }
    };

    const timeouts = [];
    const scheduled = new Set();

    const scheduleForMatch = (m, matchMins) => {
      const IST_OFFSET = 5.5 * 60 * 60 * 1000;
      const nowIST = new Date(Date.now() + IST_OFFSET);
      const nowMins = nowIST.getUTCHours() * 60 + nowIST.getUTCMinutes();

      // C/VC lock checks: match time +0 and +1 min, then every 10 mins up to 5 hours
      [0, 1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 120, 150, 180, 210, 240, 270, 300].forEach(offset => {
        const targetMins = matchMins + offset;
        const delayMs = (targetMins - nowMins) * 60 * 1000;
        if (delayMs >= 0 && delayMs < 5.5 * 60 * 60 * 1000) {
          timeouts.push(setTimeout(() => checkAndUpdate([m]), delayMs));
        }
      });

      // Status checks: +1+2+3 then every 30 mins
      [1, 2, 3, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300].forEach(offset => {
        const targetMins = matchMins + offset;
        const delayMs = (targetMins - nowMins) * 60 * 1000;
        if (delayMs > 0 && delayMs < 5.5 * 60 * 60 * 1000) {
          timeouts.push(setTimeout(() => checkAndUpdate([m]), delayMs));
        }
      });
    };

    const masterCheck = () => {
      const IST_OFFSET = 5.5 * 60 * 60 * 1000;
      const nowIST = new Date(Date.now() + IST_OFFSET);
      const todayStr = nowIST.toISOString().split("T")[0];
      const nowMins = nowIST.getUTCHours() * 60 + nowIST.getUTCMinutes();

      matches.forEach(m => {
        if (m.date !== todayStr || m.status === "completed") return;
        if (scheduled.has(m.id)) return;
        const timeStr = m.time || "20:00";
        const [hh, mm] = timeStr.split(":").map(Number);
        const matchMins = hh * 60 + mm;
        if (nowMins >= matchMins - 10 && nowMins <= matchMins + 300) {
          scheduled.add(m.id);
          scheduleForMatch(m, matchMins);
        }
      });
    };

    masterCheck();
    const masterInterval = setInterval(masterCheck, 60 * 1000);

    return () => {
      clearInterval(masterInterval);
      timeouts.forEach(clearTimeout);
    };
  }, [appReady, matches.length]);

  // Update snatch window status every minute
  useEffect(() => {
    const t = setInterval(() => setSnatchWindowStatus(getSnatchWindowStatus()), 60000);
    return () => clearInterval(t);
  }, []);

  // Auto-return is handled by Supabase Edge Function (snatch-auto-return)
  // which runs every minute and checks the configured return time from pitchConfig
  // App.jsx only handles the pointsAtSnatch correction useEffect below


  const savePointsConfig = async (cfg) => {
    setPointsConfig(cfg);
    await storeSet("pointsConfig", cfg);
  };

  const updRuleProposal = async (val) => {
    setRuleProposal(val);
    await storeSet("ruleProposal", val);
  };

  // Teams with claimed IDs = eligible voters
  // Tournament is "started" if any matches have been played
  const tournamentStarted = matches.some(m => m.status === "completed") && teams.length > 0;
  const eligibleVoters = teams.filter(t => teamIdentity[t.id]?.claimedBy);

  const proposeRuleChange = async (changes) => {
    const proposal = {
      id: Date.now().toString(),
      proposedBy: myTeam?.id || 'admin',
      proposedAt: new Date().toISOString(),
      changes, // { transferDay, transferTime, snatchStart, snatchEnd, snatchReturn }
      votes: {}, // { teamId: 'approved' | 'rejected' }
      status: 'pending'
    };
    await updRuleProposal(proposal);
  };

  const voteOnProposal = async (approve) => {
    if (!myTeam || !ruleProposal) return;
    const ti = teamIdentity[myTeam.id];
    if (!ti?.pinHash) { setVotePinErr("No PIN set for your team"); return; }
    const h = await hashPw(votePin);
    if (h !== ti.pinHash) { setVotePinErr("Wrong PIN"); setVotePin(''); return; }

    const newVotes = { ...ruleProposal.votes, [myTeam.id]: approve ? 'approved' : 'rejected' };
    const allApproved = eligibleVoters.every(t => newVotes[t.id] === 'approved');
    const anyRejected = Object.values(newVotes).includes('rejected');

    let newProposal = { ...ruleProposal, votes: newVotes };

    if (anyRejected) {
      newProposal.status = 'rejected';
      await updRuleProposal(newProposal);
      alert("Rule change rejected.");
    } else if (allApproved) {
      newProposal.status = 'approved';
      await updRuleProposal(newProposal);
      // Apply the rule changes — save to pitchConfig
      const existingConfig = await storeGet("pitchConfig") || {};
      const changes = ruleProposal.changes || {};
      const newConfig = {
        ...existingConfig,
        ...(changes["Snatch Return"] ? { snatchReturn: changes["Snatch Return"] } : {}),
        ...(changes["Transfer Start"] ? { transferStart: changes["Transfer Start"] } : {}),
        ...(changes["Transfer End"] ? { transferEnd: changes["Transfer End"] } : {}),
        ...(changes["Snatch Window"] ? { snatchWindow: changes["Snatch Window"] } : {}),
      };
      await storeSet("pitchConfig", newConfig);
      alert("All teams approved! Rules updated.");
    } else {
      await updRuleProposal(newProposal);
    }
    setVotePin(''); setVotePinErr('');
  };

  // Check if current user has pending vote
  const pendingVote = ruleProposal?.status === 'pending' && myTeam &&
    eligibleVoters.some(t => t.id === myTeam.id) &&
    !ruleProposal.votes[myTeam.id];

  const navItems=[
  ...(isAdmin && teams.length===0 ? [{id:"setup",label:"Setup",icon:"⚙️"}] : []),
  {id:"draft",label:"Draft",icon:"🎯"},
  {id:"matches",label:"Matches",icon:"⚡"},
  {id:"transfer",label:"Transfer",icon:"🔥",disabled:teams.length===0},
  {id:"results",label:"Results",icon:"📊"},
  {id:"leaderboard",label:"Board",icon:"👑",disabled:teams.length===0},
];

 if (!appReady) return (
    <>
      <style>{css}</style>
      <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
        <img src="/logo.png" style={{width:80,height:80,objectFit:"contain",borderRadius:12,animation:"spin 2s linear infinite"}} />
        <div style={{fontFamily:fonts.display,fontSize:22,fontWeight:700,color:T.accent,letterSpacing:3}}>TEEKHA BOUNCER</div>
        <div style={{color:T.muted,fontSize:14,letterSpacing:1}}>Loading league data…</div>
      </div>
    </>
  );

  return (
    <>
      <GlobalStyles />
      {isGuest && <div style={{background:"#4A5E7822",borderBottom:`1px solid ${T.border}`,padding:"6px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:11,fontFamily:fonts.body}}><span style={{color:T.muted}}>👁 Guest — read only</span><button onClick={onLeaveGuest||onLeave} style={{background:"transparent",border:"none",color:T.accent,fontSize:11,cursor:"pointer",fontWeight:700,fontFamily:fonts.body}}>CLAIM TEAM →</button></div>}
      {pitch?.isClone && (
        <div style={{background:"linear-gradient(90deg,#A855F718,#7C3AED18)",borderBottom:"2px solid #A855F766",padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
          <span style={{fontSize:20}}>🧬</span>
          <div>
            <span style={{fontFamily:fonts.display,fontWeight:800,fontSize:15,color:T.purple,letterSpacing:2}}>CLONE PITCH</span>
            <span style={{color:T.muted,fontSize:12,marginLeft:10}}>Cloned from <span style={{color:T.text,fontWeight:600}}>{pitch.clonedFromName}</span> · Changes here won't affect the original</span>
          </div>
        </div>
      )}
      {guestToast && <div style={{position:"fixed",top:60,left:"50%",transform:"translateX(-50%)",background:"#1E2D45",border:"1px solid #4A5E78",borderRadius:10,padding:"10px 20px",zIndex:9999,fontFamily:fonts.body,fontSize:14,color:T.text,display:"flex",alignItems:"center",gap:8,boxShadow:"0 4px 20px rgba(0,0,0,0.5)"}}>
        <span style={{fontSize:18}}>👁</span>
        <span>View only — <strong style={{color:T.accent}}>guests cannot make changes</strong></span>
      </div>}
      <ChatWindow myTeam={myTeam} teams={teams} unlocked={unlocked} withPassword={withPassword} storeGet={storeGet} storeSet={storeSet} isGuest={isGuest} />
      <style>{css}</style>
      <div style={{minHeight:"100vh",background:"var(--bg)"}}>
        {editPlayer&&<EditPlayerModal player={editPlayer}
          onSave={(updated)=>{const up=players.map(p=>p.id===updated.id?updated:p);setPlayers(up);storeSet("players",up);setEditPlayer(null);}}
          onAdd={(np)=>{const all=[...players,np];setPlayers(all);storeSet("players",all);setEditPlayer(null);}}
          onClose={()=>setEditPlayer(null)} />}
        {smartStatsMatch&&<SmartStatsModal pointsConfig={pointsConfig}
          match={smartStatsMatch}
          players={players}
          T={T}
          fonts={fonts}
          assignments={(() => {
  const matchDate = smartStatsMatch.date;
  const historicalAssignments = {};
  
  players.forEach(p => {
    const periods = ownershipLog[p.id] || [];
    
    if (periods.length === 0) {
      // No ownership log - use current assignment or pool
      if (assignments[p.id]) {
        historicalAssignments[p.id] = assignments[p.id];
      } else if (unsoldPool.includes(p.id)) {
        historicalAssignments[p.id] = "__pool__";
      } else {
        // Player exists but not assigned - treat as pool for this match
        historicalAssignments[p.id] = "__pool__";
      }
    } else {
      const owned = periods.find(o => {
        const fromDate = (o.from || "").split("T")[0];
        const toDate = o.to ? o.to.split("T")[0] : "2099-01-01";
        return matchDate >= fromDate && matchDate <= toDate;
      });
      
      if (owned) {
        historicalAssignments[p.id] = owned.teamId;
      } else {
        // Player has ownership history but wasn't owned on this date - treat as pool
        historicalAssignments[p.id] = "__pool__";
      }
    }
  });
  
  return historicalAssignments;
})()}
          existingStats={Object.fromEntries(Object.entries(points).filter(([pid,m])=>m[smartStatsMatch.id]).map(([pid,m])=>[pid,m[smartStatsMatch.id].stats]))}
          onSave={(statsList)=>{
            const newPts={...points};
            // First clear all existing stats for this match
            for(const pid of Object.keys(newPts)){
              if(newPts[pid][smartStatsMatch.id]){
                const updated={...newPts[pid]};
                delete updated[smartStatsMatch.id];
                newPts[pid]=updated;
              }
            }
            // Then save only the played players
            for(const s of statsList){
              if(!s.playerId)continue;
              const pts=calcPoints(s, pointsConfig);
              if(!newPts[s.playerId])newPts[s.playerId]={};
              newPts[s.playerId][smartStatsMatch.id]={base:pts,stats:s};
            }
            updPoints(newPts);
            setSmartStatsMatch(null);
            pushNotif("stats", "Match "+smartStatsMatch.matchNum+" stats synced — points updated", "📊");
            alert("✅ Points saved for " + statsList.length + " players!");
          }}
          onClose={()=>setSmartStatsMatch(null)}
        />}

        {showPwModal&&<PasswordModal storedHash={pwHash} recoveryHash={recoveryHash} onSuccess={handlePwSuccess} onClose={()=>{setShowPwModal(false);setPendingAction(null);}} T={T} fonts={fonts} />}

        {/* TOP BAR */}
<div style={{background:"linear-gradient(135deg, #0A0E14 0%, #1A1F2E 100%)",borderBottom:`4px solid ${T.accent}`,padding:"8px 10px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50,boxShadow:"0 4px 20px rgba(245,158,11,0.3)"}}>
  <div style={{display:"flex",alignItems:"center",gap:10}}>
    <button onClick={()=>setDrawerOpen(true)} style={{background:T.accent+"22",border:`2px solid ${T.accent}`,cursor:"pointer",padding:"8px",display:"flex",flexDirection:"column",justifyContent:"center",gap:4,flexShrink:0,position:"relative",borderRadius:0,clipPath:"polygon(3px 0%, 100% 0%, calc(100% - 3px) 100%, 0% 100%)"}}>
      <span style={{display:"block",width:20,height:2,background:T.accent,borderRadius:1}} />
      <span style={{display:"block",width:20,height:2,background:T.accent,borderRadius:1}} />
      <span style={{display:"block",width:20,height:2,background:T.accent,borderRadius:1}} />
      {(pendingVote || unreadNotifCount > 0) && <span style={{position:"absolute",top:-2,right:-2,width:10,height:10,background:"#FF3D5A",borderRadius:"50%",border:"2px solid #0A0E14",boxShadow:"0 0 8px #FF3D5A"}} />}
    </button>
    <div style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer"}} onClick={onLeave} title="Back to pitches">
      <div style={{width:42,height:42,background:`linear-gradient(135deg, ${T.accent} 0%, #D97706 100%)`,display:"flex",alignItems:"center",justifyContent:"center",clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)",boxShadow:`3px 3px 0 rgba(217,119,6,0.4)`}}>
        <img src="/logo.png" alt="Teekha Bouncer" style={{height:30,width:30,objectFit:"contain",filter:"drop-shadow(1px 1px 0 rgba(0,0,0,0.3))"}} />
      </div>
      <div>
        <div style={{fontFamily:fonts.display,fontWeight:900,fontSize:"clamp(11px, 3vw, 16px)",color:T.accent,letterSpacing:3,lineHeight:1,textTransform:"uppercase",textShadow:"2px 2px 0 rgba(245,158,11,0.2)"}}>TEEKHA BOUNCER</div>
        <div style={{fontSize:10,color:T.muted,letterSpacing:1.5,marginTop:4,fontFamily:fonts.body,fontWeight:700}}>
          <span style={{color:T.accent}}>{pitch ? pitch.name.toUpperCase() : ""}</span>
          {pitch && user && <span style={{color:T.muted}}> • </span>}
          {user && <span style={{color:T.sub}}>{user.email.split("@")[0]}</span>}
        </div>
      </div>
    </div>
  </div>
  <div style={{display:"flex",alignItems:"center",gap:3}}>
    <button onClick={onLeave} style={{background:"#4F8EF7",border:"none",color:"#050F14",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",padding:"7px 14px",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:11,letterSpacing:1.5,filter:"drop-shadow(2px 2px 0 #1E3A5F)"}}>
      <span className="desk-only">🏠 HOME</span>
      <span className="mob-only">🏠</span>
    </button>
    <button onClick={()=>{if(unlocked)setUnlocked(false);else{setPendingAction(null);setShowPwModal(true);}}} style={{background:unlocked?"#2ECC71":"transparent",border:unlocked?"none":`2px solid ${T.border}`,color:unlocked?"#050F05":T.muted,clipPath:unlocked?"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)":"none",padding:unlocked?"7px 14px":"5px 12px",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:11,letterSpacing:1.5,filter:unlocked?"drop-shadow(2px 2px 0 #0A5020)":"none"}}>
      <span className="desk-only">{unlocked?"🔓 ON":"🔒 OFF"}</span>
      <span className="mob-only">{unlocked?"🔓":"🔒"}</span>
    </button>
    <button 
      onClick={()=>withPassword(()=>{if(!confirm("Reset ALL data? This cannot be undone!"))return;["teams","players","assignments","matches","captains","points","page","pwhash"].forEach(k=>storeDel(k));window.location.reload();})} 
      title="Reset all pitch data (admin only)"
      style={{background:"#7A6050",border:"none",color:"#F5EBD8",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",padding:"7px 14px",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:11,letterSpacing:1.5,filter:"drop-shadow(2px 2px 0 #3D2E10)"}}>
      <span className="desk-only">⚙️ RESET</span>
      <span className="mob-only">⚙️</span>
    </button>
    <button onClick={onLogout} style={{background:"#FF3D5A",border:"none",color:"#FFFFFF",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",padding:"7px 14px",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:11,letterSpacing:1.5,filter:"drop-shadow(2px 2px 0 #8B0000)"}}>
      <span className="desk-only">LOGOUT</span>
      <span className="mob-only" style={{fontSize:11}}>OUT</span>
    </button>
  </div>
</div>

        {/* BOTTOM NAV */}
<div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:50,background:"linear-gradient(180deg, #0A0E14 0%, #080C12 100%)",borderTop:`4px solid #FF6B00`,display:"flex",paddingBottom:"max(8px, env(safe-area-inset-bottom))",boxShadow:"0 -4px 20px rgba(255,107,0,0.2)"}}>
  {navItems.map(n=>(
    <button key={n.id} onClick={()=>!n.disabled&&nav(n.id)}
      style={{flex:1,background:page===n.id?"linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)":"transparent",border:"none",cursor:n.disabled?"not-allowed":"pointer",padding:"14px 4px 10px",display:"flex",flexDirection:"column",alignItems:"center",gap:5,opacity:n.disabled?0.25:1,clipPath:page===n.id?"polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)":"none",transition:"all .2s",boxShadow:page===n.id?"inset 0 0 20px rgba(255,255,255,0.15), 4px 4px 0 rgba(139,69,0,0.4)":"none",position:"relative"}}
      onMouseEnter={e=>!n.disabled&&page!==n.id&&(e.currentTarget.style.background="rgba(255,107,0,0.1)")}
      onMouseLeave={e=>!n.disabled&&page!==n.id&&(e.currentTarget.style.background="transparent")}>
      <span style={{fontSize:page===n.id?28:24,lineHeight:1,filter:page===n.id?"drop-shadow(0 2px 4px rgba(0,0,0,0.4))":"none",transition:"all .2s"}}>{n.icon}</span>
      <span style={{fontSize:page===n.id?10.5:9.5,fontFamily:fonts.display,fontWeight:page===n.id?900:700,letterSpacing:page===n.id?2:1,color:page===n.id?"#0A0E14":T.muted,textTransform:"uppercase",textShadow:page===n.id?"1px 1px 0 rgba(255,255,255,0.2)":"none",transition:"all .2s"}}>{n.label}</span>
      {page===n.id && <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:"60%",height:3,background:"linear-gradient(90deg, transparent 0%, #FFD700 50%, transparent 100%)",boxShadow:"0 0 8px #FFD700"}}/>}
    </button>
  ))}
</div>

        {loading&&(
          <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.92)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:200,backdropFilter:"blur(4px)"}}>
            <Spinner />
            <div style={{marginTop:16,color:T.accent,fontWeight:700,fontSize:16,textAlign:"center",padding:"0 20px"}}>{loading}</div>
            <div style={{marginTop:6,color:T.muted,fontSize:13}}>Please wait…</div>
          </div>
        )}

        {page==="leaderboard" && <MVPSlideshow players={players} assignments={assignments} teams={teams} points={points} fonts={fonts} T={T} PALETTE={PALETTE} page={page} />}
        {page==="leaderboard" && leaderboard.length > 0 && (
          <div style={{position:'fixed',bottom:80,left:0,right:0,background:`linear-gradient(90deg,${T.bg} 0%,#1A0F00 50%,${T.bg} 100%)`,borderTop:`3px solid ${T.accent}`,padding:'10px 0',overflow:'hidden',zIndex:40,boxShadow:`0 -4px 20px ${T.accent}33`}}>
            <div className="ticker-mobile-fast" style={{display:'flex',alignItems:'center',gap:40,animation:'tb-ticker 20s linear infinite',whiteSpace:'nowrap',willChange:'transform',transform:'translateZ(0)'}}>
              {(()=>{
                const activities=[];
                matches.filter(m=>m.status==='completed').slice(-2).forEach(m=>{
                  const matchPts=teams.map(t=>{let total=0;players.forEach(p=>{if(assignments[p.id]===t.id&&points[p.id]?.[m.id]){total+=points[p.id][m.id].base||0;}});return{team:t,total};}).sort((a,b)=>b.total-a.total);
                  if(matchPts[0]?.total>0){activities.push({emoji:'🏏',text:`M${m.matchNum}: ${matchPts[0].team.name} leads with ${matchPts[0].total} pts`});}
                });
                if(leaderboard[0]){const topTeam=leaderboard[0];const topPs=players.filter(p=>assignments[p.id]===topTeam.id).map(p=>({...p,total:Object.values(points[p.id]||{}).reduce((s,m)=>s+(m.base||0),0)})).sort((a,b)=>b.total-a.total);if(topPs[0]){activities.push({emoji:'⭐',text:`Current MVP: ${topPs[0].name.toUpperCase()} (${topPs[0].total} pts)`});}}
                if(snatch?.active){const p=players.find(x=>x.id===snatch.active.pid);const from=teams.find(t=>t.id===snatch.active.fromTeamId);const by=teams.find(t=>t.id===snatch.active.byTeamId);if(p&&from&&by){activities.push({emoji:'⚡',text:`SNATCH: ${by.name} borrowed ${p.name.toUpperCase()} from ${from.name}`});}}
                notifications.slice(-3).reverse().forEach(n=>{activities.push({emoji:n.emoji,text:n.text.toUpperCase()});});
                const doubled=[...activities,...activities];
                return doubled.map((item,idx)=>(
                  <div key={idx} style={{display:'inline-flex',alignItems:'center',gap:8,padding:'6px 16px',background:T.accentBg,border:`1px solid ${T.accentBorder}`,clipPath:'polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)'}}>
                    <span style={{fontSize:16,flexShrink:0}}>{item.emoji}</span>
                    <span style={{fontFamily:fonts.display,fontSize:12,fontWeight:700,color:T.accent,letterSpacing:1}}>{item.text}</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}
        <div style={{maxWidth:860,margin:"0 auto",padding:"20px 16px 90px"}}>

          {page==="setup"&&(
            <SetupPage
              numTeams={numTeams}
              setNumTeams={setNumTeams}
              tNames={tNames}
              setTNames={setTNames}
              createTeams={createTeams}
              storeSet={storeSet}
              PALETTE={PALETTE}
            />
          )}

          {page==="draft"&&(
            <div className="fade-in">
              <div style={{marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
                  <div style={{display:"inline-block",background:T.accent,padding:"4px 16px 4px 12px",clipPath:"polygon(0 0,100% 0,calc(100% - 10px) 100%,0 100%)"}}>
  <h2 style={{fontFamily:fonts.display,fontSize:28,fontWeight:700,color:T.bg,letterSpacing:3,margin:0}}>PLAYER DRAFT</h2>
</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
  <button onClick={()=>withPassword(()=>setFetchPlayerModal({tournamentId:null,tournamentName:"General"}))} 
    style={{background:"#4F8EF7",border:"none",color:"#050F14",clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)",padding:"9px 20px",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:13,letterSpacing:2,textTransform:"uppercase",filter:"drop-shadow(3px 3px 0 #1E3A5F)"}}>
    🌐 FETCH PLAYERS
  </button>
  <button onClick={()=>withPassword(()=>setEditPlayer({name:"",iplTeam:"",role:"Batsman"}))} 
    style={{background:"transparent",border:`2px solid ${T.accent}`,color:T.accent,clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)",padding:"7px 18px",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:13,letterSpacing:2,textTransform:"uppercase"}}>
    ✚ ADD
  </button>
  <button onClick={()=>{setDraftTab("players");setShowAllPlayersModal(true);}} 
    style={{background:squadView?T.accent:"transparent",border:`2px solid ${T.accent}`,color:squadView?T.bg:T.accent,clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)",padding:"7px 18px",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:13,letterSpacing:2,textTransform:"uppercase"}}>
    {squadView?"📋 LIST":"🏊 POOL"}
  </button>
</div>
                </div>
                {/* Draft sub-tabs */}
                <div style={{display:"flex",gap:8,marginTop:12}}>
  {[{id:"players",label:"📋 PLAYERS"},{id:"unsold",label:"🏷️ UNSOLD POOL"}].map(t=>(
    <button key={t.id} onClick={()=>setDraftTab(t.id)}
      style={{flex:1,padding:"10px",border:draftTab===t.id?"none":`2px solid ${T.border}`,cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:13,letterSpacing:2,textTransform:"uppercase",background:draftTab===t.id?T.accent:"transparent",color:draftTab===t.id?T.bg:T.muted,clipPath:draftTab===t.id?"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)":"none",transition:"all .15s"}}>
      {t.label}
    </button>
  ))}
</div>
              </div>
             {/* UNSOLD POOL TAB */}
{draftTab==="unsold" && (
  <div>
    {/* COMPARE MODAL */}
    {showCompare && (
      <div onClick={()=>{setShowCompare(false);setHighlightPlayer(null);}} style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.75)",backdropFilter:"blur(8px)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
        <div onClick={e=>e.stopPropagation()} style={{width:"min(760px,95vw)",maxHeight:"85vh",display:"flex",flexDirection:"column",background:"rgba(15,18,28,0.95)",border:`2px solid #6B46C1`,borderTop:`4px solid #9F7AEA`,borderRadius:0,overflow:"hidden",boxShadow:"0 24px 80px rgba(107,70,193,0.4)"}}>
          {/* Header */}
          <div style={{padding:"16px 20px",borderBottom:`1px solid #6B46C133`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontFamily:fonts.display,fontWeight:900,fontSize:18,color:"#9F7AEA",letterSpacing:3}}>⚡ COMPARE SQUAD vs POOL</div>
            <button onClick={()=>{setShowCompare(false);setHighlightPlayer(null);}} style={{background:"transparent",border:"none",color:T.muted,fontSize:20,cursor:"pointer"}}>✕</button>
          </div>
          {/* Filters */}
          <div style={{padding:"12px 20px",borderBottom:`1px solid #6B46C133`,display:"flex",gap:10,flexWrap:"wrap"}}>
            <select value={compareTeam} onChange={e=>setCompareTeam(e.target.value)}
              style={{flex:1,minWidth:150,background:"#0A0E14",border:`1px solid #6B46C1`,borderRadius:0,padding:"8px 12px",color:T.text,fontFamily:fonts.display,fontWeight:700,fontSize:12,letterSpacing:1,cursor:"pointer"}}>
              <option value="">— Pick a team —</option>
              {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={compareRole} onChange={e=>setCompareRole(e.target.value)}
              style={{flex:1,minWidth:120,background:"#0A0E14",border:`1px solid #6B46C1`,borderRadius:0,padding:"8px 12px",color:T.text,fontFamily:fonts.display,fontWeight:700,fontSize:12,letterSpacing:1,cursor:"pointer"}}>
              <option value="All">Role</option>
              <option>Batsman</option>
              <option>Bowler</option>
              <option>All-Rounder</option>
              <option>Wicket-Keeper</option>
            </select>
            <select value={compareTier} onChange={e=>setCompareTier(e.target.value)}
              style={{flex:1,minWidth:120,background:"#0A0E14",border:`1px solid #6B46C1`,borderRadius:0,padding:"8px 12px",color:T.text,fontFamily:fonts.display,fontWeight:700,fontSize:12,letterSpacing:1,cursor:"pointer"}}>
              <option value="All">Category</option>
              <option value="gold">Gold</option>
              <option value="silver">Silver</option>
              <option value="bronze">Bronze</option>
              <option value="platinum">Platinum</option>
            </select>
          </div>
          {/* Content */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",flex:1,overflowY:"auto"}}>
            {/* Left - Team Squad */}
            <div style={{borderRight:`1px solid #6B46C133`,padding:"12px 16px"}}>
              <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:11,color:"#9F7AEA",letterSpacing:3,marginBottom:10,textTransform:"uppercase"}}>
                {compareTeam ? teams.find(t=>t.id===compareTeam)?.name + " SQUAD" : "SELECT A TEAM"}
              </div>
              {compareTeam ? players.filter(p=>{
                if(assignments[p.id]!==compareTeam) return false;
                if(compareRole!=="All" && p.role!==compareRole) return false;
                if(compareTier!=="All" && p.tier!==compareTier) return false;
                return true;
              }).map(p=>(
                <div key={p.id} onClick={()=>setHighlightPlayer(highlightPlayer?.id===p.id?null:p)} style={{padding:"8px 10px",marginBottom:6,background:highlightPlayer?.id===p.id?"rgba(159,122,234,0.25)":"rgba(159,122,234,0.08)",border:`1px solid ${highlightPlayer?.id===p.id?"#9F7AEA":"#6B46C133"}`,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",transition:"all 0.2s"}}>
                  <div>
                    <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:13,color:T.text}}>{p.name}</div>
                    <div style={{fontFamily:fonts.body,fontSize:10,color:T.muted}}>{p.iplTeam} · {p.role}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
  {(()=>{const t=Object.values(points[p.id]||{}).reduce((s,d)=>s+(d.base||0),0);return t>0?<div style={{background:"#FF6B0022",border:"1px solid #FF6B0088",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",padding:"2px 8px",display:"flex",alignItems:"center",gap:3}}><span style={{fontFamily:fonts.display,fontWeight:900,fontSize:12,color:"#FF8C00"}}>{t}</span><span style={{fontFamily:fonts.display,fontSize:8,color:"#FF6B0088"}}>PTS</span></div>:null;})()}
  {p.tier&&<span style={{background:p.tier==="gold"?"#F5A62322":p.tier==="silver"?"#94A3B822":p.tier==="bronze"?"#CD7F3222":"#4A5E7833",border:`1px solid ${p.tier==="gold"?"#F5A62366":p.tier==="silver"?"#94A3B855":p.tier==="bronze"?"#CD7F3255":"#4A5E7866"}`,color:p.tier==="gold"?"#F5A623":p.tier==="silver"?"#94A3B8":p.tier==="bronze"?"#CD7F32":"#B0BEC5",fontFamily:fonts.display,fontWeight:800,fontSize:10,letterSpacing:1.5,padding:"2px 8px",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)"}}>{p.tier.toUpperCase()}</span>}
</div>
                </div>
              )) : <div style={{color:T.muted,fontSize:12,fontFamily:fonts.body,padding:20,textAlign:"center"}}>Pick a team to see their squad</div>}
            </div>
            {/* Right - Unsold Pool */}
            <div style={{padding:"12px 16px"}}>
              <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:11,color:"#F5A623",letterSpacing:3,marginBottom:10,textTransform:"uppercase"}}>UNSOLD POOL</div>
              {players.filter(p=>{
                if(!unsoldPool.includes(p.id)) return false;
                if(compareRole!=="All" && p.role!==compareRole) return false;
                if(compareTier!=="All" && p.tier!==compareTier) return false;
                return true;
              }).map(p=>(
                <div key={p.id} style={{padding:"8px 10px",marginBottom:6,background:highlightPlayer&&p.role===highlightPlayer.role&&(p.tier===highlightPlayer.tier||["bronze","silver","gold","platinum"].indexOf(p.tier)<=["bronze","silver","gold","platinum"].indexOf(highlightPlayer.tier))?"rgba(245,166,35,0.25)":"rgba(245,166,35,0.04)",border:`1px solid ${highlightPlayer&&p.role===highlightPlayer.role&&(p.tier===highlightPlayer.tier||["bronze","silver","gold","platinum"].indexOf(p.tier)<=["bronze","silver","gold","platinum"].indexOf(highlightPlayer.tier))?"#F5A623":"#F5A62322"}`,display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all 0.2s"}}>
                  <div>
                    <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:13,color:T.text}}>{p.name}</div>
                    <div style={{fontFamily:fonts.body,fontSize:10,color:T.muted}}>{p.iplTeam} · {p.role}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                    {(()=>{const totalPts=Object.values(points[p.id]||{}).reduce((s,d)=>s+(d.base||0),0);if(!totalPts)return null;return(<div style={{background:"#FF6B0022",border:"1px solid #FF6B0088",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",padding:"2px 8px",display:"flex",alignItems:"center",gap:4}}><span style={{fontFamily:fonts.display,fontWeight:900,fontSize:12,color:"#FF8C00"}}>{totalPts}</span><span style={{fontFamily:fonts.display,fontWeight:700,fontSize:8,color:"#FF6B0088",letterSpacing:1}}>PTS</span></div>);})()}
                    {p.tier && <span style={{background:p.tier==="gold"?"#F5A62322":p.tier==="silver"?"#94A3B822":p.tier==="bronze"?"#CD7F3222":"#4A5E7833",border:`1px solid ${p.tier==="gold"?"#F5A62366":p.tier==="silver"?"#94A3B855":p.tier==="bronze"?"#CD7F3255":"#4A5E7866"}`,color:p.tier==="gold"?"#F5A623":p.tier==="silver"?"#94A3B8":p.tier==="bronze"?"#CD7F32":"#B0BEC5",fontFamily:fonts.display,fontWeight:800,fontSize:10,letterSpacing:1.5,padding:"2px 8px",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)"}}>{p.tier.toUpperCase()}</span>}
                  </div>
  
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}
    {/* Info banner */}
    <div style={{background:"#6B46C133",border:`2px solid #6B46C1`,borderLeft:`5px solid #6B46C1`,borderRadius:0,padding:"14px 18px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
      <div>
        <div style={{fontFamily:fonts.display,fontWeight:800,color:"#9F7AEA",fontSize:14,letterSpacing:1.5,textTransform:"uppercase"}}>📦 UNSOLD POOL</div>
        <div style={{color:T.muted,fontSize:11,marginTop:3,fontFamily:fonts.body}}>Players available for pickup during transfer window</div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <div style={{background:"#6B46C1",color:T.bg,clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)",padding:"8px 16px",fontFamily:fonts.display,fontWeight:800,fontSize:15,letterSpacing:2}}>
          {poolLoading ? "FETCHING" : unsoldPool.length}
        </div>
        <button onClick={()=>setShowCompare(true)} style={{background:"linear-gradient(135deg,#84CC16,#65A30D)",border:"none",clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)",padding:"8px 16px",fontFamily:fonts.display,fontWeight:800,fontSize:13,color:"#0A0E14",letterSpacing:2,cursor:"pointer"}}>
          ⚡ COMPARE
        </button>
      </div>
    </div>

    {/* Add from unassigned section */}
    <div style={{marginBottom:24}}>
      <div onClick={()=>setShowUnassigned(v=>!v)} style={{background:"#4299E133",borderLeft:`4px solid #4299E1`,padding:"10px 16px",marginBottom:showUnassigned?12:0,clipPath:"polygon(0% 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontFamily:fonts.display,fontSize:13,fontWeight:800,color:"#4299E1",letterSpacing:2,textTransform:"uppercase"}}>
          ➕ ADD FROM UNASSIGNED PLAYERS
        </div>
        <div style={{color:"#4299E1",fontSize:16,transition:"transform 0.2s",transform:showUnassigned?"rotate(180deg)":"rotate(0deg)"}}>▼</div>
      </div>
      {showUnassigned && (
      <div style={{maxHeight:180,overflowY:"auto",display:"flex",flexWrap:"wrap",gap:8,padding:"12px 16px",background:T.card,border:`2px solid ${T.border}`,borderRadius:0}}>
        {players.filter(p=>!assignments[p.id]&&!unsoldPool.includes(p.id)).map(p=>(
          <button key={p.id} onClick={()=>addToUnsoldPool(p.id)}
            style={{padding:"8px 14px",border:`2px solid #4299E1`,borderRadius:0,background:"transparent",color:"#4299E1",fontSize:13,fontFamily:fonts.display,fontWeight:700,letterSpacing:1,cursor:"pointer",transition:"all .2s",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)"}}
            onMouseEnter={e => e.currentTarget.style.background = "#4299E122"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            + {p.name} <span style={{opacity:0.6,fontWeight:400,fontSize:11}}>({p.iplTeam})</span>
          </button>
        ))}
        {players.filter(p=>!assignments[p.id]&&!unsoldPool.includes(p.id)).length===0&&(
          <div style={{color:T.muted,fontSize:13,padding:20,width:"100%",textAlign:"center"}}>All unassigned players are already in the pool</div>
        )}
      </div>
      )}
    </div>

    {/* Current pool section */}

    {/* Current pool section */}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
      <div style={{background:"#9F7AEA33",borderLeft:`4px solid #9F7AEA`,padding:"10px 16px",clipPath:"polygon(0% 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)",flex:1}}>
        <div style={{fontFamily:fonts.display,fontSize:13,fontWeight:800,color:"#9F7AEA",letterSpacing:2,textTransform:"uppercase"}}>
          🏊 CURRENT UNSOLD POOL
        </div>
      </div>
      <select value={unsoldTierFilter} onChange={e=>setUnsoldTierFilter(e.target.value)} style={{background:T.card,border:`2px solid #6B46C1`,borderRadius:0,padding:"8px 12px",color:"#9F7AEA",fontFamily:fonts.display,fontWeight:700,fontSize:12,letterSpacing:1,cursor:"pointer",marginLeft:10}}>
  <option value="All">All Tiers</option>
  <option value="platinum">Platinum</option>
  <option value="gold">Gold</option>
  <option value="silver">Silver</option>
  <option value="bronze">Bronze</option>
</select>
      <input value={unsoldSearch} onChange={e=>setUnsoldSearch(e.target.value)} placeholder="Search player..." style={{background:T.card,border:`2px solid #6B46C1`,borderRadius:0,padding:"8px 14px",color:T.text,fontSize:12,fontFamily:fonts.body,outline:"none",width:180,marginLeft:10}} />
    </div>

    {poolLoading ? (
      <div style={{textAlign:"center",padding:40,background:T.card,border:`2px solid ${T.border}`,borderRadius:0}}>
        <div style={{fontFamily:fonts.display,fontSize:13,color:"#9F7AEA",letterSpacing:2,marginBottom:10}}>FETCHING POOL...</div>
        <div style={{height:4,background:T.border,borderRadius:2,overflow:"hidden"}}>
          <div style={{height:"100%",background:"#9F7AEA",borderRadius:2,animation:"tb-shimmer 1.2s infinite",backgroundSize:"200% 100%",backgroundImage:`linear-gradient(90deg,#6B46C1 25%,#9F7AEA 50%,#6B46C1 75%)`}} />
        </div>
      </div>
    ) : unsoldPool.length===0 ? (
      <div style={{textAlign:"center",padding:40,color:T.muted,fontSize:14,background:T.card,border:`2px solid ${T.border}`,borderRadius:0}}>
        Pool is empty — add players above
      </div>
    ) : (
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {(() => {
          const tierColors = {platinum:"#B0BEC5",gold:"#F5A623",silver:"#94A3B8",bronze:"#CD7F32","":"#9F7AEA"};
          const tiers = ["platinum","gold","silver","bronze",""];
          const allPlayers = unsoldPool.map(pid => players.find(x=>x.id===pid)).filter(Boolean);
          const filtered = allPlayers.filter(p => {
  if(unsoldTierFilter !== "All" && (p.tier||"") !== unsoldTierFilter) return false;
  if(unsoldSearch && !p.name.toLowerCase().includes(unsoldSearch.toLowerCase()) && !p.iplTeam?.toLowerCase().includes(unsoldSearch.toLowerCase())) return false;
  return true;
});
          const getPoolPts = (p) => Object.values(points[p.id]||{}).reduce((s,d)=>s+(d.base||0),0);
const sorted = [...filtered].sort((a,b) => getPoolPts(b) - getPoolPts(a) || a.name.localeCompare(b.name));
          return tiers.map(tier => {
            const tierPlayers = sorted.filter(p => (p.tier||"") === tier);
            if(tierPlayers.length === 0) return null;
            return (
              <div key={tier}>
                <div style={{fontSize:16,fontFamily:fonts.display,fontWeight:800,letterSpacing:2,color:tierColors[tier],background:tierColors[tier]+"11",padding:"8px 14px",marginBottom:6,marginTop:4,clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",borderLeft:`3px solid ${tierColors[tier]}`}}>{(tier||"UNRANKED").toUpperCase()} ({tierPlayers.length})</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:10}}>
                {tierPlayers.map(p => {
                  const pid = p.id;
                  const releasedByTeam = teams.find(t=>(transfers?.releases?.[t.id]||[]).includes(pid));
                  return (
                    <div key={pid} style={{
                      background:T.bg,
                      border:`2px solid ${releasedByTeam?releasedByTeam.color+"66":myHighlights[pid]?"#F5A62366":T.border}`,
                      borderLeft:`5px solid ${releasedByTeam?releasedByTeam.color:myHighlights[pid]?"#F5A623":T.border}`,
                      borderRadius:0,
                      padding:"14px 18px",
                      display:"flex",
                      alignItems:"center",
                      gap:12,
                      flexWrap:"wrap",
                      position:"relative",
                      overflow:"hidden"
                    }}>
                      {/* Player info */}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:6}}>
                          <span style={{fontFamily:fonts.display,fontSize:16,fontWeight:900,color:myHighlights[pid]?"#F5A623":T.text,letterSpacing:1,textTransform:"uppercase"}}>
                            {p.name}
                          </span>
                          {p.tier && (
                            <span style={{fontSize:11,fontWeight:900,letterSpacing:2,padding:"4px 10px",fontFamily:fonts.display,textTransform:"uppercase",background:p.tier==="platinum"?"#4A5E7844":p.tier==="gold"?"#F5A62333":p.tier==="silver"?"#94A3B833":"#CD7F3233",border:`2px solid ${p.tier==="platinum"?"#4A5E78":p.tier==="gold"?"#F5A623":p.tier==="silver"?"#94A3B8":"#CD7F32"}`,color:p.tier==="platinum"?"#B0BEC5":p.tier==="gold"?"#F5A623":p.tier==="silver"?"#94A3B8":"#CD7F32",clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)",filter:"drop-shadow(2px 2px 0 rgba(0,0,0,0.5))"}}>
                              {p.tier==="platinum"?"PLATINUM":p.tier==="gold"?"GOLD":p.tier==="silver"?"SILVER":"BRONZE"}
                            </span>
                          )}
                          {releasedByTeam && (
                            <span style={{fontSize:11,fontWeight:900,letterSpacing:1.5,padding:"4px 10px",fontFamily:fonts.display,background:releasedByTeam.color+"22",border:`2px solid ${releasedByTeam.color}`,color:releasedByTeam.color,clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)",display:"flex",alignItems:"center",gap:6}}>
                              <span style={{width:6,height:6,borderRadius:"50%",background:releasedByTeam.color}}/>
                              {releasedByTeam.name.toUpperCase()}
                            </span>
                          )}
                          {!releasedByTeam && (
                            <span style={{fontSize:10,fontWeight:800,letterSpacing:1.5,padding:"3px 8px",fontFamily:fonts.display,background:"#6B46C122",border:`1px solid #6B46C144`,color:"#9F7AEA"}}>UNSOLD</span>
                          )}
                        </div>
                        <div style={{fontSize:11,color:T.muted,fontFamily:fonts.body,marginBottom:4}}>
                          {p.iplTeam} • {p.role}
                        </div>
                        {(() => {
                          const totalPts = Object.values(points[pid]||{}).reduce((s,d)=>s+(d.base||0),0);
                          const matchesPlayed = Object.keys(points[pid]||{}).length;
                          if(totalPts === 0 && matchesPlayed === 0) return null;
                          return (
                            <div style={{display:"inline-flex",alignItems:"center",gap:6,marginBottom:6,marginTop:2}}>
                              <div style={{background:"linear-gradient(135deg,#FF6B0022,#FF8C0022)",border:"2px solid #FF6B00",clipPath:"polygon(5px 0%,100% 0%,calc(100% - 5px) 100%,0% 100%)",padding:"3px 10px",display:"flex",alignItems:"center",gap:5}}>
                                <span style={{fontFamily:fonts.display,fontWeight:900,fontSize:14,color:"#FF8C00",letterSpacing:1}}>{totalPts}</span>
                                <span style={{fontFamily:fonts.display,fontWeight:700,fontSize:9,color:"#FF6B0099",letterSpacing:1.5,textTransform:"uppercase"}}>PTS</span>
                              </div>
                              {matchesPlayed > 0 && (
                                <span style={{fontFamily:fonts.body,fontSize:10,color:T.muted}}>
                                  {matchesPlayed} match{matchesPlayed>1?"es":""}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                        {myNotes[pid]&&editingNote!==pid&&(
                          <div style={{fontSize:11,color:"#4299E1",marginTop:6,fontStyle:"italic",background:"#4299E122",border:`1px solid #4299E144`,borderRadius:0,padding:"4px 10px",display:"inline-block"}}>
                            📝 "{myNotes[pid]}"
                          </div>
                        )}
                        {editingNote===pid&&(
                          <div style={{display:"flex",gap:8,marginTop:8}}>
                            <input autoFocus value={noteInput} onChange={e=>setNoteInput(e.target.value)}
                              onKeyDown={async e=>{
                                if(e.key==="Enter"){const u={...myNotes,[pid]:noteInput.trim()};if(!noteInput.trim())delete u[pid];await saveNotes(u);setEditingNote(null);}
                                if(e.key==="Escape")setEditingNote(null);
                              }}
                              placeholder="Private note..." maxLength={100}
                              style={{flex:1,background:T.bg,border:`2px solid #4299E1`,borderRadius:0,padding:"6px 10px",color:T.text,fontSize:12,fontFamily:fonts.body,outline:"none"}}
                            />
                            <button onClick={async()=>{const u={...myNotes,[pid]:noteInput.trim()};if(!noteInput.trim())delete u[pid];await saveNotes(u);setEditingNote(null);}}
                              style={{background:"#4299E1",border:"none",borderRadius:0,padding:"6px 14px",color:T.bg,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:fonts.display,letterSpacing:1,clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)"}}>
                              SAVE
                            </button>
                            <button onClick={()=>setEditingNote(null)}
                              style={{background:"transparent",border:`2px solid ${T.border}`,borderRadius:0,padding:"6px 10px",color:T.muted,fontSize:12,cursor:"pointer"}}>
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                      {/* Action buttons */}
                      <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                      <button onClick={async()=>{const u={...myHighlights};u[pid]?delete u[pid]:u[pid]=true;await saveHighlights(u);}}
  style={{background:myHighlights[pid]?"#F5A62333":"#F5A62311",border:`2px solid ${myHighlights[pid]?"#F5A623":"#F5A623"}`,borderRadius:0,padding:"8px 12px",cursor:"pointer",fontSize:16,transition:"all .2s",color:myHighlights[pid]?"#F5A623":"#F5A623"}}
  onMouseEnter={e => e.currentTarget.style.transform = "scale(1.1)"}
  onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
  {myHighlights[pid]?"⭐":"☆"}
</button>
                        <button onClick={()=>{setNoteInput(myNotes[pid]||"");setEditingNote(pid);}}
                          style={{background:myNotes[pid]?"#4299E133":"transparent",border:`2px solid ${myNotes[pid]?"#4299E1":T.border}`,borderRadius:0,padding:"8px 12px",cursor:"pointer",fontSize:14,transition:"all .2s"}}
                          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.1)"}
                          onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
                          📝
                        </button>
                        {unlocked&&(
                          <button onClick={()=>removeFromUnsoldPool(pid)}
                            style={{background:T.dangerBg,border:`2px solid ${T.danger}`,color:T.danger,borderRadius:0,padding:"8px 12px",cursor:"pointer",fontSize:12,fontFamily:fonts.display,fontWeight:800,letterSpacing:1,clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)"}}>
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            );
          });
        })()}
      </div>
    )}
  </div>
)}

              {/* PLAYERS TAB */}
{draftTab==="players" && <>
  {/* Lock/Unlock Banner */}
  <div style={{background:unlocked?"#2ECC7115":"#F5A62315",border:`2px solid ${unlocked?"#2ECC71":"#F5A623"}`,borderRadius:0,padding:"14px 18px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",borderLeft:`5px solid ${unlocked?"#2ECC71":"#F5A623"}`}}>
    <div>
      <div style={{fontFamily:fonts.display,fontWeight:800,color:unlocked?"#2ECC71":"#F5A623",fontSize:16,letterSpacing:2,textTransform:"uppercase"}}>{unlocked?"🔓 Squad Changes Unlocked":"🔒 Squad Changes Locked"}</div>
      <div style={{color:T.muted,fontSize:11,marginTop:3,fontFamily:fonts.body,letterSpacing:0.5}}>{unlocked?"Assign, replace or remove freely":"Password required to modify squads"}</div>
    </div>
    <button onClick={()=>{if(unlocked)setUnlocked(false);else{setPendingAction(null);setShowPwModal(true);}}} style={{background:unlocked?"#FF3D5A":"#F5A623",border:"none",color:unlocked?"#fff":T.bg,clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)",padding:"10px 20px",fontFamily:fonts.display,fontWeight:800,fontSize:13,letterSpacing:2,textTransform:"uppercase",cursor:"pointer",filter:unlocked?"drop-shadow(3px 3px 0 #8B0000)":"drop-shadow(3px 3px 0 #8B4500)"}}>
      {unlocked?"LOCK":"UNLOCK"}
    </button>
  </div>

  {/* TWO COLUMN LAYOUT */}
  <div style={{display:"flex",gap:16,alignItems:"start"}}>
    
    {/* LEFT COLUMN - TEAM BOXES */}
    <div className="draft-left-column" style={{width:"clamp(110px, 28%, 180px)",minWidth:0,display:"flex",flexDirection:"column",gap:10,overflowY:"auto",maxHeight:"calc(100vh - 160px)"}}>
      {teams.map(t => {
        const cnt = players.filter(p=>assignments[p.id]===t.id).length;
        const ruledOutCnt = players.filter(p=>assignments[p.id]===t.id&&ruledOut.includes(p.id)).length;
        const activeCnt = cnt - ruledOutCnt;
        
        return (
          <div 
            key={t.id}
            onClick={() => setTeamRosterModal(t.id)}
            style={{
              position:"relative",
              background:T.bg,
              border:`2px solid ${t.color}`,
              borderLeft:`5px solid ${t.color}`,
              borderRadius:0,
              padding:"16px 18px",
              cursor:"pointer",
              transition:"all .2s",
              overflow:"hidden",
              boxShadow:"3px 3px 0 "+t.color+"44"
            }}
            onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
            onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
          >
            {/* Team logo background */}
            {teamLogos[t.id] && <img src={teamLogos[t.id]} style={{position:"absolute",right:-10,bottom:-10,height:80,opacity:0.1,objectFit:"contain",pointerEvents:"none"}} />}
            
            {/* Team name */}
            <div className="draft-team-name" style={{fontFamily:fonts.display,fontSize:"clamp(11px, 3.5vw, 18px)",fontWeight:900,color:t.color,letterSpacing:2,textTransform:"uppercase",lineHeight:1,marginBottom:8}}>
              {t.name}
            </div>
            
            {/* Player count */}
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <span style={{fontFamily:fonts.display,fontSize:"clamp(16px, 4vw, 28px)",fontWeight:900,color:T.accent,letterSpacing:1}}>{activeCnt}</span>
              <span style={{fontSize:"clamp(8px, 2vw, 11px)",color:T.muted,fontFamily:fonts.body,letterSpacing:1,textTransform:"uppercase"}}>Players</span>
            </div>
            
            {/* Ruled out indicator */}
            {ruledOutCnt > 0 && (
              <div style={{fontSize:10,color:T.danger,fontFamily:fonts.display,fontWeight:700,letterSpacing:1.5}}>
                🚫 {ruledOutCnt} RULED OUT
              </div>
            )}
            
            {/* View roster hint */}
            <div style={{fontSize:"clamp(8px, 1.8vw, 10px)",color:t.color,fontFamily:fonts.display,fontWeight:700,letterSpacing:1.5,marginTop:4}}>
              VIEW ROSTER →
            </div>
          </div>
        );
      })}
    </div>

    {/* RIGHT COLUMN - PLAYERS LIST */}
    <div style={{flex:1}}>
      {/* Search and filters */}
      <div style={{marginBottom:16,display:"flex",gap:8,flexWrap:"wrap"}}>
        <input
          type="text"
          placeholder="Search player name..."
          value={playerSearch}
          onChange={e=>setPlayerSearch(e.target.value)}
          style={{flex:1,minWidth:120,background:T.card,border:`2px solid ${T.border}`,borderRadius:0,padding:"10px 14px",color:T.text,fontSize:14,fontFamily:fonts.body,outline:"none"}}
        />
        <select value={roleFilter||"All"} onChange={e=>setRoleFilter(e.target.value==="All"?null:e.target.value)}
          style={{background:T.card,border:`2px solid ${T.border}`,borderRadius:0,padding:"10px 14px",color:T.text,fontSize:13,fontFamily:fonts.display,fontWeight:700,letterSpacing:1,cursor:"pointer"}}>
          <option>All</option>
          <option>Batsman</option>
          <option>Bowler</option>
          <option>All-Rounder</option>
          <option>Wicket-Keeper</option>
        </select>
        <select value={sortOrder||"Default"} onChange={e=>setSortOrder(e.target.value==="Default"?null:e.target.value)}
          style={{background:T.card,border:`2px solid ${T.border}`,borderRadius:0,padding:"10px 14px",color:T.text,fontSize:13,fontFamily:fonts.display,fontWeight:700,letterSpacing:1,cursor:"pointer"}}>
          <option>Default</option>
          <option>Name (A-Z)</option>
        </select>
      </div>

      {/* Players list */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {(() => {
          let filtered = players.filter(p => {
  if (playerSearch && !p.name.toLowerCase().includes(playerSearch.toLowerCase()) && !p.iplTeam.toLowerCase().includes(playerSearch.toLowerCase())) return false;
  if (roleFilter && p.role !== roleFilter) return false;
  if (teamFilter && teamFilter !== "unassigned" && assignments[p.id] !== teamFilter) return false;
  if (teamFilter === "unassigned" && assignments[p.id]) return false;
  return true;
});

          if (sortOrder === "Name (A-Z)") filtered.sort((a,b) => a.name.localeCompare(b.name));

          return filtered.map(p => {
  const assignedTeam = assignments[p.id] ? teams.find(t=>t.id===assignments[p.id]) : null;
  const isRuledOut = ruledOut.includes(p.id);
  
  // Calculate total from points data directly
  let total = 0;
  if (points[p.id] && assignedTeam) {
    for (const [matchId, matchData] of Object.entries(points[p.id])) {
      const cap = captains[`${matchId}_${assignedTeam.id}`] || {};
      let pts = matchData.base || 0;
      if (cap.captain === p.id) pts *= 2;
      else if (cap.vc === p.id) pts *= 1.5;
      total += Math.round(pts);
    }
  }
            
            return (
              <div key={p.id} style={{
                background:T.bg,
                border:`2px solid ${isRuledOut?T.danger:assignedTeam?assignedTeam.color+"66":T.border}`,
                borderLeft:`5px solid ${isRuledOut?T.danger:assignedTeam?assignedTeam.color:T.border}`,
                borderRadius:0,
                padding:"12px 16px",
                display:"flex",
                alignItems:"center",
                gap:12,
                flexWrap:"wrap"
              }}>
                {/* Player info */}
                <div style={{flex:1,minWidth:200}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <span style={{fontFamily:fonts.display,fontSize:15,fontWeight:800,color:isRuledOut?T.danger:T.text,letterSpacing:1,textDecoration:isRuledOut?"line-through":"none"}}>
                      {p.name}
                    </span>
                    {isRuledOut && <span style={{fontSize:10,background:T.dangerBg,color:T.danger,padding:"2px 6px",fontFamily:fonts.display,fontWeight:800,letterSpacing:1}}>🚫 RULED OUT</span>}
                    {p.tier && <span style={{fontSize:9,fontWeight:800,letterSpacing:1,padding:"2px 6px",fontFamily:fonts.display,textTransform:"uppercase",background:p.tier==="platinum"?"#4A5E7833":p.tier==="gold"?"#F5A62322":p.tier==="silver"?"#94A3B822":"#CD7F3222",border:"1px solid "+(p.tier==="platinum"?"#4A5E7866":p.tier==="gold"?"#F5A62366":p.tier==="silver"?"#94A3B855":"#CD7F3255"),color:p.tier==="platinum"?"#B0BEC5":p.tier==="gold"?"#F5A623":p.tier==="silver"?"#94A3B8":"#CD7F32"}}>{p.tier.toUpperCase()}</span>}
                  </div>
                  <div style={{fontSize:11,color:T.muted,fontFamily:fonts.body}}>
                    {p.iplTeam} • {p.role} • {total} pts
                  </div>
                </div>

              </div>
            );
          });
        })()}
      </div>
    </div>
  </div>

  {/* TEAM ROSTER MODAL */}
  {teamRosterModal && (() => {
    const team = teams.find(t => t.id === teamRosterModal);
    if (!team) return null;
    
    const roster = players.filter(p => assignments[p.id] === team.id);
    const byRole = {
      "Batsman": roster.filter(p => p.role === "Batsman"),
      "Bowler": roster.filter(p => p.role === "Bowler"),
      "All-Rounder": roster.filter(p => p.role === "All-Rounder"),
      "Wicket-Keeper": roster.filter(p => p.role === "Wicket-Keeper")
    };
    
    return (
      <div className="tb-modal-backdrop" onClick={() => setTeamRosterModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div className="tb-modal-slide" onClick={e => e.stopPropagation()} style={{background:T.bg,border:`3px solid ${team.color}`,borderRadius:0,maxWidth:800,width:"100%",maxHeight:"80vh",overflow:"hidden",boxShadow:"5px 5px 0 "+team.color+"66"}}>
          {/* Modal header */}
          <div style={{background:team.color,padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontFamily:fonts.display,fontSize:22,fontWeight:900,color:T.bg,letterSpacing:3,textTransform:"uppercase"}}>
              {team.name} ROSTER
            </div>
            <button onClick={() => setTeamRosterModal(null)} style={{background:"transparent",border:"none",color:T.bg,fontSize:28,cursor:"pointer",lineHeight:1,fontWeight:300}}>×</button>
          </div>

          {/* Modal content */}
          <div style={{padding:"20px",overflowY:"auto",maxHeight:"calc(80vh - 70px)"}}>
            {roster.length === 0 ? (
              <div style={{textAlign:"center",padding:40,color:T.muted}}>No players assigned yet</div>
            ) : (
  <div>
    {Object.entries(byRole).map(([role, players]) => {
      if (players.length === 0) return null;
      return (
        <div key={role} style={{marginBottom:32}}>
          {/* Role Header */}
          <div style={{
            fontFamily:fonts.display,
            fontSize:14,
            fontWeight:800,
            color:team.color,
            letterSpacing:2,
            textTransform:"uppercase",
            marginBottom:16,
            paddingBottom:8,
            borderBottom:`2px solid ${team.color}`
          }}>
            {role} ({players.length})
          </div>
          
          {/* Grid for this role */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))",gap:16}}>
            {players.map(p => {
                  const isRuledOut = ruledOut.includes(p.id);
                  
                  // Calculate player total
                  let total = 0;
                  let matchesPlayed = 0;
                  
                  if (points[p.id]) {
                    const periods = (ownershipLog[p.id] || []).filter(o => o.teamId === team.id);
                    const hasLog = periods.length > 0;
                    
                    for (const [matchId, matchData] of Object.entries(points[p.id])) {
                      const match = matches.find(m => m.id === matchId);
                      if (!match) continue;
                      
                      const matchDate = match.date;
                      let owned = false;
                      
                      if (!hasLog) {
                        owned = true;
                      } else {
                        owned = periods.some(period => {
                          const fromDate = (period.from || "").split("T")[0];
                          const toDate = period.to ? period.to.split("T")[0] : "2099-01-01";
                          return matchDate >= fromDate && matchDate <= toDate;
                        });
                      }
                      
                      if (!owned) continue;
                      
                      const cap = captains[`${matchId}_${team.id}`] || {};
                      let pts = matchData.base || 0;
                      if (cap.captain === p.id) pts *= 2;
                      else if (cap.vc === p.id) pts *= 1.5;
                      total += Math.round(pts);
                      if (pts > 0) matchesPlayed++;
                    }
                  }
                  
                  const isSafe = isPlayerSafeForTeam(team.id, p.id);
                  
                  return (
                    <div key={p.id} style={{
                      background: isRuledOut ? "#1A0000" : T.card,
                      border: `2px solid ${isRuledOut ? T.danger : team.color+"44"}`,
                      borderRadius: 12,
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                      position: "relative",
                      transition: "transform 0.2s ease, box-shadow 0.2s ease",
                      cursor: total > 0 ? "pointer" : "default"
                    }}
                    onClick={() => total > 0 && setPlayerStatsModal(p)}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = "translateY(-4px)";
                      e.currentTarget.style.boxShadow = `0 8px 20px ${team.color}44`;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "none";
                    }}>
                      
                      {/* Player Image */}
                      <div style={{width:"100%",aspectRatio:"1/1"}}>
  <PlayerImage player={p} size="100%" borderRadius={0} teamColor={team?.color} showBackground={true} />
</div>
                      
                      {/* Player Info */}
                      <div style={{padding: "12px"}}>
                        <div style={{
                          fontFamily: fonts.display,
                          fontSize: 16,
                          fontWeight: 900,
                          color: isRuledOut ? T.danger : T.text,
                          letterSpacing: 1,
                          textTransform: "uppercase",
                          textDecoration: isRuledOut ? "line-through" : "none",
                          marginBottom: 6,
                          lineHeight: 1.2
                        }}>
                          {p.name}
                        </div>
                        
                        {/* Badges */}
                        <div style={{display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8}}>
                          {p.tier && (
                            <span style={{
                              fontSize: 8, fontWeight: 800, letterSpacing: 1, padding: "2px 6px",
                              fontFamily: fonts.display, textTransform: "uppercase",
                              background: p.tier==="platinum"?"#4A5E7833":p.tier==="gold"?"#F5A62322":p.tier==="silver"?"#94A3B822":"#CD7F3222",
                              border: `1px solid ${p.tier==="platinum"?"#4A5E7866":p.tier==="gold"?"#F5A62366":p.tier==="silver"?"#94A3B855":"#CD7F3255"}`,
                              color: p.tier==="platinum"?"#B0BEC5":p.tier==="gold"?"#F5A623":p.tier==="silver"?"#94A3B8":"#CD7F32",
                              clipPath: "polygon(3px 0%, 100% 0%, calc(100% - 3px) 100%, 0% 100%)"
                            }}>
                              {p.tier==="platinum"?"PLAT":p.tier==="gold"?"GOLD":p.tier==="silver"?"SILV":"BRNZ"}
                            </span>
                          )}
                          {isSafe && <span style={{fontSize:8,background:"#2ECC7122",border:"1px solid #2ECC7144",color:"#2ECC71",padding:"2px 6px",fontFamily:fonts.display,fontWeight:700,letterSpacing:1,clipPath:"polygon(3px 0%, 100% 0%, calc(100% - 3px) 100%, 0% 100%)"}}>🛡️</span>}
                          {isRuledOut && <span style={{fontSize:8,background:T.dangerBg,color:T.danger,padding:"2px 6px",fontFamily:fonts.display,fontWeight:800,letterSpacing:1}}>🚫</span>}
                        </div>
                        
                        {/* Role & IPL */}
                        <div style={{fontSize:10,color:T.muted,marginBottom:8,fontFamily:fonts.body}}>{p.role} • {p.iplTeam}</div>
                        
                        {/* Stats */}
                        <div style={{display:"flex",justifyContent:"space-between",paddingTop:8,borderTop:`1px solid ${T.border}44`}}>
                          <div style={{textAlign:"center"}}>
                            <div style={{fontFamily:fonts.display,fontSize:18,fontWeight:900,color:isRuledOut?T.danger:team.color,lineHeight:1}}>{total}</div>
                            <div style={{fontFamily:fonts.display,fontSize:7,color:T.muted,letterSpacing:1,marginTop:2}}>PTS</div>
                          </div>
                          <div style={{textAlign:"center"}}>
                            <div style={{fontFamily:fonts.display,fontSize:18,fontWeight:900,color:T.text,lineHeight:1}}>{matchesPlayed}</div>
                            <div style={{fontFamily:fonts.display,fontSize:7,color:T.muted,letterSpacing:1,marginTop:2}}>MATCHES</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>
      );
    })}
  </div>
)}
          </div>
        </div>
      </div>
    );
  })()}
{/* PLAYER STATS MODAL */}
  {playerStatsModal && (() => {
    const p = playerStatsModal;
    const assignedTeam = assignments[p.id] ? teams.find(t=>t.id===assignments[p.id]) : null;
    
    // Calculate stats - ONLY for matches while on THIS team
    let total = 0;
    const breakdown = [];
    
    if (points[p.id] && assignedTeam) {
      // Get ownership periods
      const periods = (ownershipLog[p.id] || []).filter(o => o.teamId === assignedTeam.id);
      const hasLog = periods.length > 0;
      
      for (const [matchId, matchData] of Object.entries(points[p.id])) {
        const match = matches.find(m => m.id === matchId);
        if (!match) continue;
        
        // Check ownership
        const matchDate = match.date;
        let owned = false;
        
        if (!hasLog) {
          owned = true; // Original owner
        } else {
          owned = periods.some(period => {
            const fromDate = (period.from || "").split("T")[0];
            const toDate = period.to ? period.to.split("T")[0] : "2099-01-01";
            return matchDate >= fromDate && matchDate <= toDate;
          });
        }
        
        if (!owned) continue;
        
        const cap = captains[`${matchId}_${assignedTeam.id}`] || {};
        let pts = matchData.base || 0;
        if (cap.captain === p.id) pts *= 2;
        else if (cap.vc === p.id) pts *= 1.5;
        total += Math.round(pts);
        
        breakdown.push({
          matchId: matchId,
          total: Math.round(pts),
          opponent: match.team1 === assignedTeam.name ? match.team2 : match.team1,
          ...matchData
        });
      }
    }
    
    return (
  <div onClick={() => setPlayerStatsModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(10px)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20,animation:"tb-fadeIn 0.2s ease"}}>
    <div onClick={e => e.stopPropagation()} style={{background:"rgba(10,14,22,0.95)",border:`3px solid ${assignedTeam?assignedTeam.color:T.accent}`,borderRadius:12,maxWidth:700,width:"100%",maxHeight:"85vh",overflow:"hidden",boxShadow:`0 20px 60px ${assignedTeam?assignedTeam.color+"44":T.accent+"44"}`,animation:"tb-scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"}}>
          
          {/* Header */}
          <div style={{background:assignedTeam?assignedTeam.color:T.accent,padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontFamily:fonts.display,fontSize:24,fontWeight:900,color:T.bg,letterSpacing:3,textTransform:"uppercase"}}>
                {p.name}
              </div>
              <div style={{fontSize:12,color:T.bg+"CC",marginTop:4,fontFamily:fonts.body}}>
                {p.iplTeam} • {p.role} {assignedTeam && `• ${assignedTeam.name}`}
              </div>
            </div>
            <button onClick={() => setPlayerStatsModal(null)} style={{background:"transparent",border:"none",color:T.bg,fontSize:32,cursor:"pointer",lineHeight:1,fontWeight:300}}>×</button>
          </div>

          {/* Total Stats Summary */}
          <div style={{background:assignedTeam?assignedTeam.color+"11":T.accentBg,padding:"16px 24px",borderBottom:`2px solid ${assignedTeam?assignedTeam.color:T.accent}`}}>
            <div style={{display:"flex",gap:32,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:11,color:T.muted,fontFamily:fonts.display,letterSpacing:2,textTransform:"uppercase"}}>Total Points</div>
                <div style={{fontSize:32,fontWeight:900,color:assignedTeam?assignedTeam.color:T.accent,fontFamily:fonts.display,letterSpacing:1,marginTop:4}}>{total}</div>
              </div>
              <div>
                <div style={{fontSize:11,color:T.muted,fontFamily:fonts.display,letterSpacing:2,textTransform:"uppercase"}}>Matches Played</div>
                <div style={{fontSize:32,fontWeight:900,color:T.text,fontFamily:fonts.display,letterSpacing:1,marginTop:4}}>{breakdown.filter(m=>m.total>0).length}</div>
              </div>
              <div>
                <div style={{fontSize:11,color:T.muted,fontFamily:fonts.display,letterSpacing:2,textTransform:"uppercase"}}>Average</div>
                <div style={{fontSize:32,fontWeight:900,color:T.text,fontFamily:fonts.display,letterSpacing:1,marginTop:4}}>
                  {breakdown.filter(m=>m.total>0).length > 0 ? Math.round(total / breakdown.filter(m=>m.total>0).length) : 0}
                </div>
              </div>
            </div>
          </div>

          {/* Match-by-Match Breakdown */}
          <div style={{padding:"20px 24px",overflowY:"auto",maxHeight:"calc(85vh - 240px)"}}>
            <div style={{fontSize:13,color:T.muted,fontFamily:fonts.display,letterSpacing:2,textTransform:"uppercase",marginBottom:16,fontWeight:700}}>
              Match by Match Performance
            </div>
            
            {breakdown.length === 0 ? (
              <div style={{textAlign:"center",padding:40,color:T.muted}}>No match data yet</div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {breakdown.map((m, idx) => {
                  const matchData = matches.find(match => match.id === m.matchId);
                  return (
                    <div key={idx} style={{
                      background:m.total>0?T.card:T.bg,
                      border:`2px solid ${m.total>0?(assignedTeam?assignedTeam.color+"44":T.accentBorder):T.border}`,
                      borderLeft:`5px solid ${m.total>0?(assignedTeam?assignedTeam.color:T.accent):T.border}`,
                      borderRadius:0,
                      padding:"14px 18px"
                    }}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                        <div>
                          <div style={{fontFamily:fonts.display,fontSize:14,fontWeight:800,color:T.text,letterSpacing:1}}>
                            {matchData ? `${matchData.team1} vs ${matchData.team2}` : `Match ${idx+1}`}
                          </div>
                          <div style={{fontSize:10,color:T.muted,marginTop:2}}>
                            {matchData?.date || 'Date unknown'} • {m.opponent || 'Opponent'}
                          </div>
                        </div>
                        <div style={{
                          fontFamily:fonts.display,
                          fontSize:28,
                          fontWeight:900,
                          color:m.total>0?(assignedTeam?assignedTeam.color:T.accent):T.muted,
                          letterSpacing:1
                        }}>
                          {m.total || 0}
                        </div>
                      </div>
                      
                      {/* Performance breakdown */}
                      <div style={{display:"flex",gap:16,fontSize:11,color:T.muted,flexWrap:"wrap"}}>
                        {m.runs !== undefined && <span>🏏 {m.runs} runs</span>}
                        {m.wickets !== undefined && <span>🎯 {m.wickets} wickets</span>}
                        {m.catches !== undefined && <span>🧤 {m.catches} catches</span>}
                        {m.stumpings !== undefined && <span>🧤 {m.stumpings} stumpings</span>}
                        {m.runOuts !== undefined && <span>🏃 {m.runOuts} run outs</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  })()}

{/* ALL PLAYERS MANAGEMENT MODAL */}
  {showAllPlayersModal && (
    <div onClick={() => setShowAllPlayersModal(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20,overflowY:"auto"}}>
      <div onClick={e => e.stopPropagation()} style={{background:T.bg,border:`3px solid ${T.accent}`,borderRadius:0,maxWidth:1200,width:"100%",maxHeight:"90vh",overflow:"hidden",boxShadow:`8px 8px 0 ${T.accent}66`}}>
        
        {/* Header */}
        <div style={{background:T.accent,padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontFamily:fonts.display,fontSize:24,fontWeight:900,color:T.bg,letterSpacing:3,textTransform:"uppercase"}}>
            ALL PLAYERS MANAGEMENT
          </div>
          <button onClick={() => setShowAllPlayersModal(false)} style={{background:"transparent",border:"none",color:T.bg,fontSize:32,cursor:"pointer",lineHeight:1,fontWeight:300}}>×</button>
        </div>

        {/* Filters */}
        <div style={{padding:"16px 24px",background:T.card,borderBottom:`2px solid ${T.border}`,display:"flex",gap:12,flexWrap:"wrap"}}>
          <input
            type="text"
            placeholder="Search player name..."
            value={playerSearch}
onChange={e=>setPlayerSearch(e.target.value)}
            style={{flex:1,minWidth:200,background:T.bg,border:`2px solid ${T.border}`,borderRadius:0,padding:"10px 14px",color:T.text,fontSize:14,fontFamily:fonts.body,outline:"none"}}
          />
          <select value={roleFilter||"All"} onChange={e=>setRoleFilter(e.target.value==="All"?null:e.target.value)} style={{background:T.bg,border:`2px solid ${T.border}`,borderRadius:0,padding:"10px 14px",color:T.text,fontSize:13,fontFamily:fonts.display,fontWeight:700,letterSpacing:1,cursor:"pointer"}}>
  {ROLES.map(r=><option key={r}>{r}</option>)}
</select>
          <select value={teamFilter||"All Teams"} onChange={e=>setTeamFilter(e.target.value==="All Teams"?null:e.target.value)} style={{background:T.bg,border:`2px solid ${T.border}`,borderRadius:0,padding:"10px 14px",color:T.text,fontSize:13,fontFamily:fonts.display,fontWeight:700,letterSpacing:1,cursor:"pointer"}}>
            <option>All Teams</option>
            {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            <option value="unassigned">Unassigned</option>
          </select>
        </div>

        {/* Bulk actions */}
        {unlocked && selectedBulk.length > 0 && (
          <div style={{background:T.accentBg,padding:"12px 24px",borderBottom:`2px solid ${T.accentBorder}`,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <div style={{fontSize:13,color:T.accent,fontWeight:700,fontFamily:fonts.display,letterSpacing:1}}>{selectedBulk.length} SELECTED</div>
            {[["platinum","PLATINUM","#B0BEC5","#4A5E7833","#4A5E7866"],["gold","GOLD","#F5A623","#F5A62322","#F5A62366"],["silver","SILVER","#94A3B8","#94A3B822","#94A3B855"],["bronze","BRONZE","#CD7F32","#CD7F3222","#CD7F3255"]].map(([t,label,col,bg,br])=>(
              <button key={t} onClick={()=>{const updated=players.map(p=>selectedBulk.includes(p.id)?{...p,tier:t}:p);setPlayers(updated);storeSet("players",updated);setSelectedBulk([]);}} style={{background:bg,border:`2px solid ${br}`,borderRadius:0,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:800,fontFamily:fonts.display,color:col,letterSpacing:1.5,clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)"}}>{label}</button>
            ))}
            <button onClick={()=>{const updated=players.map(p=>selectedBulk.includes(p.id)?{...p,tier:""}:p);setPlayers(updated);storeSet("players",updated);setSelectedBulk([]);}} style={{background:"transparent",border:`2px solid ${T.border}`,borderRadius:0,padding:"6px 12px",cursor:"pointer",fontSize:11,fontFamily:fonts.display,color:T.muted,letterSpacing:1.5}}>CLEAR TIER</button>
            <button onClick={()=>setSelectedBulk([])} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:11,marginLeft:"auto",fontFamily:fonts.display,letterSpacing:1}}>DESELECT ALL</button>
          </div>
        )}

        {/* Players list */}
        <div style={{padding:"20px 24px",overflowY:"auto",maxHeight:"calc(90vh - 240px)"}}>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {(() => {
  // Filter players
  let filteredPlayers = players.filter(p => {
    if (playerSearch && !p.name.toLowerCase().includes(playerSearch.toLowerCase()) && !p.iplTeam.toLowerCase().includes(playerSearch.toLowerCase())) return false;
    if (roleFilter && p.role !== roleFilter) return false;
    if (teamFilter && teamFilter !== "unassigned" && assignments[p.id] !== teamFilter) return false;
    if (teamFilter === "unassigned" && assignments[p.id]) return false;
    return true;
  });
  
  return filteredPlayers.map(p => {
    const aTeam = teams.find(t=>t.id===assignments[p.id]);
    const isAssigned = !!assignments[p.id];
    const isRuledOut = ruledOut.includes(p.id);
    const isSafe = isAssigned && isPlayerSafeForTeam(assignments[p.id], p.id);
              
              return (
                <div key={p.id} style={{
                  padding:"12px 16px",
                  background:T.card,
                  borderRadius:0,
                  borderLeft:`5px solid ${isRuledOut?T.danger:aTeam?aTeam.color:T.border}`,
                  border:`2px solid ${isRuledOut?T.danger+"44":aTeam?aTeam.color+"44":T.border}`,
                  display:"flex",
                  alignItems:"center",
                  gap:12,
                  flexWrap:"wrap"
                }}>
                  {/* Checkbox */}
                  {unlocked && (
                    <input type="checkbox" checked={selectedBulk.includes(p.id)} onChange={e=>setSelectedBulk(prev=>e.target.checked?[...prev,p.id]:prev.filter(x=>x!==p.id))} style={{width:16,height:16,cursor:"pointer",accentColor:T.accent,flexShrink:0}} />
                  )}
                  
                  {/* Player info */}
                  <div style={{flex:1,minWidth:200}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                      <span style={{fontFamily:fonts.display,fontSize:15,fontWeight:800,color:isRuledOut?T.danger:T.text,letterSpacing:1,textDecoration:isRuledOut?"line-through":"none"}}>{p.name}</span>
                      {p.tier && <span style={{fontSize:9,fontWeight:800,letterSpacing:1,padding:"2px 6px",fontFamily:fonts.display,textTransform:"uppercase",background:p.tier==="platinum"?"#4A5E7833":p.tier==="gold"?"#F5A62322":p.tier==="silver"?"#94A3B822":"#CD7F3222",border:`1px solid ${p.tier==="platinum"?"#4A5E7866":p.tier==="gold"?"#F5A62366":p.tier==="silver"?"#94A3B855":"#CD7F3255"}`,color:p.tier==="platinum"?"#B0BEC5":p.tier==="gold"?"#F5A623":p.tier==="silver"?"#94A3B8":"#CD7F32"}}>{p.tier.toUpperCase()}</span>}
                      {isRuledOut && <span style={{fontSize:10,background:T.dangerBg,color:T.danger,padding:"2px 6px",fontFamily:fonts.display,fontWeight:800,letterSpacing:1}}>🚫 RULED OUT</span>}
                      {isSafe && <span style={{fontSize:10,background:"#2ECC7122",border:"1px solid #2ECC7144",color:"#2ECC71",padding:"2px 6px",fontFamily:fonts.display,fontWeight:700,letterSpacing:1}}>🛡️ SAFE</span>}
                    </div>
                    <div style={{fontSize:11,color:T.muted,fontFamily:fonts.body}}>
                      {p.iplTeam} • {p.role} {isAssigned && <span style={{marginLeft:8,color:aTeam?.color,fontWeight:700}}>→ {aTeam?.name}</span>}
                    </div>
                  </div>

                  {/* Team assignment */}
                  <select
                    value={assignments[p.id]||""}
                    onChange={e=>assignPlayer(p.id,e.target.value)}
                    disabled={!unlocked}
                    style={{background:aTeam?aTeam.color+"22":T.card,border:`2px solid ${aTeam?aTeam.color:T.border}`,borderRadius:0,padding:"8px 12px",color:aTeam?aTeam.color:T.muted,fontSize:12,fontFamily:fonts.display,fontWeight:700,letterSpacing:1,cursor:unlocked?"pointer":"not-allowed",minWidth:150,opacity:unlocked?1:0.6}}
                  >
                    <option value="">{isAssigned?"Move to…":"— Assign —"}</option>
                    {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>

                  {/* Action buttons */}
{unlocked && (
  <div style={{display:"flex",gap:6,flexShrink:0}}>
    {isAssigned && (
      <button onClick={()=>removePlayer(p.id)} style={{background:T.dangerBg,border:`2px solid ${T.danger}`,color:T.danger,borderRadius:0,padding:"6px 10px",cursor:"pointer",fontSize:12,fontFamily:fonts.display,fontWeight:700}}>✕</button>
    )}
    <button onClick={()=>{console.log("Edit button clicked", p); setEditPlayer(p);}} style={{background:T.infoBg,border:`2px solid ${T.info}`,color:T.info,borderRadius:0,padding:"6px 10px",cursor:"pointer",fontSize:12,fontFamily:fonts.display,fontWeight:700}}>✏️</button>
    {isAssigned && (
      <button onClick={()=>toggleSafePlayer(assignments[p.id],p.id)} style={{background:isSafe?"#2ECC7133":"transparent",border:`2px solid ${isSafe?"#2ECC71":T.border}`,color:isSafe?"#2ECC71":T.muted,borderRadius:0,padding:"6px 10px",cursor:"pointer",fontSize:12}}>🛡️</button>
    )}
    <button onClick={()=>withPassword(()=>toggleRuledOut(p.id))} style={{background:isRuledOut?T.dangerBg:"transparent",border:`2px solid ${T.danger}`,color:T.danger,borderRadius:0,padding:"6px 10px",cursor:"pointer",fontSize:12,fontFamily:fonts.display,fontWeight:700}}>🚫</button>
    <button onClick={()=>deletePlayer(p.id)} style={{background:T.dangerBg,border:`2px solid ${T.danger}`,color:T.danger,borderRadius:0,padding:"6px 10px",cursor:"pointer",fontSize:11,fontFamily:fonts.display,fontWeight:700}}>🗑️</button>
  </div>
)}
                </div>
             );
            });
          })()}
          </div>
        </div>
      </div>
    </div>
  )}
  
</>}
  
            </div>
          )}

          {page==="matches"&&(
            <MatchesPage
              tournaments={tournaments}
              setTournaments={setTournaments}
              matches={matches}
              updMatches={updMatches}
              points={points}
              updPoints={updPoints}
              captains={captains}
              liveScores={liveScores}
              unlocked={unlocked}
              isGuest={isGuest}
              withPassword={withPassword}
              storeSet={storeSet}
              pushNotif={pushNotif}
              setCaptainMatch={setCaptainMatch}
              setSmartStatsMatch={setSmartStatsMatch}
              setConfirmAction={setConfirmAction}
              setAddTournamentModal={setAddTournamentModal}
              setFetchPlayerModal={setFetchPlayerModal}
              setAiMatchModal={setAiMatchModal}
              fetchMatchesForTournament={fetchMatchesForTournament}
              fetchFromCricketData={fetchFromCricketData}
            />
          )}

          {page==="transfer" && (
            <TransferPage
              pitch={pitch}
              teams={teams}
              players={players}
              assignments={assignments}
              transfers={transfers}
              unsoldPool={unsoldPool}
              leaderboard={leaderboard}
              isAdmin={isAdmin}
              myTeam={myTeam}
              unlocked={unlocked}
              withPassword={withPassword}
              ownershipLog={ownershipLog}
              points={points}
              user={user}
              pitchConfig={pitchConfig}
              ruledOut={ruledOut}
              safePlayers={safePlayers}
              snatch={snatch}
              matches={matches}
              captains={captains}
              teamIdentity={teamIdentity}
              pushNotif={pushNotif}
              storeGet={storeGet}
              storeSet={storeSet}
              onUpdateTransfers={(val)=>{setTransfers(val);storeSet("transfers",val);}}
              onUpdateAssignments={updAssign}
              onUpdateUnsoldPool={async (pid, action) => {
  // If called with full array (no action), just save directly
  if (Array.isArray(pid)) {
    setUnsoldPool(pid);
    storeSet("unsoldPool", pid);
    return;
  }
  // Fetch FRESH from Supabase every time to prevent race condition
  const latest = await storeGet("unsoldPool") || [];
  const merged = action === "add"
    ? (latest.includes(pid) ? latest : [...latest, pid])
    : latest.filter(id => id !== pid);
  setUnsoldPool(merged);
  storeSet("unsoldPool", merged);
}}
              onUpdateOwnershipLog={(val)=>{setOwnershipLog(val);storeSet("ownershipLog",val);}}
              onUpdatePoints={updPoints}
              onUpdateSnatch={(val)=>{setSnatch(val);storeSet("snatch",val);}}
              onUpdateSafePlayers={(val)=>{setSafePlayers(val);storeSet("safePlayers",val);}}
            />
          )}

          {page==="results" && (
            <ResultsPage
              matches={matches}
              points={points}
              teams={teams}
              players={players}
              captains={captains}
              assignments={assignments}
              ownershipLog={ownershipLog}
              snatch={snatch}
              ruledOut={ruledOut}
              nav={nav}
            />
          )}
          {page==="form" && (
            <div className="fade-in">
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
                <button onClick={()=>nav("leaderboard")} style={{background:"transparent",border:"none",color:T.muted,fontSize:22,cursor:"pointer",lineHeight:1,padding:"0 4px"}}>←</button>
                <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:T.accent,letterSpacing:2}}>PLAYER FORM</h2>
              </div>
              <FormChart players={players} assignments={assignments} points={points} teams={teams} matches={matches} snatch={snatch} />
            </div>
          )}

          {page==="h2h" && (
            <div className="fade-in">
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
                <button onClick={()=>nav("leaderboard")} style={{background:"transparent",border:"none",color:T.muted,fontSize:22,cursor:"pointer",lineHeight:1,padding:"0 4px"}}>←</button>
                <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:T.accent,letterSpacing:2}}>HEAD TO HEAD</h2>
              </div>
              <H2HStats teams={teams} matches={matches} points={points} assignments={assignments} players={players} captains={captains} ownershipLog={ownershipLog} snatch={snatch} />
            </div>
          )}

          {page==="leaderboard"&&(
            <LeaderboardPage
              leaderboard={leaderboard}
              teams={teams}
              players={players}
              assignments={assignments}
              points={points}
              matches={matches}
              snatch={snatch}
              ruledOut={ruledOut}
              notifications={notifications}
              pointsReady={pointsReady}
              pointsConfig={pointsConfig}
              pitchConfig={pitchConfig}
              ruleProposal={ruleProposal}
              eligibleVoters={eligibleVoters}
              tournamentStarted={tournamentStarted}
              myTeam={myTeam}
              teamIdentity={teamIdentity}
              unlocked={unlocked}
              isAdmin={isAdmin}
              transfers={transfers}
              votePin={votePin}
              setVotePin={setVotePin}
              votePinErr={votePinErr}
              setVotePinErr={setVotePinErr}
              getPlayerBreakdown={getPlayerBreakdown}
              shareLeaderboard={shareLeaderboard}
              proposeRuleChange={proposeRuleChange}
              savePointsConfig={savePointsConfig}
              updRuleProposal={updRuleProposal}
              voteOnProposal={voteOnProposal}
              withPassword={withPassword}
              storeGet={storeGet}
              storeSet={storeSet}
              setPitchConfig={setPitchConfig}
              updTransfers={updTransfers}
              pushNotif={pushNotif}
              setShowMvpModal={setShowMvpModal}
            />
          )}

        {/* LEAGUE RULES PANEL */}
        {showRulesPanel && (
          <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",zIndex:200,overflowY:"auto",padding:24,fontFamily:fonts.body}}>
            <div style={{maxWidth:900,margin:"0 auto"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
                <button onClick={()=>setShowRulesPanel(false)} style={{background:"transparent",border:"none",color:T.muted,fontSize:22,cursor:"pointer",padding:"0 4px"}}>←</button>
                <div style={{fontFamily:fonts.display,fontSize:26,fontWeight:700,color:T.accent,letterSpacing:2}}>POINTS & RULES</div>
              </div>

             {/* Points System - Tiled Grid */}
              <div style={{marginBottom:16}}>
                <style>{`
                  @media(min-width:600px){.pts-grid{display:grid!important;grid-template-columns:1fr 1fr;gap:10px;}}
                  @media(max-width:599px){.pts-grid{display:flex!important;flex-direction:column;gap:8px;}}
                `}</style>
                <div className="pts-grid" style={{marginBottom:10}}>
                  {[
                    {label:"🏏 BATTING", color:T.accent, items:[
                      {name:"Per Run", val:pointsConfig.run, unit:"pt", pos:true},
                      {name:"Per Four", val:pointsConfig.four, unit:"pts", pos:true},
                      {name:"Per Six", val:pointsConfig.six, unit:"pts", pos:true},
                      {name:"Half-Century (50+)", val:pointsConfig.fifty, unit:"pts", pos:true},
                      {name:"Century (100+)", val:pointsConfig.century, unit:"pts", pos:true},
                      {name:"SR Bonus (SR>"+pointsConfig.srBonusThreshold+")", val:pointsConfig.srBonus, unit:"pts", pos:true},
                      {name:"Duck Penalty", val:pointsConfig.duckPenalty, unit:"pts", pos:false},
                      {name:"SR Penalty (SR<"+pointsConfig.srPenaltyThreshold+")", val:pointsConfig.srPenalty, unit:"pts", pos:false},
                    ]},
                    {label:"🎳 BOWLING", color:T.info, items:[
                      {name:"Per Wicket", val:pointsConfig.wicket, unit:"pts", pos:true},
                      {name:"4-Wicket Haul", val:pointsConfig.fourWkt, unit:"pts", pos:true},
                      {name:"5-Wicket Haul", val:pointsConfig.fiveWkt, unit:"pts", pos:true},
                      {name:"Economy Bonus (<"+pointsConfig.ecoThreshold+")", val:pointsConfig.ecoBonus, unit:"pts", pos:true},
                      {name:"Maiden Over", val:pointsConfig.maiden, unit:"pts", pos:true},
                      {name:"Economy Penalty (>"+pointsConfig.ecoPenaltyThreshold+")", val:pointsConfig.ecoPenalty, unit:"pts", pos:false},
                    ]},
                    {label:"🧤 FIELDING", color:T.success, items:[
                      {name:"Catch", val:pointsConfig.catch, unit:"pts", pos:true},
                      {name:"Stumping", val:pointsConfig.stumping, unit:"pts", pos:true},
                      {name:"Run-out", val:pointsConfig.runout, unit:"pts", pos:true},
                    ]},
                    {label:"⭐ BONUSES", color:"#A855F7", items:[
                      {name:"All-round ("+pointsConfig.allRoundMinRuns+"+R & "+pointsConfig.allRoundMinWkts+"+W)", val:pointsConfig.allRoundBonus, unit:"pts", pos:true},
                      {name:"Longest Six", val:pointsConfig.longestSix, unit:"pts", pos:true},
                      {name:"Man of the Match", val:pointsConfig.momBonus, unit:"pts", pos:true},
                      {name:"Playing XI", val:pointsConfig.playingXIBonus, unit:"pts", pos:true},
                      {name:"Captain Multiplier", val:pointsConfig.captainMult, unit:"×", pos:true},
                      {name:"VC Multiplier", val:pointsConfig.vcMult, unit:"×", pos:true},
                    ]},
                  ].map(section => (
                    <div key={section.label} style={{background:T.card,border:`2px solid ${section.color}33`,borderTop:`3px solid ${section.color}`,borderRadius:0,overflow:"hidden",clipPath:"polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)"}}>
                      <div style={{background:section.color+"18",padding:"10px 14px",borderBottom:`1px solid ${section.color}33`}}>
                        <div style={{fontFamily:fonts.display,fontSize:16,fontWeight:900,color:section.color,letterSpacing:3,textTransform:"uppercase"}}>{section.label}</div>
                      </div>
                      <div style={{padding:"4px 14px 10px"}}>
                        {section.items.map(item => (
                          <div key={item.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${T.border}22`,opacity:item.val===0?0.3:1}}>
                            <div style={{fontFamily:fonts.body,fontSize:13,color:item.val===0?T.muted:T.text}}>
                              {item.name}
                              {item.val===0 && <span style={{fontSize:10,color:"#2D3E52",marginLeft:6,letterSpacing:1}}>DISABLED</span>}
                            </div>
                            <div style={{fontFamily:fonts.display,fontSize:20,fontWeight:900,color:item.val===0?"#2D3E52":item.pos?"#F5A623":"#FF3D5A",letterSpacing:1}}>
                              {item.pos?"+":"-"}{item.val}
                              <span style={{fontSize:11,color:T.muted,fontWeight:400,marginLeft:2}}>{item.unit}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {(!ruleProposal || ruleProposal.status !== "pending") && (
                  <button onClick={()=>withPassword(()=>setShowRulesPanel("points"))} style={{width:"100%",background:T.accentBg,border:`1px solid ${T.accentBorder}`,borderRadius:0,padding:12,color:T.accent,fontFamily:fonts.display,fontWeight:800,fontSize:14,letterSpacing:2,cursor:"pointer",clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)"}}>
                    ✏️ {(!tournamentStarted||!eligibleVoters.length)?"EDIT POINTS — ADMIN":"PROPOSE POINTS CHANGE — NEEDS TEAM VOTE"}
                  </button>
                )}
              </div>

              {/* Timing Rules */}
              <div style={{background:T.card,border:`2px solid ${T.border}`,borderTop:`3px solid #4F8EF7`,borderRadius:0,marginBottom:16,overflow:"hidden",clipPath:"polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)"}}>
                <div style={{background:"#4F8EF718",padding:"10px 14px",borderBottom:"1px solid #4F8EF733"}}>
                  <div style={{fontFamily:fonts.display,fontSize:16,fontWeight:900,color:"#4F8EF7",letterSpacing:3}}>⏰ TIMING RULES</div>
                </div>
                <div style={{padding:"4px 14px 10px"}}>
                  {[
                    ["Transfer Window", `${pitchConfig?.transferStart || "Sunday 11:59 PM"} → ${pitchConfig?.transferEnd || "Monday 11:00 AM"} IST`],
                    ["Snatch Window", pitchConfig?.snatchWindow ? pitchConfig.snatchWindow.replace(" to ", " → ") + " IST" : "Saturday 12:00 AM → 12:00 PM IST"],
                    ["Snatch Return", `${pitchConfig?.snatchReturn || "Friday 11:58 PM"} IST`],
                  ].map(([label, val]) => (
                    <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${T.border}22`}}>
                      <div style={{fontFamily:fonts.body,fontSize:13,color:T.muted,letterSpacing:0.5}}>{label}</div>
                      <div style={{fontFamily:fonts.display,fontSize:15,fontWeight:800,color:T.text,letterSpacing:1}}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pending proposal */}
              {ruleProposal && ruleProposal.status === "pending" && (
                <div style={{background:T.accentBg,borderRadius:12,border:`1px solid ${T.accentBorder}`,padding:20,marginBottom:16}}>
                  <div style={{fontSize:11,color:T.accent,letterSpacing:2,fontWeight:700,marginBottom:4}}>⏳ PENDING PROPOSAL</div>
                  <div style={{fontSize:11,color:T.muted,marginBottom:12}}>Proposed by {teams.find(t=>t.id===ruleProposal.proposedBy)?.name || "Admin"} • {new Date(ruleProposal.proposedAt).toLocaleDateString()}</div>
                  {Object.entries(ruleProposal.changes).map(([key, val]) => (
                    <div key={key} style={{padding:"6px 0",borderBottom:`1px solid ${T.border}33`}}>
                      <div style={{fontSize:11,color:T.muted,marginBottom:key==="Points Change"?6:0}}>{key}</div>
                      {key === "Points Change" ? (() => {
                        try {
                          const proposed = JSON.parse(val);
                          return (
                            <div style={{display:"flex",flexDirection:"column",gap:5}}>
                              {Object.entries(proposed).filter(([k,v]) => pointsConfig[k] !== undefined && pointsConfig[k] !== v).map(([k,v]) => (
                                <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",borderRadius:6,background:"#F5A62318",border:"1px solid #F5A62344"}}>
                                  <span style={{fontSize:13,color:T.text,fontWeight:600}}>{k}</span>
                                  <span style={{fontSize:14,fontWeight:800,color:"#F5A623"}}>
                                    <span style={{fontSize:12,color:T.muted,fontWeight:400,marginRight:6}}>{pointsConfig[k]} →</span>
                                    {v}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        } catch { return <span style={{fontSize:12,color:T.accent,fontWeight:700}}>{val}</span>; }
                      })() : (
                        <div style={{fontSize:12,color:T.accent,fontWeight:700,textAlign:"right"}}>{val}</div>
                      )}
                    </div>
                  ))}
                  <div style={{marginTop:12}}>
                    <div style={{fontSize:11,color:T.muted,marginBottom:8}}>VOTES ({Object.keys(ruleProposal.votes).length}/{eligibleVoters.length}):</div>
                    {eligibleVoters.map(t => (
                      <div key={t.id} style={{display:"flex",justifyContent:"space-between",padding:"4px 0"}}>
                        <div style={{fontSize:12,color:t.color}}>{t.name}</div>
                        <div style={{fontSize:12,fontWeight:700,color:ruleProposal.votes[t.id]==="approved"?"#2ECC71":ruleProposal.votes[t.id]==="rejected"?"#FF3D5A":"#4A5E78"}}>{ruleProposal.votes[t.id]||"Pending"}</div>
                      </div>
                    ))}
                  </div>
                  {myTeam && eligibleVoters.some(t=>t.id===myTeam.id) && !ruleProposal.votes[myTeam.id] && (
                    <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${T.border}`}}>
                      <div style={{fontSize:12,color:T.text,marginBottom:8}}>Cast your vote as <span style={{color:myTeam.color,fontWeight:700}}>{myTeam.name}</span></div>
                      <input type="password" value={votePin} onChange={e=>{setVotePin(e.target.value);setVotePinErr('');}} placeholder="Enter your team PIN" maxLength={6}
                        style={{width:"100%",background:T.bg,border:"1px solid "+(votePinErr?"#FF3D5A":"#1E2D45"),borderRadius:8,padding:"10px 14px",color:T.text,fontSize:18,letterSpacing:4,textAlign:"center",fontFamily:fonts.display,outline:"none",marginBottom:votePinErr?6:12,boxSizing:"border-box"}} />
                      {votePinErr && <div style={{color:T.danger,fontSize:12,marginBottom:10,textAlign:"center"}}>{votePinErr}</div>}
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>voteOnProposal(false)} style={{flex:1,background:T.dangerBg,border:`1px solid ${T.danger}44`,borderRadius:8,padding:10,color:T.danger,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>✕ REJECT</button>
                        <button onClick={()=>voteOnProposal(true)} style={{flex:1,background:T.successBg,border:`1px solid ${T.success}44`,borderRadius:8,padding:10,color:T.success,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>✓ APPROVE</button>
                      </div>
                    </div>
                  )}
                  <button onClick={()=>withPassword(()=>updRuleProposal(null))} style={{width:"100%",marginTop:10,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:8,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:12,cursor:"pointer"}}>CANCEL PROPOSAL (Admin)</button>
                </div>
              )}

              {ruleProposal && ruleProposal.status !== "pending" && (
                <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:16,marginBottom:16}}>
                  <div style={{fontSize:11,color:ruleProposal.status==="approved"?"#2ECC71":"#FF3D5A",letterSpacing:2,fontWeight:700}}>
                    {ruleProposal.status==="approved"?"✓ LAST PROPOSAL APPROVED":"✕ LAST PROPOSAL REJECTED"}
                  </div>
                </div>
              )}

              {showRulesPanel === "points" && unlocked && (
                <EditPointsForm config={pointsConfig} onSave={async(cfg)=>{
                  if(!tournamentStarted || !eligibleVoters.length) {
                    await savePointsConfig(cfg);
                    setShowRulesPanel(true);
                    alert("Points system updated!");
                  } else {
                    await proposeRuleChange({"Points Change": JSON.stringify(cfg)});
                    setShowRulesPanel(true);
                  }
                }} onCancel={()=>setShowRulesPanel(true)} />
              )}

              {showRulesPanel === true && (!ruleProposal || ruleProposal.status !== "pending") && (
                <ProposeRulesForm teams={teams} eligibleVoters={eligibleVoters} tournamentStarted={tournamentStarted} onPropose={proposeRuleChange} withPassword={withPassword} isAdmin={isAdmin}
                  onApplyDirect={async (changes) => {
                    const existingConfig = await storeGet("pitchConfig") || {};
                    const newConfig = {
                      ...existingConfig,
                      ...(changes["Transfer Start"] ? { transferStart: changes["Transfer Start"] } : {}),
                      ...(changes["Transfer End"] ? { transferEnd: changes["Transfer End"] } : {}),
                      ...(changes["Snatch Return"] ? { snatchReturn: changes["Snatch Return"] } : {}),
                      ...(changes["Snatch Window"] ? { snatchWindow: changes["Snatch Window"] } : {}),
                    };
                    await storeSet("pitchConfig", newConfig);
                    setPitchConfig(newConfig);
                    if (transfers.phase === 'release') {
                      const resetTransfers = { ...transfers, phase: 'closed', releaseDeadline: null };
                      updTransfers(resetTransfers);
                      pushNotif("system", "✅ Config applied — transfer window closed. Will reopen at new time.", "⚙️");
                    } else {
                      pushNotif("system", "✅ Config applied directly — no vote needed.", "⚙️");
                    }
                  }}
                />
              )}
            </div>
          </div>
        )}

        {/* ADD TOURNAMENT MODAL */}
        {addTournamentModal && (
          <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:24,fontFamily:fonts.body}}>
            <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.border}`,padding:28,width:"100%",maxWidth:420}}>
              <div style={{fontFamily:fonts.display,fontSize:22,fontWeight:700,color:T.accent,letterSpacing:2,marginBottom:4}}>ADD TOURNAMENT</div>
              <div style={{fontSize:12,color:T.muted,marginBottom:20}}>Choose source then search for your tournament</div>

              {!addTournamentSource ? (
                <div>
                  <div style={{fontSize:11,color:T.muted,letterSpacing:2,marginBottom:10}}>SELECT SOURCE</div>
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={()=>{setAddTournamentSource('cb');fetchTournamentSeriesSuggestions('cb');}}
                      style={{flex:1,background:T.accentBg,border:"2px solid #F5A62344",borderRadius:10,padding:"14px 10px",cursor:"pointer",textAlign:"center"}}>
                      <div style={{fontSize:20,marginBottom:4}}>🟠</div>
                      <div style={{fontWeight:700,fontSize:14,color:T.accent}}>Cricbuzz</div>
                      <div style={{fontSize:10,color:T.muted,marginTop:2}}>100 req/month</div>
                    </button>
                    <button onClick={()=>{setAddTournamentSource('cd');fetchTournamentSeriesSuggestions('cd');}}
                      style={{flex:1,background:T.successBg,border:"2px solid #2ECC7144",borderRadius:10,padding:"14px 10px",cursor:"pointer",textAlign:"center"}}>
                      <div style={{fontSize:20,marginBottom:4}}>🟢</div>
                      <div style={{fontWeight:700,fontSize:14,color:T.success}}>CricketData</div>
                      <div style={{fontSize:10,color:T.muted,marginTop:2}}>100 req/day</div>
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                    <button onClick={()=>{setAddTournamentSource(null);setAddTournamentSeries([]);setAddTournamentSeriesInput('');setAddTournamentSelected(null);}}
                      style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:18,padding:0}}>←</button>
                    <div style={{fontSize:13,color:addTournamentSource==='cb'?"#F5A623":"#2ECC71",fontWeight:700}}>
                      {addTournamentSource==='cb'?"🟠 Cricbuzz":"🟢 CricketData"}
                    </div>
                  </div>
                  <div style={{fontSize:11,color:T.muted,letterSpacing:2,marginBottom:8}}>SEARCH TOURNAMENT</div>
                  <input value={addTournamentSeriesInput} onChange={e=>setAddTournamentSeriesInput(e.target.value)}
                    placeholder="Search tournament..." autoFocus
                    style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontSize:14,fontFamily:fonts.body,outline:"none",marginBottom:8,boxSizing:"border-box"}} />
                  {addTournamentSeriesLoading ? (
                    <div style={{textAlign:"center",padding:16,color:T.muted,fontSize:13}}>Fetching tournaments...</div>
                  ) : (
                    <div style={{maxHeight:220,overflowY:"auto",border:`1px solid ${T.border}`,borderRadius:8,marginBottom:12}}>
                      {addTournamentSeries
                        .filter(s=>!addTournamentSeriesInput||s.name.toLowerCase().includes(addTournamentSeriesInput.toLowerCase()))
                        .slice(0,25)
                        .map(s=>(
                          <div key={s.id} onClick={()=>setAddTournamentSelected(s)}
                            style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid #1E2D4433",background:addTournamentSelected?.id===s.id?"#F5A62322":"transparent",color:addTournamentSelected?.id===s.id?"#F5A623":"#E2EAF4",fontSize:13}}>
                            {s.name}
                            {addTournamentSelected?.id===s.id&&<span style={{marginLeft:8}}>✓</span>}
                          </div>
                        ))}
                      {addTournamentSeries.filter(s=>!addTournamentSeriesInput||s.name.toLowerCase().includes(addTournamentSeriesInput.toLowerCase())).length===0&&(
                        <div style={{padding:16,color:T.muted,fontSize:13,textAlign:"center"}}>No tournaments found</div>
                      )}
                    </div>
                  )}
                  {addTournamentSelected&&(
                    <div style={{background:T.accentBg,border:`1px solid ${T.accentBorder}`,borderRadius:8,padding:"8px 12px",marginBottom:4,fontSize:12,color:T.accent}}>
                      Selected: <strong>{addTournamentSelected.name}</strong>
                    </div>
                  )}
                </div>
              )}

              <div style={{display:"flex",gap:10,marginTop:16}}>
                <button onClick={()=>{setAddTournamentModal(false);setAddTournamentSource(null);setAddTournamentSeries([]);setAddTournamentSeriesInput('');setAddTournamentSelected(null);}}
                  style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:11,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
                {addTournamentSelected&&(
                  <button onClick={confirmAddTournament}
                    style={{flex:2,background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,border:"none",borderRadius:8,padding:11,color:T.bg,fontFamily:fonts.body,fontWeight:800,fontSize:15,cursor:"pointer"}}>ADD TOURNAMENT</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* FETCH PLAYERS MODAL */}
        {/* AI Match Generator Modal */}
        {aiMatchModal && (
          <div style={{position:"fixed",inset:0,background:"rgba(5,8,16,0.95)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:20}}>
            <div style={{background:T.card,borderRadius:18,border:`1px solid ${T.purple}44`,padding:28,width:"100%",maxWidth:420,boxShadow:"0 24px 80px rgba(0,0,0,0.7)"}}>
              <div style={{textAlign:"center",marginBottom:20}}>
                <div style={{fontSize:36,marginBottom:8}}>🤖</div>
                <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:20,color:T.purple,letterSpacing:1,marginBottom:4}}>AI MATCH GENERATOR</div>
                <div style={{fontFamily:fonts.body,fontSize:13,color:T.muted}}>
                  Extracting matches for <span style={{color:T.text,fontWeight:600}}>{aiMatchModal.tournamentName}</span>
                </div>
              </div>

              <div style={{background:T.bg,borderRadius:10,padding:"12px 14px",marginBottom:20,border:`1px solid ${T.border}`}}>
                <div style={{fontFamily:fonts.body,fontSize:12,color:T.muted,marginBottom:4}}>ℹ️ AI will generate match fixtures with dates, teams and venues. You'll still need to sync stats manually for each match.</div>
              </div>

              <div style={{display:"flex",gap:8,marginBottom:16}}>
                <button onClick={()=>setAiMatchReplace(false)}
                  style={{flex:1,padding:"8px",borderRadius:8,border:`1px solid ${!aiMatchReplace?T.success:T.border}`,background:!aiMatchReplace?T.successBg:"transparent",color:!aiMatchReplace?T.success:T.muted,fontFamily:fonts.display,fontWeight:700,fontSize:11,cursor:"pointer"}}>
                  ➕ ADD NEW ONLY
                </button>
                <button onClick={()=>setAiMatchReplace(true)}
                  style={{flex:1,padding:"8px",borderRadius:8,border:`1px solid ${aiMatchReplace?T.danger:T.border}`,background:aiMatchReplace?T.dangerBg:"transparent",color:aiMatchReplace?T.danger:T.muted,fontFamily:fonts.display,fontWeight:700,fontSize:11,cursor:"pointer"}}>
                  🗑 CLEAR & REPLACE ALL
                </button>
              </div>
              <div style={{fontFamily:fonts.display,fontSize:10,fontWeight:700,color:T.muted,letterSpacing:2,marginBottom:8}}>PASTE SCHEDULE FROM CRICBUZZ</div>
              <div style={{fontFamily:fonts.body,fontSize:11,color:T.muted,marginBottom:8}}>
                Go to Cricbuzz → your tournament → Schedule tab → select all text → paste below
              </div>
              <textarea
                value={aiMatchText}
                onChange={e=>setAiMatchText(e.target.value)}
                placeholder="Paste schedule text from Cricbuzz here..."
                rows={8}
                style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:9,padding:"10px 14px",color:T.text,fontSize:12,fontFamily:fonts.body,outline:"none",resize:"vertical",boxSizing:"border-box",marginBottom:16,lineHeight:1.5}}
              />

              {aiMatchError && (
                <div style={{background:T.dangerBg,border:`1px solid ${T.danger}33`,borderRadius:8,padding:"10px 14px",marginBottom:12,fontFamily:fonts.body,fontSize:12,color:T.danger}}>
                  ❌ {aiMatchError}
                </div>
              )}
              {aiMatchSuccess && (
                <div style={{background:T.successBg,border:`1px solid ${T.success}33`,borderRadius:8,padding:"10px 14px",marginBottom:12,fontFamily:fonts.body,fontSize:12,color:T.success}}>
                  {aiMatchSuccess}
                </div>
              )}
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>{setAiMatchModal(null);setAiMatchError("");setAiMatchSuccess("");setAiMatchText("");setAiMatchReplace(false);}}
                  style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:10,padding:12,color:T.muted,fontFamily:fonts.display,fontWeight:700,fontSize:13,cursor:"pointer"}}>
                  {aiMatchSuccess ? "CLOSE" : "CANCEL"}
                </button>
                {!aiMatchSuccess && (
                  <button onClick={()=>{setAiMatchError("");generateAiMatches();}} disabled={aiMatchGenerating}
                    style={{flex:2,background:aiMatchGenerating?"#A855F733":`linear-gradient(135deg,${T.purple},#7C3AED)`,border:"none",borderRadius:10,padding:12,color:"#fff",fontFamily:fonts.display,fontWeight:800,fontSize:14,cursor:aiMatchGenerating?"not-allowed":"pointer",letterSpacing:0.5}}>
                    {aiMatchGenerating ? "⏳ PARSING…" : "📋 PARSE SCHEDULE"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {fetchPlayerModal && (
          <FetchPlayers
            existingPlayers={players}
            tournamentId={fetchPlayerModal.tournamentId}
            tournamentName={fetchPlayerModal.tournamentName}
            onPlayersAdded={(newOnes) => {
              // Tag players with tournamentId if provided
              const tagged = newOnes.map(p => fetchPlayerModal.tournamentId ? {...p, tournamentId: fetchPlayerModal.tournamentId} : p);
              const all = [...players, ...tagged.filter(n => !players.find(p => p.id === n.id))];
              setPlayers(all); storeSet("players", all);
            }}
            onClose={() => {
              setFetchPlayerModal(null);
              setFetchPlayerSource(null);
              setFetchPlayerSeries([]);
              setFetchPlayerSeriesInput('');
              setFetchPlayerSelectedSeries(null);
            }}
          />
        )}

                {/* CAPTAIN PICKER MODAL */}
        {captainMatch && <CaptainModal
          match={captainMatch}
          teams={teams}
          players={players}
          assignments={assignments}
          captains={captains}
          points={points}
          myTeam={myTeam || (() => {
            if (!user?.email || !teamIdentity) return null;
            const found = Object.entries(teamIdentity).find(([,t]) => t.claimedBy === user.email);
            if (!found) return null;
            const [key, entry] = found;
            const tid = entry.teamRef || key;
            return teams.find(t => t.id === tid) || null;
          })()}
          unlocked={unlocked}
          isGuest={isGuest}
          withPassword={withPassword}
          onSave={(updated) => updCaptains(updated)}
          onClose={() => setCaptainMatch(null)}
          pitchId={_pitchId}
        />}

        {/* GENERIC CONFIRM MODAL */}
        {confirmAction && (
          <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.95)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500,padding:16,fontFamily:fonts.body}}>
            <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.danger}44`,padding:24,width:"100%",maxWidth:380}}>
              <div style={{fontSize:22,marginBottom:12,textAlign:"center"}}>⚠️</div>
              <div style={{fontSize:14,color:T.text,marginBottom:20,textAlign:"center",lineHeight:1.5}}>{confirmAction.msg}</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setConfirmAction(null)} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:11,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
                <button onClick={()=>{confirmAction.fn();setConfirmAction(null);}} style={{flex:1,background:T.dangerBg,border:"1px solid #FF3D5A",borderRadius:8,padding:11,color:T.danger,fontFamily:fonts.body,fontWeight:800,fontSize:14,cursor:"pointer"}}>CONFIRM</button>
              </div>
            </div>
          </div>
        )}

        {showFixOwnership && (
          <FixOwnershipModal
            players={players}
            teams={teams}
            ownershipLog={ownershipLog}
            onSave={(newLog) => { updOwnership(newLog); }}
            onClose={() => setShowFixOwnership(false)}
          />
        )}

        {showWeeklyReport && (
          <WeeklyReport
            teams={teams}
            players={players}
            assignments={assignments}
            points={points}
            captains={captains}
            matches={matches}
            snatch={snatch}
            ownershipLog={ownershipLog}
            onClose={()=>setShowWeeklyReport(false)}
          />
        )}

        {showMVP && (
          <MVPStats
            players={players}
            teams={teams}
            assignments={assignments}
            points={points}
            captains={captains}
            matches={matches}
            snatch={snatch}
            onClose={()=>setShowMVP(false)}
          />
        )}

        {showAllTimeXI && (
          <AllTimeXI
            teams={teams}
            players={players}
            assignments={assignments}
            points={points}
            snatch={snatch}
            onClose={()=>setShowAllTimeXI(false)}
          />
        )}

        {/* ADMIN CLAIM TEAM MODAL */}
        {adminClaimModal && adminClaimTeam && (
          <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400,padding:20,fontFamily:fonts.body}}>
            <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.border}`,padding:24,width:"100%",maxWidth:360}}>
              <div style={{fontFamily:fonts.display,fontSize:20,fontWeight:700,color:T.success,marginBottom:4}}>CLAIM YOUR TEAM</div>
              <div style={{background:T.successBg,border:`1px solid ${T.success}33`,borderRadius:8,padding:"10px 14px",marginBottom:16,textAlign:"center"}}>
                <div style={{fontSize:11,color:T.muted,marginBottom:2}}>Claiming as admin</div>
                <div style={{fontFamily:fonts.display,fontSize:20,fontWeight:700,color:adminClaimTeam.color}}>{adminClaimTeam.name}</div>
              </div>
              <div style={{fontSize:12,color:T.muted,marginBottom:12}}>Set a PIN for snatch, voting and approvals</div>
              <input type="password" inputMode="numeric" value={adminPin}
                onChange={e=>{setAdminPin(e.target.value);setAdminPinErr('');}}
                placeholder="Choose a 4+ digit PIN" autoFocus
                style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontSize:14,fontFamily:fonts.body,outline:"none",marginBottom:8,boxSizing:"border-box"}} />
              <input type="password" inputMode="numeric" value={adminPinConfirm}
                onChange={e=>{setAdminPinConfirm(e.target.value);setAdminPinErr('');}}
                onKeyDown={async e=>{if(e.key==="Enter"){
                  if(adminPin.length<4){setAdminPinErr("PIN must be at least 4 digits");return;}
                  if(adminPin!==adminPinConfirm){setAdminPinErr("PINs don't match");return;}
                  const hashBuf = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(adminPin));
                  const pinHash = Array.from(new Uint8Array(hashBuf)).map(b=>b.toString(16).padStart(2,"0")).join("");
                  const identity = await storeGet("teamIdentity") || {};
                  const key = adminClaimTeam.id;
                  identity[key] = {...(identity[key]||{}), claimedBy: user.email, pinHash, teamRef: adminClaimTeam.id};
                  await storeSet("teamIdentity", identity);
                  setTeamIdentity(identity);
                  const teamData = {...adminClaimTeam};
                  try { localStorage.setItem('tb_myteam_'+pitch.id, JSON.stringify(teamData)); localStorage.setItem('tb_pinHash_'+pitch.id, pinHash); } catch {}
                  setAdminClaimModal(false); setAdminClaimTeam(null);
                  alert("✅ You've claimed "+adminClaimTeam.name+"! Reloading to apply changes.");
                  window.location.reload();
                }}}
                placeholder="Confirm PIN"
                style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontSize:14,fontFamily:fonts.body,outline:"none",marginBottom:8,boxSizing:"border-box"}} />
              {adminPinErr && <div style={{color:T.danger,fontSize:12,marginBottom:8}}>{adminPinErr}</div>}
              <div style={{display:"flex",gap:8,marginTop:4}}>
                <button onClick={()=>{setAdminClaimModal(false);setAdminClaimTeam(null);}}
                  style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:10,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
                <button onClick={async()=>{
                  if(adminPin.length<4){setAdminPinErr("PIN must be at least 4 digits");return;}
                  if(adminPin!==adminPinConfirm){setAdminPinErr("PINs don't match");return;}
                  const hashBuf = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(adminPin));
                  const pinHash = Array.from(new Uint8Array(hashBuf)).map(b=>b.toString(16).padStart(2,"0")).join("");
                  // Save to teamIdentity
                  const identity = await storeGet("teamIdentity") || {};
                  const key = adminClaimTeam.id;
                  identity[key] = {...(identity[key]||{}), claimedBy: user.email, pinHash, teamRef: adminClaimTeam.id};
                  await storeSet("teamIdentity", identity);
                  setTeamIdentity(identity);
                  // Save to localStorage and reload so Root picks up the new team
                  const teamData = {...adminClaimTeam};
                  try { localStorage.setItem('tb_myteam_'+pitch.id, JSON.stringify(teamData)); localStorage.setItem('tb_pinHash_'+pitch.id, pinHash); } catch {}
                  setAdminClaimModal(false); setAdminClaimTeam(null);
                  alert("✅ You've claimed "+adminClaimTeam.name+"! Reloading to apply changes.");
                  window.location.reload();
                }}
                  style={{flex:2,background:"linear-gradient(135deg,#2ECC71,#16a34a)",border:"none",borderRadius:8,padding:10,color:"#fff",fontFamily:fonts.body,fontWeight:800,fontSize:15,cursor:"pointer"}}>CLAIM & SET PIN</button>
              </div>
            </div>
          </div>
        )}

        {drawerOpen && (
  <div onClick={()=>setDrawerOpen(false)} style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.85)",display:"flex"}}>
    <div onClick={e=>e.stopPropagation()} className="slide-in-left" style={{width:280,background:T.bg,borderRight:`3px solid ${T.accent}`,display:"flex",flexDirection:"column",height:"100%",boxShadow:"5px 0 20px rgba(0,0,0,0.5)"}}>
              <div style={{padding:"16px",borderBottom:`2px solid ${T.accent}`,background:T.card}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
    <div style={{display:"inline-block",background:T.accent,padding:"3px 14px 3px 10px",clipPath:"polygon(0 0,100% 0,calc(100% - 8px) 100%,0 100%)"}}>
      <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:18,color:T.bg,letterSpacing:3}}>MENU</div>
    </div>
    <button onClick={()=>setDrawerOpen(false)} style={{background:"transparent",border:"none",color:T.accent,fontSize:28,cursor:"pointer",lineHeight:1,fontWeight:300}}>×</button>
  </div>
  
  {/* Team IDs toggle button */}
  <button onClick={()=>setTeamIdsOpen(o=>!o)} style={{width:"100%",background:"transparent",border:`2px solid ${T.border}`,padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:18}}>🔑</span>
      <div style={{fontFamily:fonts.display,fontSize:13,color:T.accent,letterSpacing:2,fontWeight:700,textTransform:"uppercase"}}>Team IDs</div>
    </div>
    <span style={{fontSize:14,color:T.accent,fontFamily:fonts.display,fontWeight:700}}>{teamIdsOpen?"▲":"▼"}</span>
  </button>
  
  {/* Team IDs collapsible content */}
  {teamIdsOpen && (
    <div style={{marginTop:8,maxHeight:200,overflowY:"auto"}}>
      {teams.map(t => {
        const ti = teamIdentity[t.id] || {};
        return (
          <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,padding:"8px 10px",background:T.bg,borderRadius:0,border:"1px solid "+t.color+"33"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:12,color:t.color,fontFamily:fonts.display,letterSpacing:1}}>{t.name}</div>
              <div style={{fontSize:10,color:T.muted,marginTop:1}}>{ti.claimedBy ? ti.claimedBy.split("@")[0] : "Unclaimed"}</div>
            </div>
            {ti.claimedBy ? (
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:10,color:T.success,fontWeight:700}}>✓ {ti.claimedBy.split("@")[0]}</span>
                <button onClick={async()=>{
                  if(!confirm("Reset claim for "+t.name+"?")) return;
                  const updated = {...teamIdentity, [t.id]: {...ti, claimedBy:null, pinHash:null}};
                  setTeamIdentity(updated);
                  await storeSet("teamIdentity", updated);
                }} style={{background:T.dangerBg,border:`1px solid ${T.danger}33`,color:T.danger,borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:9,fontWeight:700}}>RESET</button>
              </div>
            ) : ti.teamId ? (
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <div style={{fontFamily:fonts.display,fontSize:14,fontWeight:800,color:T.accent,letterSpacing:2,background:T.accentBg,padding:"3px 8px",borderRadius:6}}>{ti.teamId}</div>
                <button onClick={()=>{setAdminClaimTeam(t);setAdminClaimModal(true);setAdminPin('');setAdminPinConfirm('');setAdminPinErr('');}}
                  style={{background:T.successBg,border:`1px solid ${T.success}44`,color:T.success,borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:9,fontWeight:700}}>CLAIM</button>
                <button onClick={()=>withPassword(async()=>{
                  if(!confirm("Reset this Team ID?")) return;
                  const newId = generateTeamId();
                  const updated = {...teamIdentity, [t.id]: {teamId: newId}};
                  setTeamIdentity(updated);
                  await storeSet("teamIdentity", updated);
                })} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.muted,borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:10}}>↺</button>
              </div>
            ) : (
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <button onClick={()=>withPassword(async()=>{
                  const newId = generateTeamId();
                  const updated = {...teamIdentity, [t.id]: {...ti, teamId: newId}};
                  setTeamIdentity(updated);
                  await storeSet("teamIdentity", updated);
                })} style={{background:T.accentBg,border:`1px solid ${T.accentBorder}`,color:T.accent,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontFamily:fonts.body,fontWeight:700}}>GENERATE</button>
                <button onClick={()=>{setAdminClaimTeam(t);setAdminClaimModal(true);setAdminPin('');setAdminPinConfirm('');setAdminPinErr('');}}
                  style={{background:T.successBg,border:`1px solid ${T.success}44`,color:T.success,borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:9,fontWeight:700}}>CLAIM</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  )}
</div>
              <div style={{flex:1,padding:"12px 8px",overflowY:"auto"}}>
                <button onClick={()=>{nav("form");setDrawerOpen(false);}} style={{width:"100%",background:page==="form"?T.accent:"transparent",border:page==="form"?"none":`2px solid ${T.border}`,clipPath:page==="form"?"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)":"none",padding:"14px 16px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:14,marginBottom:8,filter:page==="form"?"drop-shadow(3px 3px 0 #8B4500)":"none"}}>
  <span style={{fontSize:26}}>📈</span>
  <div>
    <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:15,color:page==="form"?T.bg:T.text,letterSpacing:1.5,textTransform:"uppercase"}}>Form Chart</div>
    <div style={{fontSize:10,color:page==="form"?"rgba(8,12,20,0.7)":T.muted,marginTop:2,fontFamily:fonts.body,letterSpacing:0.5}}>Last 5 matches per player</div>
  </div>
</button>
                <button onClick={()=>{nav("h2h");setDrawerOpen(false);}} style={{width:"100%",background:page==="h2h"?"#4F8EF7":"transparent",border:page==="h2h"?"none":`2px solid ${T.border}`,clipPath:page==="h2h"?"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)":"none",padding:"14px 16px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:14,marginBottom:8,filter:page==="h2h"?"drop-shadow(3px 3px 0 #1E3A5F)":"none"}}>
  <span style={{fontSize:26}}>⚔️</span>
  <div>
    <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:15,color:page==="h2h"?"#050F14":T.text,letterSpacing:1.5,textTransform:"uppercase"}}>Head to Head</div>
    <div style={{fontSize:10,color:page==="h2h"?"rgba(5,15,20,0.7)":T.muted,marginTop:2,fontFamily:fonts.body,letterSpacing:0.5}}>Compare teams across matches</div>
  </div>
</button>

                {/* Notifications */}
                <div style={{marginTop:4}}>
                <button onClick={()=>{setShowMVP(true);setDrawerOpen(false);}} style={{width:"100%",background:"transparent",border:`2px solid ${T.border}`,padding:"12px 16px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:14,marginBottom:8}}>
  <span style={{fontSize:24}}>🏅</span>
  <div style={{flex:1}}>
    <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:14,color:T.text,letterSpacing:1.5,textTransform:"uppercase"}}>MVP Stats</div>
    <div style={{fontSize:10,color:T.muted,fontFamily:fonts.body,letterSpacing:0.5}}>Weekly player performance</div>
  </div>
</button>
                <button onClick={()=>{setShowAllTimeXI(true);setDrawerOpen(false);}} style={{width:"100%",background:"transparent",border:`2px solid ${T.border}`,padding:"12px 16px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:14,marginBottom:8}}>
  <span style={{fontSize:24}}>🏏</span>
  <div style={{flex:1}}>
    <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:14,color:T.text,letterSpacing:1.5,textTransform:"uppercase"}}>All Time XI</div>
    <div style={{fontSize:10,color:T.muted,fontFamily:fonts.body,letterSpacing:0.5}}>Top 11 per team by base points</div>
  </div>
</button>
                <button onClick={()=>{setShowWeeklyReport(true);setDrawerOpen(false);}} style={{width:"100%",background:showWeeklyReport?"#2ECC71":"transparent",border:showWeeklyReport?"none":`2px solid ${T.border}`,clipPath:showWeeklyReport?"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)":"none",padding:"14px 16px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:14,marginBottom:8,filter:showWeeklyReport?"drop-shadow(3px 3px 0 #0A5020)":"none"}}>
  <span style={{fontSize:26}}>📋</span>
  <div style={{flex:1}}>
    <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:15,color:showWeeklyReport?"#050F05":T.text,letterSpacing:1.5,textTransform:"uppercase"}}>Weekly Report</div>
    <div style={{fontSize:10,color:showWeeklyReport?"rgba(5,15,5,0.7)":T.muted,marginTop:2,fontFamily:fonts.body,letterSpacing:0.5}}>This week & last week summary</div>
  </div>
</button>
                  <button onClick={()=>{setNotifOpen(o=>!o);if(!notifOpen)markNotifsRead();}} style={{width:"100%",background:"transparent",border:`2px solid ${T.border}`,padding:"12px 16px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:14,marginBottom:8}}>
  <span style={{fontSize:24,position:"relative"}}>
    🔔
    {unreadNotifCount>0 && <span style={{position:"absolute",top:-6,right:-6,background:"#FF3D5A",borderRadius:"50%",width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"#fff",border:"2px solid "+T.bg}}>{unreadNotifCount}</span>}
  </span>
  <div style={{flex:1}}>
    <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:14,color:T.text,letterSpacing:1.5,textTransform:"uppercase"}}>Notifications</div>
    <div style={{fontSize:10,color:unreadNotifCount>0?T.accent:T.muted,fontWeight:unreadNotifCount>0?700:400,fontFamily:fonts.body,letterSpacing:0.5,marginTop:1}}>{unreadNotifCount>0?unreadNotifCount+" unread":"All caught up"}</div>
  </div>
  <span style={{color:T.accent,fontSize:14,fontFamily:fonts.display,fontWeight:700}}>{notifOpen?"▲":"▼"}</span>
</button>
                  {notifOpen && (
                    <div style={{background:T.bg,borderRadius:10,margin:"0 8px 8px",border:`1px solid ${T.border}`,maxHeight:280,overflowY:"auto"}}>
                      {notifications.length===0 && <div style={{padding:16,textAlign:"center",color:"#2D3E52",fontSize:12}}>No notifications yet</div>}
                      {[...notifications].reverse().map(n=>(
                        <div key={n.id} style={{padding:"10px 14px",borderBottom:"1px solid #1E2D4433",background:n.ts>notifLastRead?"#F5A62308":"transparent"}}>
                          <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                            <span style={{fontSize:14,flexShrink:0}}>{n.emoji}</span>
                            <div style={{flex:1}}>
                              <div style={{fontSize:12,color:T.text,lineHeight:1.4}}>{n.text}</div>
                              <div style={{fontSize:10,color:"#2D3E52",marginTop:3}}>{new Date(n.ts).toLocaleString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
                            </div>
                            {n.ts>notifLastRead && <span style={{width:6,height:6,borderRadius:"50%",background:"#F5A623",flexShrink:0,marginTop:4}} />}
                          </div>
                        </div>
                      ))}
                      {unlocked && (
                        <div style={{padding:"8px 10px",borderTop:`1px solid ${T.border}`}}>
                          <div style={{display:"flex",gap:6,marginBottom:6}}>
                            <input value={broadcastInput} onChange={e=>setBroadcastInput(e.target.value)} placeholder="Broadcast message..."
                              onKeyDown={e=>e.key==="Enter"&&broadcastNotif()}
                              style={{flex:1,background:T.card,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 10px",color:T.text,fontSize:12,fontFamily:fonts.body,outline:"none"}} />
                            <button onClick={broadcastNotif} style={{background:T.accentBg,border:`1px solid ${T.accentBorder}`,color:T.accent,borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:12,fontFamily:fonts.body,fontWeight:700}}>📢</button>
                          </div>
                          <button onClick={()=>withPassword(clearNotifications)} style={{width:"100%",background:"transparent",border:`1px solid ${T.border}`,borderRadius:6,padding:"5px",color:T.muted,fontSize:11,cursor:"pointer",fontFamily:fonts.body}}>Clear all notifications</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              {/* Pending vote notification */}
              {pendingVote && (
                <div style={{margin:"0 8px 8px",background:T.dangerBg,border:`1px solid ${T.danger}33`,borderRadius:10,padding:"12px 14px"}}>
                  <div style={{fontSize:11,color:T.danger,fontWeight:700,letterSpacing:1,marginBottom:4}}>⚡ VOTE NEEDED</div>
                  <div style={{fontSize:11,color:T.text,marginBottom:8}}>A rule change has been proposed and needs your vote.</div>
                  <button onClick={()=>{setShowRulesPanel(true);setDrawerOpen(false);}} style={{width:"100%",background:T.dangerBg,border:"1px solid #FF3D5A",borderRadius:6,padding:"7px",color:T.danger,fontFamily:fonts.body,fontWeight:700,fontSize:12,cursor:"pointer"}}>VIEW & VOTE →</button>
                </div>
              )}

              {/* Points & Rules button */}
              <button onClick={()=>{setShowRulesPanel(true);setDrawerOpen(false);}} style={{width:"100%",background:"transparent",border:"none",padding:"10px 14px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:20}}>📋</span>
                <div style={{flex:1}}>
                  <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:14,color:T.text,letterSpacing:1.5,textTransform:"uppercase"}}>Points & Rules</div>
                  <div style={{fontSize:11,color:T.muted}}>Points system & league timing</div>
                </div>
                {pendingVote && <span style={{width:8,height:8,background:"#FF3D5A",borderRadius:"50%",flexShrink:0}} />}
              </button>

              {/* Fix Ownership — admin only */}
              {isAdmin && (
                <button onClick={()=>{setShowFixOwnership(true);setDrawerOpen(false);}} style={{width:"100%",background:"transparent",border:"none",padding:"10px 14px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:20}}>🔧</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:14,color:T.text,letterSpacing:1.5,textTransform:"uppercase"}}>Fix Ownership Log</div>
                    <div style={{fontSize:11,color:T.muted}}>Fix player points attribution errors</div>
                  </div>
                </button>
              )}

              {/* Guest Access toggle - always visible to admin */}
              {isAdmin && (
                <div style={{padding:"8px 14px 0"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:T.bg,borderRadius:10,border:`1px solid ${T.border}`}}>
                    <div>
                      <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:13,color:T.text,letterSpacing:1.5,textTransform:"uppercase"}}>👁 Guest Access</div>
                      <div style={{fontSize:10,color:T.muted,marginTop:2}}>Allow guests to view this pitch</div>
                    </div>
                    <button onClick={async()=>{
                      const now = !guestAllowed;
                      const pws = await sbGet("pitches") || [];
                      const updated = pws.map(p=>p.id===pitch.id?{...p,guestAllowed:now}:p);
                      await sbSet("pitches", updated);
                      setGuestAllowed(now);
                    }} style={{background:"none",border:"none",cursor:"pointer",padding:0,flexShrink:0}}>
                      <span style={{width:44,height:24,borderRadius:12,background:guestAllowed?"#2ECC71":"#1E2D45",position:"relative",transition:"background 0.2s",display:"inline-block"}}>
                        <span style={{position:"absolute",top:3,left:guestAllowed?23:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left 0.2s",display:"block"}} />
                      </span>
                    </button>
                  </div>
                </div>
              )}
              <div style={{padding:"16px",borderTop:`1px solid ${T.border}`}}>
                <button onClick={onLogout} style={{width:"100%",background:T.dangerBg,border:`1px solid ${T.danger}33`,borderRadius:8,padding:"10px",color:T.danger,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>LOGOUT</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
{showMvpModal && (
  <div onClick={()=>setShowMvpModal(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:600,display:"flex",alignItems:"flex-start",justifyContent:"center",overflowY:"auto",paddingTop:80,paddingBottom:20}}>
    <div onClick={e=>e.stopPropagation()} style={{width:"90vw",maxWidth:360,position:"relative"}}>
      <button onClick={()=>setShowMvpModal(false)} style={{position:"absolute",top:-36,right:0,background:"transparent",border:"none",color:T.muted,fontSize:22,cursor:"pointer",zIndex:10}}>✕</button>
      <MVPSlideshow players={players} assignments={assignments} teams={teams} points={points} fonts={fonts} T={T} PALETTE={PALETTE} inline={true} />
    </div>
  </div>
)}
    </>
  );
}




function Root() {
  const [currentUser, setCurrentUser] = useState(() => {
    try { const s = localStorage.getItem('tb_user'); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [currentPitch, setCurrentPitch] = useState(() => {
    try { const s = localStorage.getItem('tb_pitch'); const p = s ? JSON.parse(s) : null; if(p) _pitchId = p.id; return p; } catch { return null; }
  });
  const [pendingPitches, setPendingPitches] = useState(null);
  // Restore full session from localStorage on refresh
  const [screen, setScreen] = useState(() => {
    try {
      const saved = localStorage.getItem('tb_screen') || 'pitches';
      // Only restore 'pitches' or 'app' — transitional screens reset to pitches
      if (saved === 'pitches') return 'pitches';
      if (saved === 'app') {
        const pitch = JSON.parse(localStorage.getItem('tb_pitch') || 'null');
        if (!pitch) return 'pitches';
        // Only restore app if we have credentials
        if (localStorage.getItem('tb_admin_' + pitch.id) || localStorage.getItem('tb_myteam_' + pitch.id)) return 'app';
      }
      return 'pitches';
    } catch { return 'pitches'; }
  });

  // Save screen to localStorage whenever it changes
  const setScreenAndSave = (s) => {
    setScreen(s);
    try { localStorage.setItem('tb_screen', s); } catch {}
  };
  const [myTeam, setMyTeam] = useState(() => {
    try {
      const pitch = JSON.parse(localStorage.getItem('tb_pitch') || 'null');
      if (!pitch) return null;
      const t = localStorage.getItem('tb_myteam_' + pitch.id);
      return t ? JSON.parse(t) : null;
    } catch { return null; }
  });
  const [myPinHash, setMyPinHash] = useState(() => {
    try {
      const pitch = JSON.parse(localStorage.getItem('tb_pitch') || 'null');
      if (!pitch) return null;
      return localStorage.getItem('tb_pinHash_' + pitch.id) || null;
    } catch { return null; }
  });
  const [isGuest, setIsGuest] = useState(false);
  const [isAdmin, setIsAdmin] = useState(() => {
    try {
      const pitch = JSON.parse(localStorage.getItem('tb_pitch') || 'null');
      if (!pitch) return false;
      return !!localStorage.getItem('tb_admin_' + pitch.id);
    } catch { return false; }
  });

  const sbGet = async (key) => { try { const res = await fetch("https://rmcxhorijitrhqyrvvkn.supabase.co/rest/v1/league_data?key=eq."+encodeURIComponent(key), {headers:{"apikey":"sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm","Authorization":"Bearer sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm"}}); const d=await res.json(); return d[0]?.value; } catch { return null; } };
  const sbSet = async (key, value) => { try { await fetch("https://rmcxhorijitrhqyrvvkn.supabase.co/rest/v1/league_data", {method:"POST",headers:{"apikey":"sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm","Authorization":"Bearer sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm","Content-Type":"application/json","Prefer":"resolution=merge-duplicates"},body:JSON.stringify({key,value,updated_at:new Date().toISOString()})}); } catch {} };
  const hashPw = async (pw) => { const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw)); return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join(""); };

  const handleLogin = (user) => {
    setCurrentUser(user);
    try { localStorage.setItem('tb_user', JSON.stringify(user)); } catch {}
  };

  const handleLogout = () => {
    setCurrentUser(null); setCurrentPitch(null); setMyTeam(null); setMyPinHash(null);
    setIsGuest(false); setIsAdmin(false); setScreenAndSave('pitches');
    try { localStorage.removeItem('tb_user'); } catch {}
  };

  const handleEnterPitch = async (pitch) => {
    _pitchId = pitch.id;
    setCurrentPitch(pitch);
    // Save pitch to localStorage for refresh restoration
    try { localStorage.setItem('tb_pitch', JSON.stringify(pitch)); } catch {}
    // Clear legacy keys
    try { localStorage.removeItem('tb_myteam'); localStorage.removeItem('tb_pinHash'); localStorage.removeItem('tb_skipped'); } catch {}
    // Guests always see 3-option screen
    try { localStorage.removeItem('tb_guest_' + pitch.id); } catch {}

    // Check localStorage first (fastest)
    try {
      const savedAdmin = localStorage.getItem('tb_admin_' + pitch.id);
      if (savedAdmin) { setIsAdmin(true); setIsGuest(false); setMyTeam(null); setScreenAndSave('app'); return; }
      const savedTeam = localStorage.getItem('tb_myteam_' + pitch.id);
      const savedPin = localStorage.getItem('tb_pinHash_' + pitch.id);
      if (savedTeam) { setMyTeam(JSON.parse(savedTeam)); setMyPinHash(savedPin||null); setIsGuest(false); setIsAdmin(false); setScreenAndSave('app'); return; }
    } catch {}

    // Check Supabase by email (works across devices)
    try {
      const userEmail = currentUser?.email;
      if (userEmail) {
        // Fetch adminEmail, teamIdentity and teams in ONE request
        const [adminEmail, identity, teams] = await sbGetMany([
          pitch.id + "_adminEmail",
          pitch.id + "_teamIdentity",
          pitch.id + "_teams",
        ]);

        if (adminEmail === userEmail) {
          try { localStorage.setItem('tb_admin_' + pitch.id, '1'); } catch {}
          setIsAdmin(true); setIsGuest(false); setMyTeam(null); setScreenAndSave('app'); return;
        }

        const identityObj = identity || {};
        const entry = Object.values(identityObj).find(t => t.claimedBy === userEmail);
        if (entry) {
          const teamsArr = teams || [];
          const team = teamsArr.find(t => t.id === entry.teamRef) || teamsArr.find((t,i) => "t"+i === Object.keys(identityObj).find(k=>identityObj[k].claimedBy===userEmail));
          if (team) {
            const teamData = {...team, teamId: entry.teamId};
            try { localStorage.setItem('tb_myteam_' + pitch.id, JSON.stringify(teamData)); if(entry.pinHash) localStorage.setItem('tb_pinHash_' + pitch.id, entry.pinHash); } catch {}
            setMyTeam(teamData); setMyPinHash(entry.pinHash||null); setIsGuest(false); setIsAdmin(false); setScreenAndSave('app'); return;
          }
        }
      }
    } catch(e) { console.error("Email check error:", e); }

    // First time - fetch fresh pitch data to check guestAllowed, then show join screen
    try {
      const pitches = await sbGet("pitches") || [];
      const freshPitch = pitches.find(p => p.id === pitch.id);
      if (freshPitch) setCurrentPitch(freshPitch);
      if (freshPitch?.guestAllowed === false) {
        // Guest access is off — only show claim/admin options, not guest entry
        setCurrentPitch({ ...freshPitch });
      }
    } catch {}
    setScreenAndSave('join');
  };

  const handleSetupAdmin = (pitch, existingPitches) => {
    _pitchId = pitch.id;
    setCurrentPitch(pitch);
    if (existingPitches) setPendingPitches(existingPitches);
    setScreenAndSave('adminSetup');
  };

  const handleClaimed = (team, pinHash) => {
    setMyTeam(team); setMyPinHash(pinHash); setIsGuest(false); setIsAdmin(false);
    setScreenAndSave('app');
  };

  const handleGuestEnter = () => {
    try { localStorage.setItem('tb_guest_' + currentPitch.id, '1'); } catch {}
    setIsGuest(true); setIsAdmin(false); setMyTeam(null);
    setScreenAndSave('app');
  };

  const handleAdminEnter = () => {
    setIsAdmin(true); setIsGuest(false); setMyTeam(null);
    setScreenAndSave('app');
  };

  const handleLeave = () => {
    setCurrentPitch(null); setMyTeam(null); setMyPinHash(null);
    setIsGuest(false); setIsAdmin(false); setScreenAndSave('pitches');
  };
  const handleLeaveGuest = () => {
    // Clear guest key so they see the 3-option screen next time
    try { if (currentPitch) localStorage.removeItem('tb_guest_' + currentPitch.id); } catch {}
    setCurrentPitch(null); setMyTeam(null); setMyPinHash(null);
    setIsGuest(false); setIsAdmin(false); setScreenAndSave('pitches');
  };

  try {
    if (!currentUser) return <SplashScreen onLogin={handleLogin} T={T} fonts={fonts} />;

    if (screen === 'pitches') return (
      <PitchHome onEnter={handleEnterPitch} user={currentUser} onLogout={handleLogout} onSetupAdmin={handleSetupAdmin} />
    );

    if (screen === 'join') return (
      <TeamClaimScreen pitch={currentPitch} user={currentUser}
        onClaimed={handleClaimed} onBack={handleLeave}
        onGuest={handleGuestEnter} onAdmin={handleAdminEnter}
        guestAllowed={currentPitch?.guestAllowed !== false} />
    );

    if (screen === 'adminSetup') return (
      <AdminSetupScreen pitch={currentPitch} onDone={async (pitch)=>{
        // Save pitch to Supabase only now that password is set
        if (pendingPitches !== null) {
          const updated = [...pendingPitches, pitch];
          await sbSet("pitches", updated);
          setPendingPitches(null);
        }
        // Auto-create pitchConfig with defaults for this new pitch
        await sbSet(pitch.id + "_pitchConfig", {
          transferStart: "Sunday 11:59 PM",
          transferEnd: "Monday 11:00 AM",
          snatchReturn: "Friday 11:58 PM",
          snatchWindow: "Saturday 12:00 AM to Saturday 12:00 PM",
        });
        setCurrentPitch(pitch); setIsAdmin(true);
        try { localStorage.setItem('tb_admin_' + pitch.id, '1'); } catch {}
        setScreenAndSave('app');
      }} onBack={()=>{ setPendingPitches(null); handleLeave(); }} sbGet={sbGet} sbSet={sbSet} hashPw={hashPw} />
    );

    if (screen === 'app') return (
      <App key={currentPitch.id} pitch={currentPitch} onLeave={handleLeave} user={currentUser}
        onLogout={handleLogout} myTeam={myTeam} myPinHash={myPinHash}
        isGuest={isGuest} isAdmin={isAdmin}
        onLeaveGuest={()=>{ setIsGuest(false); setMyTeam(null); setScreenAndSave('join'); }} />
    );
  } catch(e) {
    return <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16,padding:24,fontFamily:fonts.body}}>
      <div style={{fontSize:48}}>⚠️</div>
      <div style={{fontFamily:fonts.display,fontSize:22,color:T.danger,fontWeight:700}}>CRASH: {e.message}</div>
      <button onClick={()=>{localStorage.clear();window.location.reload();}} style={{background:"#F5A623",border:"none",borderRadius:8,padding:"10px 20px",color:T.bg,fontWeight:700,fontFamily:fonts.body,fontSize:14,cursor:"pointer",marginTop:8}}>CLEAR AND RELOAD</button>
    </div>;
  }
}


export default Root;

