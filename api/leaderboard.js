// Vercel Serverless Function: /api/leaderboard
// Supports persistent storage via free Vercel KV / Upstash Redis if configured,
// with safe local/ephemeral fallback.

const fs = require('fs');
const path = require('path');

const FORBIDDEN_WORDS = [
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'hitler', 'nazi',
  'rapist', 'rape', 'pedophile', 'pedophil', 'suicide', 'murder', 'terrorist'
];

function containsProfanity(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase().trim();
  const alphaOnly = lower.replace(/[^a-z0-9]/g, '');
  for (const bad of FORBIDDEN_WORDS) {
    if (lower.includes(bad) || alphaOnly.includes(bad)) return true;
  }
  return false;
}

// In-memory cache for serverless lifetime
let memBoard = [];
const TMP_FILE = path.join('/tmp', 'leaderboard.json');

function getLocalData() {
  try {
    if (fs.existsSync(TMP_FILE)) {
      return JSON.parse(fs.readFileSync(TMP_FILE, 'utf8'));
    }
  } catch (e) {}
  return memBoard;
}

function saveLocalData(data) {
  memBoard = data;
  try {
    fs.writeFileSync(TMP_FILE, JSON.stringify(data), 'utf8');
  } catch (e) {}
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // --- UPSTASH / VERCEL KV SUPPORT (If user clicks 'Storage -> KV' on Vercel) ---
  const kvUrl = process.env.KV_REST_API_URL || 
                process.env.UPSTASH_REDIS_REST_URL || 
                process.env.STORAGE_REST_API_URL || 
                process.env.STORAGE_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || 
                  process.env.UPSTASH_REDIS_REST_TOKEN || 
                  process.env.STORAGE_REST_API_TOKEN || 
                  process.env.STORAGE_TOKEN;

  async function runKVCommand(commandArray) {
    if (!kvUrl || !kvToken) return null;
    try {
      const response = await fetch(kvUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kvToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(commandArray)
      });
      const data = await response.json();
      return data.result;
    } catch (e) {
      console.warn('KV command error, falling back:', e);
      return null;
    }
  }

  // GET /api/leaderboard
  if (req.method === 'GET') {
    try {
      let board = null;
      if (kvUrl && kvToken) {
        const resVal = await runKVCommand(['GET', 'global_meow_leaderboard']);
        if (resVal) {
          try { board = JSON.parse(resVal); } catch (e) {}
        }
      }
      if (!board) {
        board = getLocalData();
      }

      const { sort } = req.query || {};
      if (sort === 'continuous') {
        board.sort((a, b) => {
          const streakDiff = (b.continuousStreak || 0) - (a.continuousStreak || 0);
          if (streakDiff !== 0) return streakDiff;
          const aTime = a.continuousDurationSeconds || 999999;
          const bTime = b.continuousDurationSeconds || 999999;
          return aTime - bTime;
        });
      } else {
        board.sort((a, b) => (b.spokenMeows || 0) - (a.spokenMeows || 0));
      }

      return res.status(200).json(board);
    } catch (err) {
      console.error('GET leaderboard error:', err);
      return res.status(200).json(getLocalData());
    }
  }

  // POST /api/leaderboard
  if (req.method === 'POST') {
    try {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { id, name, avatar, spokenMeows, continuousStreak, continuousDurationSeconds, continuousPace, tier } = payload || {};

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Valid player name is required' });
      }

      if (containsProfanity(name)) {
        return res.status(400).json({ error: 'Nickname contains inappropriate words. Please keep it wholesome!' });
      }

      let board = null;
      if (kvUrl && kvToken) {
        const resVal = await runKVCommand(['GET', 'global_meow_leaderboard']);
        if (resVal) {
          try { board = JSON.parse(resVal); } catch (e) {}
        }
      }
      if (!board) {
        board = getLocalData();
      }

      const playerId = id || `user_${Date.now()}`;
      const existingIdx = board.findIndex(p => p.id === playerId || p.name.toLowerCase() === name.toLowerCase());

      const newContinuousStreak = typeof continuousStreak === 'number' ? continuousStreak : 0;
      const newDuration = typeof continuousDurationSeconds === 'number' ? continuousDurationSeconds : 0;
      const newPace = typeof continuousPace === 'number' ? continuousPace : 0;

      const updatedEntry = {
        id: playerId,
        name: name.trim(),
        avatar: avatar || '🐱',
        spokenMeows: typeof spokenMeows === 'number' ? spokenMeows : 0,
        continuousStreak: newContinuousStreak,
        continuousDurationSeconds: newDuration,
        continuousPace: newPace,
        tier: tier || 'Curious Kitten 🐾',
        updatedAt: Date.now()
      };

      if (existingIdx >= 0) {
        const old = board[existingIdx];
        const shouldUpdateContinuous = 
          (newContinuousStreak > (old.continuousStreak || 0)) ||
          (newContinuousStreak === (old.continuousStreak || 0) && newDuration > 0 && (newDuration < (old.continuousDurationSeconds || 999999))) ||
          !(old.continuousStreak);

        board[existingIdx] = {
          ...old,
          ...updatedEntry,
          spokenMeows: Math.max(old.spokenMeows || 0, updatedEntry.spokenMeows),
          continuousStreak: shouldUpdateContinuous ? newContinuousStreak : (old.continuousStreak || 0),
          continuousDurationSeconds: shouldUpdateContinuous ? newDuration : (old.continuousDurationSeconds || 0),
          continuousPace: shouldUpdateContinuous ? newPace : (old.continuousPace || 0)
        };
      } else {
        board.push(updatedEntry);
      }

      board.sort((a, b) => (b.spokenMeows || 0) - (a.spokenMeows || 0));

      if (kvUrl && kvToken) {
        await runKVCommand(['SET', 'global_meow_leaderboard', JSON.stringify(board)]);
      } else {
        saveLocalData(board);
      }

      return res.status(200).json({ success: true, entry: updatedEntry, leaderboard: board });
    } catch (err) {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
