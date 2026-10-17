/**
 * MeowCounter Backend Server
 * Ultra-lightweight, 100% free, zero external dependencies (pure Node.js http & fs).
 * Serves static web assets and provides real persistent REST API for the public leaderboard.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ensure leaderboard file exists with empty real data (NO mock data)
if (!fs.existsSync(LEADERBOARD_FILE)) {
  fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify([], null, 2), 'utf8');
}

function readLeaderboard() {
  try {
    const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading leaderboard file:', err);
    return [];
  }
}

function writeLeaderboard(data) {
  try {
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing leaderboard file:', err);
    return false;
  }
}

// MIME types dictionary for static file serving
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg'
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS headers so this API can also be consumed from external frontends or mobile webviews
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- Wholesome Profanity Checker ---
  const FORBIDDEN_WORDS = [
    'fuck', 'fuk', 'fck', 'shit', 'sh1t', 'bitch', 'b1tch', 'asshole', 'arsehole', 'badass',
    'bastard', 'cunt', 'dick', 'cock', 'pussy', 'penis', 'vagina', 'boob', 'boobs',
    'tit', 'tits', 'slut', 'whore', 'twat', 'wanker', 'wank', 'dildo', 'porn', 'anal',
    'blowjob', 'handjob', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'hitler',
    'nazi', 'rapist', 'rape', 'pedophile', 'pedophil', 'suicide', 'murder', 'terrorist'
  ];

  function containsProfanity(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase().trim();
    const leetMap = {
      '@': 'a', '4': 'a', '8': 'b', '3': 'e', '9': 'g',
      '1': 'i', '!': 'i', '|': 'i', '0': 'o', '5': 's',
      '$': 's', '7': 't', '+': 't', 'v': 'u'
    };
    let leetCleaned = '';
    for (const char of lower) leetCleaned += leetMap[char] || char;
    const alphaOnly = leetCleaned.replace(/[^a-z0-9]/g, '');
    for (const bad of FORBIDDEN_WORDS) {
      if (lower.includes(bad) || leetCleaned.includes(bad) || alphaOnly.includes(bad)) return true;
    }
    return false;
  }

  // --- API Endpoints ---
  
  // GET /api/leaderboard -> returns real leaderboard entries sorted by spokenMeows or continuous
  if (req.method === 'GET' && pathname === '/api/leaderboard') {
    const board = readLeaderboard();
    const sortBy = parsedUrl.query && parsedUrl.query.sort;
    if (sortBy === 'continuous') {
      board.sort((a, b) => {
        const streakDiff = (b.continuousStreak || 0) - (a.continuousStreak || 0);
        if (streakDiff !== 0) return streakDiff;
        // Tie-breaker: shorter time taken ranks higher
        const aTime = a.continuousDurationSeconds || 999999;
        const bTime = b.continuousDurationSeconds || 999999;
        return aTime - bTime;
      });
    } else {
      board.sort((a, b) => (b.spokenMeows || 0) - (a.spokenMeows || 0));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(board));
    return;
  }

  // POST /api/leaderboard -> updates or creates a player's entry
  if (req.method === 'POST' && pathname === '/api/leaderboard') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      // Guard against huge payload attacks
      if (body.length > 50000) {
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { id, name, avatar, spokenMeows, continuousStreak, continuousDurationSeconds, continuousPace, tier } = payload;

        if (!name || typeof name !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Valid player name is required' }));
          return;
        }

        if (containsProfanity(name)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Nickname contains inappropriate words. Please keep it wholesome!' }));
          return;
        }

        const board = readLeaderboard();
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

        // Default sort descending by spokenMeows
        board.sort((a, b) => (b.spokenMeows || 0) - (a.spokenMeows || 0));
        writeLeaderboard(board);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, entry: updatedEntry, leaderboard: board }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  // --- Static File Serving ---
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  // Prevent directory traversal attacks
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`🐱 MeowCounter server running on http://localhost:${PORT}`);
  console.log(`📊 Leaderboard REST API ready at http://localhost:${PORT}/api/leaderboard`);
});
