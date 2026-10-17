/**
 * MeowCounter Backend Server & Vercel Serverless Entrypoint
 * Ultra-lightweight, 100% free, zero external dependencies.
 * Serves static web assets and provides real persistent REST API for the public leaderboard.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const TMP_FILE = path.join('/tmp', 'leaderboard.json');
let memBoard = [];

// --- Upstash / Vercel KV Support ---
const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

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

async function readLeaderboardAsync() {
  if (kvUrl && kvToken) {
    try {
      const resVal = await runKVCommand(['GET', 'global_meow_leaderboard']);
      if (resVal) return JSON.parse(resVal);
    } catch (e) {}
  }
  // Safe /tmp storage fallback (writable on serverless)
  try {
    if (fs.existsSync(TMP_FILE)) {
      return JSON.parse(fs.readFileSync(TMP_FILE, 'utf8'));
    }
  } catch (e) {}
  // Local project file fallback (for local dev)
  try {
    const localFile = path.join(DATA_DIR, 'leaderboard.json');
    if (fs.existsSync(localFile)) {
      return JSON.parse(fs.readFileSync(localFile, 'utf8'));
    }
  } catch (e) {}
  return memBoard;
}

async function writeLeaderboardAsync(data) {
  memBoard = data;
  if (kvUrl && kvToken) {
    try {
      await runKVCommand(['SET', 'global_meow_leaderboard', JSON.stringify(data)]);
      return true;
    } catch (e) {}
  }
  // Write to /tmp on serverless
  try {
    fs.writeFileSync(TMP_FILE, JSON.stringify(data), 'utf8');
  } catch (e) {}
  // Write to data/ locally if writable
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, 'leaderboard.json'), JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
  return true;
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

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Detect requested URL across direct invocation and Vercel rewrites
  const candidateUrls = [
    req.url,
    req.headers['x-forwarded-url'],
    req.headers['x-original-url'],
    req.headers['x-vercel-original-path'],
    req.headers['x-forwarded-uri'],
    req.headers['x-matched-path']
  ].filter(Boolean);

  let rawPath = req.url || '/';
  for (const candidate of candidateUrls) {
    if (candidate.includes('/api/leaderboard') || candidate.startsWith('/api/')) {
      rawPath = candidate;
      break;
    }
  }

  const parsedUrl = new URL(rawPath, 'http://localhost');
  const rawUrlPath = parsedUrl.pathname || '/';
  const cleanPath = (rawUrlPath.length > 1) ? rawUrlPath.replace(/\/$/, '') : rawUrlPath;
  const isLeaderboardApi = cleanPath === '/api/leaderboard' || rawPath.includes('/api/leaderboard');

  // --- API Endpoints ---
  
  if (isLeaderboardApi) {
    if (req.method === 'GET') {
      try {
        const board = await readLeaderboardAsync();
        const sortBy = parsedUrl.searchParams.get('sort');
        if (sortBy === 'continuous') {
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
        res.writeHead(200, { 
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(JSON.stringify(board));
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify([]));
      }
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
        if (body.length > 50000) req.destroy();
      });

      req.on('end', async () => {
        try {
          const payload = JSON.parse(body);
          const { id, name, avatar, spokenMeows, continuousStreak, continuousDurationSeconds, continuousPace, tier } = payload;

          if (!name || typeof name !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Valid player name is required' }));
            return;
          }

          if (containsProfanity(name)) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Nickname contains inappropriate words. Please keep it wholesome!' }));
            return;
          }

          const board = await readLeaderboardAsync();
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
          await writeLeaderboardAsync(board);

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, entry: updatedEntry, leaderboard: board }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
        }
      });
      return;
    }

    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  // --- Static File Serving ---
  const safePath = (cleanPath === '/' || cleanPath === '' || cleanPath === '/index.html' || cleanPath === '/server.js') 
    ? 'index.html' 
    : cleanPath.replace(/^\//, '');
  let filePath = path.join(__dirname, 'public', safePath);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, safePath);
  }

  // Fallback to index.html for root or unknown subroutes
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, 'public', 'index.html');
  }

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

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`🐱 MeowCounter server running on http://localhost:${PORT}`);
    console.log(`📊 Leaderboard REST API ready at http://localhost:${PORT}/api/leaderboard`);
  });
}

// Export for Vercel Serverless Function entrypoint
module.exports = server;
