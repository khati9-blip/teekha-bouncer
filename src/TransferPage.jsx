import React, { useState } from "react";
import { T, fonts } from "./Theme";
import TransferWindowComponent from "./TransferWindow";
import SnatchSection from "./SnatchSection";

export default function TransferPage({
  pitch, teams, players, assignments, transfers, unsoldPool,
  leaderboard, isAdmin, myTeam, unlocked, withPassword,
  ownershipLog, points, user, pitchConfig, ruledOut, safePlayers,
  snatch, matches, captains, teamIdentity, pushNotif,
  storeGet, storeSet,
  onUpdateTransfers, onUpdateAssignments, onUpdateUnsoldPool,
  onUpdateOwnershipLog, onUpdatePoints, onUpdateSnatch, onUpdateSafePlayers,
  updAssign,
}) {
  const [transferSubTab, setTransferSubTab] = useState("transfer");

  return (
    <div className="fade-in">
      {/* Sub-tabs */}
      <div style={{display:"flex",gap:0,marginBottom:16,borderBottom:`2px solid ${T.border}`}}>
        {[["transfer","🔄 TRANSFER"],["snatch","⚡ SNATCH"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTransferSubTab(id)}
            style={{flex:1,padding:"12px",border:"none",borderBottom:transferSubTab===id?`3px solid ${T.accent}`:"3px solid transparent",background:"transparent",color:transferSubTab===id?T.accent:T.muted,fontFamily:fonts.display,fontWeight:800,fontSize:14,cursor:"pointer",letterSpacing:2,transition:"all 0.2s",textTransform:"uppercase",marginBottom:-2}}>
            {label}
          </button>
        ))}
      </div>

      {transferSubTab==="transfer" && (
        <TransferWindowComponent
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
          storeSet={storeSet}
          onUpdateTransfers={onUpdateTransfers}
          onUpdateAssignments={onUpdateAssignments}
          onUpdateUnsoldPool={onUpdateUnsoldPool}
          onUpdateOwnershipLog={onUpdateOwnershipLog}
          onUpdatePoints={onUpdatePoints}
          safePlayers={safePlayers}
        />
      )}

      {transferSubTab==="snatch" && (
        <SnatchSection
          storeGet={storeGet}
          teams={teams}
          players={players}
          assignments={assignments}
          snatch={snatch}
          points={points}
          matches={matches}
          captains={captains}
          leaderboard={leaderboard}
          myTeam={myTeam}
          isAdmin={isAdmin}
          unlocked={unlocked}
          withPassword={withPassword}
          teamIdentity={teamIdentity}
          user={user}
          pitch={pitch}
          ownershipLog={ownershipLog}
          safePlayers={safePlayers}
          pushNotif={pushNotif}
          pitchConfig={pitchConfig}
          ruledOut={ruledOut}
          onUpdateSnatch={onUpdateSnatch}
          onUpdateAssignments={onUpdateAssignments}
          onUpdateOwnershipLog={onUpdateOwnershipLog}
          onUpdateSafePlayers={onUpdateSafePlayers}
        />
      )}
    </div>
  );
}
