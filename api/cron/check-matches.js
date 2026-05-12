export const config = {
  runtime: 'nodejs18.x',
  maxDuration: 30,
};

export default async function handler(req, res) {
  // Security check
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startTime = Date.now();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 CRON JOB START:', new Date().toISOString());
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    const SUPABASE_URL = 'https://rmcxhorijitrhqyrvvkn.supabase.co';
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
    const PITCH_ID = 'p1';

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 1. FETCH DATA FROM SUPABASE
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('📥 Fetching data from Supabase...');
    
    const [matchesRes, captainsRes, checkStateRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/league_data?key=eq.${PITCH_ID}_matches`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      }),
      fetch(`${SUPABASE_URL}/rest/v1/league_data?key=eq.${PITCH_ID}_captains`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      }),
      fetch(`${SUPABASE_URL}/rest/v1/league_data?key=eq.${PITCH_ID}_matchCheckState`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      })
    ]);

    const matchesData = await matchesRes.json();
    const captainsData = await captainsRes.json();
    const checkStateData = await checkStateRes.json();

    const matches = matchesData[0]?.value || [];
    const captains = captainsData[0]?.value || {};
    const checkState = checkStateData[0]?.value || {};

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2. FILTER TODAY'S MATCHES
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const nowIST = new Date(Date.now() + IST_OFFSET);
    const todayStr = nowIST.toISOString().split('T')[0];

    const todayMatches = matches.filter(m => 
      m.date === todayStr && 
      m.status !== 'completed' && 
      m.cricbuzzId
    );

    if (todayMatches.length === 0) {
      console.log('✅ No matches scheduled today');
      return res.status(200).json({ 
        message: 'No matches today',
        duration: Date.now() - startTime 
      });
    }

    console.log(`📋 Found ${todayMatches.length} match(es) today`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 3. DETERMINE WHICH MATCHES TO CHECK
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const matchesToCheck = [];
    
    for (const match of todayMatches) {
      const matchId = match.id;
      const state = checkState[matchId] || { checkCount: 0, isLive: false, locked: false };
      
      // Skip if already live and locked
      if (state.isLive && state.locked) {
        console.log(`⏭️  ${match.team1} vs ${match.team2}: Already live & locked, skipping`);
        continue;
      }

      // Parse match time
      const timeStr = match.time || '20:00';
      const [hh, mm] = timeStr.split(':').map(Number);
      const matchDateTime = new Date(nowIST);
      matchDateTime.setUTCHours(hh);
      matchDateTime.setUTCMinutes(mm);
      matchDateTime.setUTCSeconds(0);

      const minsFromMatchTime = Math.floor((nowIST - matchDateTime) / (60 * 1000));
      
      console.log(`🔍 ${match.team1} vs ${match.team2}:`);
      console.log(`   Scheduled: ${timeStr}, Current: ${nowIST.getUTCHours()}:${nowIST.getUTCMinutes()}`);
      console.log(`   Minutes from match time: ${minsFromMatchTime}`);
      console.log(`   Check count: ${state.checkCount}`);

      // RULE 1: Don't check if more than 3 hours (180 mins) past match time
      if (minsFromMatchTime > 180) {
        console.log(`   ⏰ >3 hours passed, giving up`);
        continue;
      }

      // RULE 2: Don't check before match time
      if (minsFromMatchTime < 0) {
        console.log(`   ⏰ Match hasn't started yet, waiting`);
        continue;
      }

      // RULE 3: First 3 checks (0-15 mins): Check every 5 mins
      if (state.checkCount < 3) {
        const lastCheckedTime = state.lastChecked ? new Date(state.lastChecked) : new Date(0);
        const minsSinceLastCheck = Math.floor((nowIST - lastCheckedTime) / (60 * 1000));
        
        if (minsSinceLastCheck >= 5 || state.checkCount === 0) {
          console.log(`   ✅ Check #${state.checkCount + 1} (every 5 mins phase)`);
          matchesToCheck.push(match);
        } else {
          console.log(`   ⏳ Too soon, last checked ${minsSinceLastCheck} mins ago`);
        }
        continue;
      }

      // RULE 4: After 3 checks: Check every 30 mins
      const lastCheckedTime = state.lastChecked ? new Date(state.lastChecked) : new Date(0);
      const minsSinceLastCheck = Math.floor((nowIST - lastCheckedTime) / (60 * 1000));
      
      if (minsSinceLastCheck >= 30) {
        console.log(`   ✅ Check #${state.checkCount + 1} (every 30 mins phase)`);
        matchesToCheck.push(match);
      } else {
        console.log(`   ⏳ Too soon, last checked ${minsSinceLastCheck} mins ago (need 30)`);
      }
    }

    if (matchesToCheck.length === 0) {
      console.log('✅ No matches need checking right now');
      return res.status(200).json({ 
        message: 'No matches to check',
        duration: Date.now() - startTime 
      });
    }

    console.log(`🔥 Checking ${matchesToCheck.length} match(es) via RapidAPI...`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 4. CHECK RAPIDAPI
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const [liveRes, resultsRes] = await Promise.all([
      fetch('https://cricket-api-free-data.p.rapidapi.com/currentMatches', {
        headers: {
          'x-rapidapi-host': 'cricket-api-free-data.p.rapidapi.com',
          'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        }
      }).then(r => r.json()).catch(() => ({})),
      fetch('https://cricket-api-free-data.p.rapidapi.com/cricket-results', {
        headers: {
          'x-rapidapi-host': 'cricket-api-free-data.p.rapidapi.com',
          'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        }
      }).then(r => r.json()).catch(() => ({})),
    ]);

    const liveList = Array.isArray(liveRes?.response) ? liveRes.response : [];
    const liveIds = new Set(liveList.map(m => String(m?.matchId || m?.id)).filter(Boolean));
    const resultsList = Array.isArray(resultsRes?.response) ? resultsRes.response : [];
    const completedIds = new Set(resultsList.map(m => String(m?.matchId || m?.id)).filter(Boolean));

    console.log(`🔴 Live IDs:`, Array.from(liveIds));
    console.log(`✅ Completed IDs:`, Array.from(completedIds));

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 5. UPDATE MATCHES & CAPTAINS & CHECK STATE
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let matchesChanged = false;
    let captainsChanged = false;
    const newCheckState = { ...checkState };
    const newCaptains = { ...captains };

    const updatedMatches = matches.map(m => {
      const matchToCheck = matchesToCheck.find(mtc => mtc.id === m.id);
      if (!matchToCheck) return m;

      const matchId = m.id;
      const cricbuzzId = String(m.cricbuzzId);
      const isLive = liveIds.has(cricbuzzId);
      const isCompleted = completedIds.has(cricbuzzId);

      // Update check state
      const currentState = newCheckState[matchId] || { checkCount: 0, isLive: false, locked: false };
      newCheckState[matchId] = {
        ...currentState,
        lastChecked: nowIST.toISOString(),
        checkCount: currentState.checkCount + 1,
        isLive: isLive || currentState.isLive,
      };

      // Update match status
      if (isCompleted && m.status !== 'completed') {
        console.log(`✅ ${m.team1} vs ${m.team2}: → completed`);
        matchesChanged = true;
        
        // Auto-lock C/VC
        if (!captains[matchId + '_locked']) {
          console.log(`   🔒 Auto-locking C/VC`);
          newCaptains[matchId + '_locked'] = true;
          newCheckState[matchId].locked = true;
          captainsChanged = true;
        }
        
        return { ...m, status: 'completed' };
      }

      if (isLive && m.status === 'upcoming') {
        console.log(`🔴 ${m.team1} vs ${m.team2}: → LIVE!`);
        matchesChanged = true;
        
        // Auto-lock C/VC
        if (!captains[matchId + '_locked']) {
          console.log(`   🔒 Auto-locking C/VC`);
          newCaptains[matchId + '_locked'] = true;
          newCheckState[matchId].locked = true;
          captainsChanged = true;
        }
        
        return { ...m, status: 'live' };
      }

      console.log(`   ℹ️ Not live yet, will check again`);
      return m;
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 6. SAVE TO SUPABASE
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const saves = [];

    // Always save check state (updated counts)
    console.log('💾 Saving check state...');
    saves.push(
      fetch(`${SUPABASE_URL}/rest/v1/league_data`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          key: `${PITCH_ID}_matchCheckState`,
          value: newCheckState,
          updated_at: new Date().toISOString(),
        }),
      })
    );

    if (matchesChanged) {
      console.log('💾 Saving match updates...');
      saves.push(
        fetch(`${SUPABASE_URL}/rest/v1/league_data`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            key: `${PITCH_ID}_matches`,
            value: updatedMatches,
            updated_at: new Date().toISOString(),
          }),
        })
      );
    }

    if (captainsChanged) {
      console.log('💾 Saving captain locks...');
      saves.push(
        fetch(`${SUPABASE_URL}/rest/v1/league_data`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            key: `${PITCH_ID}_captains`,
            value: newCaptains,
            updated_at: new Date().toISOString(),
          }),
        })
      );
    }

    await Promise.all(saves);

    const duration = Date.now() - startTime;
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ CRON COMPLETE: ${duration}ms`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return res.status(200).json({
      success: true,
      duration,
      matchesChecked: matchesToCheck.length,
      matchesChanged,
      captainsChanged,
      checkState: newCheckState,
    });

  } catch (error) {
    console.error('❌ CRON FAILED:', error);
    return res.status(500).json({ 
      error: error.message,
      duration: Date.now() - startTime 
    });
  }
}
