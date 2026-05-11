export default async function handler(req, res) {
  const { team1, team2 } = req.query;
  
  if (!team1 || !team2) {
    return res.status(400).json({ error: 'Missing teams' });
  }

  try {
    const searchQuery = `${team1} vs ${team2} live score`;
    const searchRes = await fetch(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    const searchText = await searchRes.text();
    
    // Detect if match is live
    const isLive = /\b(LIVE|Live|●|In Progress|In progress)\b/i.test(searchText) && 
                  !/\b(Upcoming|upcoming|Scheduled|scheduled)\b/i.test(searchText);
    
    return res.status(200).json({ 
      isLive, 
      checked: new Date().toISOString(),
      query: searchQuery
    });
  } catch (error) {
    return res.status(500).json({ 
      error: error.message, 
      isLive: false 
    });
  }
}
