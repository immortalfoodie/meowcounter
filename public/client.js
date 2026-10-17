/**
 * MeowCounter.nya ~ Voice Meow Tracker & Feline Community
 * 
 * Features:
 *  1. Authentic Feline Voice Synthesis (Realistic kitten meows & nyas - NO human speech)
 *  2. Main Focus: "Meow to your heart's content!" (Total Daily Meows)
 *  3. One-Shot Continuous Meow Run (Auto-concludes after 1 minute of silence; independent reset)
 *  4. 100% Client-Side Privacy: zero voice recordings leave the device
 *  5. Real Backend Leaderboard REST API (GET/POST /api/leaderboard) with NO mock data
 *  6. Wholesome Profanity Filter for nicknames
 *  7. Achievement Celebration Chime with ringing fanfare
 */

(function () {
  'use strict';

  // Guard against server-side execution
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  // --- Constants & Storage Keys ---
  const STORAGE_PREFIX = 'meow_counter_';
  const THEME_KEY = 'meow_theme_pref';
  const SFX_KEY = 'meow_sfx_pref';
  const USER_KEY = 'meow_user_profile';
  const LEADERBOARD_KEY = 'meow_public_leaderboard';

  // Cute speech bubble phrases for the cat mascot
  const CAT_VOCAL_PHRASES = [
    'Nya~!', 'Meooww~!', 'Nyan! ✨', 'Mew mew!', 'Purrr~ 💕',
    'Nyaa~!', 'Mrrrp!', 'Feed me fish! 🐟', 'Kawaii nya! ✨'
  ];

  // Random cute names generator
  const CUTE_NAME_PREFIXES = ['Strawberry', 'Matcha', 'Sakura', 'Mochi', 'Fluffy', 'Boba', 'Choco', 'Vanilla', 'Sleepy', 'Cosmic'];
  const CUTE_NAME_SUFFIXES = ['Neko', 'Kitten', 'Paws', 'Whiskers', 'Meower', 'Samurai', 'Overlord', 'Tabby', 'Purr', 'Bean'];

  // Feline Ranks & Mastery Tiers (Pure Total Meow Basis)
  const FELINE_TIERS = [
    { id: 'kitten', name: 'Curious Kitten', min: 1, badge: '🐾', desc: 'Began your journey into cat-kind with your very first meow.' },
    { id: 'tabby', name: 'Playful Tabby', min: 10, badge: '🧶', desc: 'Getting warmed up! Chasing yarn and meowing proudly.' },
    { id: 'turbo', name: 'Turbo Paws', min: 25, badge: '⚡', desc: 'Quick bursts of energy! Meowing in high gear.' },
    { id: 'calico', name: 'Singing Calico', min: 50, badge: '🎶', desc: 'Vocal harmony found! Continuous melodic meowing.' },
    { id: 'siamese', name: 'Vocal Siamese', min: 100, badge: '📢', desc: 'Triple-digit powerhouse! 100 pure total meows achieved.' },
    { id: 'opera', name: 'Opera Neko', min: 250, badge: '🎀', desc: 'A grand virtuoso performance fit for feline royalty.' },
    { id: 'overlord', name: 'Supreme Cat Overlord', min: 500, badge: '👑', desc: 'Half a thousand meows! Feline royalty bows before you.' },
    { id: 'cosmic', name: 'Cosmic Meow Deity', min: 1000, badge: '🌌', desc: 'Ascended past mortal cats into the celestial nya heavens.' }
  ];

  // Regex pattern matching variations of meow, nya, and cat sounds (including phonetic speech-to-text interpretations)
  const MEOW_REGEX = /\b(m+e+o+w+s?|m+e+w+s?|m+i+a+o+w+s?|n+y+a+[a-z]*|n+y+a+n*|n+y+o+|n+y+u+|m+i+a+o+u*|m+i+a+u*|m+i+u+|m+y+u+|m+i+o+|p+u+r+r+s?|m+e+o+w*|m+a+o+|m+a+u+|n+e+k+o+s?|m+o+w+s?|m+e+\s*o+u+t|m+e+\s*o+w|m+e+\s*h+o+w|n+e+a+r+|n+o+w+)\b/gi;

  // --- State ---
  let isListening = false;
  let sfxEnabled = true;
  let recognition = null;
  let audioContext = null;
  let analyserNode = null;
  let microphoneStream = null;
  let visualizerAnimFrame = null;
  
  // Rolling speed & continuous streak state
  let recentMeowTimestamps = [];
  let streakCount = 0;
  let isCompetitiveMode = true;
  let streakStartTime = null;
  let streakDurationSeconds = 0;
  let streakStopwatchInterval = null;
  let silenceSecondsRemaining = 60;
  let silenceCountdownInterval = null;
  let streakInactivityTimer = null; // Backup inactivity timer
  let activeLeaderboardTab = 'daily'; // 'daily' or 'continuous'
  let mouthResetTimer = null;
  let bubbleResetTimer = null;
  let catSoundIndex = 0;

  // Stream token delta tracking
  let streamCountMap = new Map();

  // Acoustic detection state & envelope state machine
  let acousticState = 'idle'; // 'idle' or 'vocal_active'
  let vocalBurstStartTime = 0;
  let lastMeowRegisteredTime = 0;
  let lastRegisteredMeowTimestamp = 0;
  let ambientNoiseFloor = 0.012;
  let peakVocalEnergyInBurst = 0;
  // Pitch-tracking burst state (voiced-meow detector)
  let burstActiveMs = 0;        // ms of the burst above the off-threshold
  let burstVoicedMs = 0;        // ms of the burst with a clear vocal pitch
  let burstPitches = [];        // pitch samples (Hz) collected during the burst
  let burstQuietSince = 0;      // hangover timer before ending a burst
  let burstDipSince = 0;        // energy-dip timer for splitting rapid "meow-meow"
  let burstRearmLevel = 0;      // after a split, the next burst must re-rise above this
  let burstLastFrameTime = 0;
  // Feedback guard: the app's own chirps/meows must never count as user meows
  let selfSoundUntil = 0;
  // Non-meow speech suppression: when speech recognition detects non-meow words like "hello"
  let suppressAcousticUntil = 0;
  let acousticSensitivity = 55;

  // Selected avatar in auth modal
  let selectedAvatar = '🐱';

  // --- Helper Timing Formatters ---
  function formatTimer(seconds) {
    if (!seconds || seconds <= 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function formatDurationText(seconds) {
    if (!seconds || seconds <= 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }

  // --- DOM Elements ---
  const counterDisplay = document.getElementById('counterDisplay');
  const streakDisplay = document.getElementById('streakDisplay');
  const bestStreakDisplay = document.getElementById('bestStreakDisplay');
  const bestStreakMeta = document.getElementById('bestStreakMeta');
  const streakTimerStatus = document.getElementById('streakTimerStatus');
  const submitRunBtn = document.getElementById('submitRunBtn');
  const resetStreakBtn = document.getElementById('resetStreakBtn');
  const competitiveInfoBtn = document.getElementById('competitiveInfoBtn');
  const modeCasualBtn = document.getElementById('modeCasualBtn');
  const modeCompetitiveBtn = document.getElementById('modeCompetitiveBtn');
  const competitiveTelemetryBar = document.getElementById('competitiveTelemetryBar');
  const runTimerDisplay = document.getElementById('runTimerDisplay');
  const runPaceDisplay = document.getElementById('runPaceDisplay');
  const silenceCountdownDisplay = document.getElementById('silenceCountdownDisplay');
  const safetyProgressFill = document.getElementById('safetyProgressFill');
  const safetyProgressText = document.getElementById('safetyProgressText');
  const heardCounterDisplay = document.getElementById('heardCounterDisplay');
  const speedDisplay = document.getElementById('speedDisplay');
  const catRankBadge = document.getElementById('catRankBadge');
  const mascotArea = document.getElementById('mascotArea');
  const speechBubble = document.getElementById('speechBubble');
  const bubbleText = document.getElementById('bubbleText');
  const popOverlay = document.getElementById('popOverlay');
  const listenToggleBtn = document.getElementById('listenToggleBtn');
  const micBtnLabel = document.getElementById('micBtnLabel');
  const visualizerBar = document.getElementById('visualizerBar');
  const statusDot = document.getElementById('statusDot');
  const statusMsg = document.getElementById('statusMsg');
  const hearCatMeowBtn = document.getElementById('hearCatMeowBtn');
  const resetSessionBtn = document.getElementById('resetSessionBtn');
  const transcriptFeed = document.getElementById('transcriptFeed');
  const detectionModeSelect = document.getElementById('detectionModeSelect');
  const sensitivitySlider = document.getElementById('sensitivitySlider');
  const sensitivityWrap = document.getElementById('sensitivityWrap');
  const sensitivityValDisplay = document.getElementById('sensitivityValDisplay');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIcon = document.getElementById('themeIcon');
  const themeLabel = document.getElementById('themeLabel');
  const sfxToggleBtn = document.getElementById('sfxToggleBtn');
  const sfxIcon = document.getElementById('sfxIcon');
  const userAuthPill = document.getElementById('userAuthPill');
  const toastContainer = document.getElementById('toastContainer');
  const pawBackground = document.getElementById('pawBackground');

  // Stats Modal Elements
  const openStatsBtn = document.getElementById('openStatsBtn');
  const closeStatsBtn = document.getElementById('closeStatsBtn');
  const statsModalBackdrop = document.getElementById('statsModalBackdrop');
  const statTodayTotal = document.getElementById('statTodayTotal');
  const statTodayHeard = document.getElementById('statTodayHeard');
  const statPeakHour = document.getElementById('statPeakHour');
  const statPeakCount = document.getElementById('statPeakCount');
  const statMaxSpeed = document.getElementById('statMaxSpeed');
  const statBestStreak = document.getElementById('statBestStreak');
  const hourlyCanvas = document.getElementById('hourlyCanvas');
  const tierList = document.getElementById('tierList');
  const copySummaryBtn = document.getElementById('copySummaryBtn');
  const clearTodayStatsBtn = document.getElementById('clearTodayStatsBtn');

  // Leaderboard Modal Elements
  const openLeaderboardBtn = document.getElementById('openLeaderboardBtn');
  const closeLeaderboardBtn = document.getElementById('closeLeaderboardBtn');
  const leaderboardModalBackdrop = document.getElementById('leaderboardModalBackdrop');
  const profileCard = document.getElementById('profileCard');
  const podiumRow = document.getElementById('podiumRow');
  const leaderboardTable = document.getElementById('leaderboardTable');
  const leaderboardThead = document.getElementById('leaderboardThead');
  const leaderboardTbody = document.getElementById('leaderboardTbody');
  const tabDailyMeows = document.getElementById('tabDailyMeows');
  const tabCompetitiveContinuous = document.getElementById('tabCompetitiveContinuous');
  const leaderboardTabHint = document.getElementById('leaderboardTabHint');

  // Competitive Rules Modal Elements
  const competitiveRulesModalBackdrop = document.getElementById('competitiveRulesModalBackdrop');
  const closeCompetitiveRulesBtn = document.getElementById('closeCompetitiveRulesBtn');
  const gotRulesBtn = document.getElementById('gotRulesBtn');

  // Safety Cap Modal Elements ("Touch Grass & Drink Water")
  const safetyCapModalBackdrop = document.getElementById('safetyCapModalBackdrop');
  const acknowledgeSafetyBtn = document.getElementById('acknowledgeSafetyBtn');
  const safetyRunSummary = document.getElementById('safetyRunSummary');

  // Auth Modal Elements
  const authModalBackdrop = document.getElementById('authModalBackdrop');
  const closeAuthBtn = document.getElementById('closeAuthBtn');
  const nicknameInput = document.getElementById('nicknameInput');
  const nameErrorMsg = document.getElementById('nameErrorMsg');
  const randomNameBtn = document.getElementById('randomNameBtn');
  const avatarOptions = document.getElementById('avatarOptions');
  const saveProfileBtn = document.getElementById('saveProfileBtn');

  // Mobile Bottom Bar Elements
  const mobileBottomBar = document.getElementById('mobileBottomBar');
  const mobileHearCatBtn = document.getElementById('mobileHearCatBtn');
  const mobileMicBtn = document.getElementById('mobileMicBtn');
  const mobileMicIcon = document.getElementById('mobileMicIcon');
  const mobileMicLabel = document.getElementById('mobileMicLabel');
  const mobileLeaderboardBtn = document.getElementById('mobileLeaderboardBtn');
  const mobileStatsBtn = document.getElementById('mobileStatsBtn');
  const mobileAchievementsBtn = document.getElementById('mobileAchievementsBtn');

  // Achievements Showcase & Tracker Elements (Pure Total Meow Basis)
  const openAchievementsBtn = document.getElementById('openAchievementsBtn');
  const viewAchievementsBtn = document.getElementById('viewAchievementsBtn');
  const closeAchievementsBtn = document.getElementById('closeAchievementsBtn');
  const closeAchievementsBottomBtn = document.getElementById('closeAchievementsBottomBtn');
  const achievementsModalBackdrop = document.getElementById('achievementsModalBackdrop');
  const achievementsListGrid = document.getElementById('achievementsListGrid');
  const headerAchieveCount = document.getElementById('headerAchieveCount');
  const unlockedCountBadge = document.getElementById('unlockedCountBadge');
  const nextAchieveIcon = document.getElementById('nextAchieveIcon');
  const nextAchieveName = document.getElementById('nextAchieveName');
  const achievementProgressFill = document.getElementById('achievementProgressFill');
  const achievementProgressText = document.getElementById('achievementProgressText');
  const achievementRemainingText = document.getElementById('achievementRemainingText');
  const achieveTotalSpokenDisplay = document.getElementById('achieveTotalSpokenDisplay');
  const achieveUnlockedCountDisplay = document.getElementById('achieveUnlockedCountDisplay');
  const achieveCurrentRankDisplay = document.getElementById('achieveCurrentRankDisplay');
  const testChimeBtn = document.getElementById('testChimeBtn');

  // --- Helper: Format Today's Date YYYY-MM-DD ---
  function getTodayKey() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // --- Daily Statistics Management ---
  function loadDailyStats() {
    const today = getTodayKey();
    const key = STORAGE_PREFIX + today;
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed.spokenMeows !== 'number') parsed.spokenMeows = parsed.totalMeows || 0;
        if (typeof parsed.heardMeows !== 'number') parsed.heardMeows = 0;
        if (typeof parsed.bestStreak !== 'number') parsed.bestStreak = 0;
        if (typeof parsed.bestContinuousStreak !== 'number') parsed.bestContinuousStreak = parsed.bestStreak || 0;
        if (typeof parsed.bestContinuousDuration !== 'number') parsed.bestContinuousDuration = 0;
        if (typeof parsed.bestContinuousPace !== 'number') parsed.bestContinuousPace = 0;
        if (!parsed.hourly) parsed.hourly = {};
        for (let h = 0; h < 24; h++) {
          if (typeof parsed.hourly[h] !== 'number') parsed.hourly[h] = 0;
        }
        return parsed;
      } catch (e) {
        console.error('Failed to parse stats', e);
      }
    }

    const initial = {
      date: today,
      spokenMeows: 0,
      heardMeows: 0,
      hourly: {},
      maxSpeedMPM: 0,
      bestStreak: 0,
      bestContinuousStreak: 0,
      bestContinuousDuration: 0,
      bestContinuousPace: 0,
      milestones: []
    };
    for (let h = 0; h < 24; h++) initial.hourly[h] = 0;
    return initial;
  }

  function saveDailyStats(stats) {
    const key = STORAGE_PREFIX + stats.date;
    localStorage.setItem(key, JSON.stringify(stats));
  }

  let dailyStats = loadDailyStats();

  // --- Anonymous Authentication & Session Persistence ---
  function loadUserProfile() {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    return null;
  }

  function saveUserProfile(profile) {
    if (profile) {
      localStorage.setItem(USER_KEY, JSON.stringify(profile));
    } else {
      localStorage.removeItem(USER_KEY);
    }
    updateUserAuthUI();
    syncUserToLeaderboard();
  }

  let currentUser = loadUserProfile();

  function updateUserAuthUI() {
    if (!userAuthPill) return;
    if (currentUser) {
      userAuthPill.innerHTML = `
        <div class="auth-badge" title="Click to edit nickname">
          <span>${currentUser.avatar}</span>
          <span>${currentUser.nickname}</span>
          <button class="sign-out-btn" id="signOutBtn" title="Sign out of this session">Sign Out</button>
        </div>
      `;
      const signOutBtn = document.getElementById('signOutBtn');
      if (signOutBtn) {
        signOutBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          currentUser = null;
          saveUserProfile(null);
          showToast('Signed out! You can sign in anytime with a new nickname. 🐾');
        });
      }

      const authBadge = userAuthPill.querySelector('.auth-badge');
      if (authBadge) {
        authBadge.style.cursor = 'pointer';
        authBadge.addEventListener('click', (e) => {
          if (e.target.id === 'signOutBtn') return;
          nicknameInput.value = currentUser ? currentUser.nickname : '';
          openAuthModal();
        });
      }
    } else {
      userAuthPill.innerHTML = `
        <button id="signInHeaderBtn" class="pill-btn secondary-pill" aria-label="Sign In">
          <span>🐱</span>
          <span class="btn-text">Sign In</span>
        </button>
      `;
      const signInBtn = document.getElementById('signInHeaderBtn');
      if (signInBtn) signInBtn.addEventListener('click', openAuthModal);
    }
  }

  function openAuthModal() {
    if (!nicknameInput.value) {
      nicknameInput.value = generateRandomCuteName();
    }
    if (nameErrorMsg) {
      nameErrorMsg.style.display = 'none';
      nameErrorMsg.textContent = '';
    }
    nicknameInput.classList.remove('error');
    authModalBackdrop.classList.add('open');
    authModalBackdrop.setAttribute('aria-hidden', 'false');
    setTimeout(() => nicknameInput.focus(), 150);
  }

  function closeAuthModal() {
    authModalBackdrop.classList.remove('open');
    authModalBackdrop.setAttribute('aria-hidden', 'true');
    if (nameErrorMsg) {
      nameErrorMsg.style.display = 'none';
      nameErrorMsg.textContent = '';
    }
    nicknameInput.classList.remove('error');
  }

  // --- Wholesome Feline Profanity Filter ---
  const FORBIDDEN_WORDS = [
    'fuck', 'fuk', 'fck', 'shit', 'sh1t', 'bitch', 'b1tch', 'asshole', 'arsehole',
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
    const collapsed = alphaOnly.replace(/(.)\1{2,}/g, '$1$1');
    const singleCollapsed = alphaOnly.replace(/(.)\1+/g, '$1');

    for (const bad of FORBIDDEN_WORDS) {
      if (lower.includes(bad)) return true;
      if (leetCleaned.includes(bad)) return true;
      if (alphaOnly.includes(bad)) return true;
      if (collapsed.includes(bad) || singleCollapsed.includes(bad)) return true;
    }
    return false;
  }

  function generateRandomCuteName() {
    const p = CUTE_NAME_PREFIXES[Math.floor(Math.random() * CUTE_NAME_PREFIXES.length)];
    const s = CUTE_NAME_SUFFIXES[Math.floor(Math.random() * CUTE_NAME_SUFFIXES.length)];
    const num = Math.floor(Math.random() * 90 + 10);
    return `${p}${s}${num}`;
  }

  if (randomNameBtn) {
    randomNameBtn.addEventListener('click', () => {
      nicknameInput.value = generateRandomCuteName();
      nicknameInput.classList.remove('error');
      if (nameErrorMsg) {
        nameErrorMsg.style.display = 'none';
        nameErrorMsg.textContent = '';
      }
    });
  }

  if (nicknameInput) {
    nicknameInput.addEventListener('input', () => {
      nicknameInput.classList.remove('error');
      if (nameErrorMsg) {
        nameErrorMsg.style.display = 'none';
        nameErrorMsg.textContent = '';
      }
    });
  }

  if (avatarOptions) {
    avatarOptions.addEventListener('click', (e) => {
      const btn = e.target.closest('.avatar-choice');
      if (!btn) return;
      avatarOptions.querySelectorAll('.avatar-choice').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedAvatar = btn.getAttribute('data-avatar');
    });
  }

  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', () => {
      const name = nicknameInput.value.trim();
      if (!name) {
        showToast('Please enter a nickname!');
        nicknameInput.focus();
        return;
      }

      if (containsProfanity(name)) {
        nicknameInput.classList.remove('error');
        void nicknameInput.offsetWidth;
        nicknameInput.classList.add('error');

        if (nameErrorMsg) {
          nameErrorMsg.textContent = '😿 Inappropriate nickname! Please choose a cute, family-friendly cat handle.';
          nameErrorMsg.style.display = 'block';
        }

        showToast('😿 Inappropriate nickname! Keep it wholesome.');
        if (navigator.vibrate) {
          try { navigator.vibrate([40, 60, 40]); } catch (e) {}
        }
        nicknameInput.focus();
        return;
      }

      currentUser = {
        id: currentUser ? currentUser.id : 'user_' + Date.now(),
        nickname: name,
        avatar: selectedAvatar,
        joinedAt: Date.now()
      };
      saveUserProfile(currentUser);
      closeAuthModal();
      showToast(`Welcome, ${currentUser.avatar} ${currentUser.nickname}! You're on the leaderboard! 🎉`);
    });
  }

  if (closeAuthBtn) closeAuthBtn.addEventListener('click', closeAuthModal);
  if (authModalBackdrop) {
    authModalBackdrop.addEventListener('click', (e) => {
      if (e.target === authModalBackdrop) closeAuthModal();
    });
  }

  // --- Real Public Leaderboard with Backend REST API (NO MOCK DATA) ---
  async function fetchLeaderboardData() {
    try {
      const res = await fetch('/api/leaderboard');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(data));
          return data;
        }
      }
    } catch (e) {
      // Local fallback
    }
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  async function syncUserToLeaderboard() {
    if (!currentUser) return;
    const tier = getCurrentTier();
    const userPayload = {
      id: currentUser.id,
      name: currentUser.nickname,
      avatar: currentUser.avatar,
      spokenMeows: dailyStats.spokenMeows,
      continuousStreak: dailyStats.bestContinuousStreak || dailyStats.bestStreak || 0,
      continuousDurationSeconds: dailyStats.bestContinuousDuration || 0,
      continuousPace: dailyStats.bestContinuousPace || 0,
      tier: `${tier.name} ${tier.badge}`
    };

    // 1. Post to backend REST API
    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userPayload)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.leaderboard) {
          localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(json.leaderboard));
          if (leaderboardModalBackdrop && leaderboardModalBackdrop.classList.contains('open')) {
            renderLeaderboardUI(json.leaderboard);
          }
          return;
        }
      }
    } catch (e) {
      // Offline fallback
    }

    // 2. Local fallback
    const board = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]');
    const idx = board.findIndex(p => p.id === currentUser.id || p.name.toLowerCase() === currentUser.nickname.toLowerCase());
    if (idx >= 0) {
      const old = board[idx];
      const shouldUpdateContinuous = 
        (userPayload.continuousStreak > (old.continuousStreak || 0)) ||
        (userPayload.continuousStreak === (old.continuousStreak || 0) && userPayload.continuousDurationSeconds > 0 && userPayload.continuousDurationSeconds < (old.continuousDurationSeconds || 999999)) ||
        !(old.continuousStreak);

      board[idx] = {
        ...old,
        ...userPayload,
        spokenMeows: Math.max(old.spokenMeows || 0, userPayload.spokenMeows),
        continuousStreak: shouldUpdateContinuous ? userPayload.continuousStreak : (old.continuousStreak || 0),
        continuousDurationSeconds: shouldUpdateContinuous ? userPayload.continuousDurationSeconds : (old.continuousDurationSeconds || 0),
        continuousPace: shouldUpdateContinuous ? userPayload.continuousPace : (old.continuousPace || 0)
      };
    } else {
      board.push(userPayload);
    }
    board.sort((a, b) => (b.spokenMeows || 0) - (a.spokenMeows || 0));
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(board));

    if (leaderboardModalBackdrop && leaderboardModalBackdrop.classList.contains('open')) {
      renderLeaderboardUI(board);
    }
  }

  async function openLeaderboardModal() {
    await syncUserToLeaderboard();
    const board = await fetchLeaderboardData();
    renderLeaderboardUI(board);
    leaderboardModalBackdrop.classList.add('open');
    leaderboardModalBackdrop.setAttribute('aria-hidden', 'false');
    if (mobileBottomBar) mobileBottomBar.style.transform = 'translateY(150%)';
  }

  function closeLeaderboardModal() {
    leaderboardModalBackdrop.classList.remove('open');
    leaderboardModalBackdrop.setAttribute('aria-hidden', 'true');
    if (mobileBottomBar) mobileBottomBar.style.transform = '';
  }

  if (openLeaderboardBtn) openLeaderboardBtn.addEventListener('click', openLeaderboardModal);
  if (closeLeaderboardBtn) closeLeaderboardBtn.addEventListener('click', closeLeaderboardModal);
  if (leaderboardModalBackdrop) {
    leaderboardModalBackdrop.addEventListener('click', (e) => {
      if (e.target === leaderboardModalBackdrop) closeLeaderboardModal();
    });
  }

  // --- Leaderboard Tab Switching (Daily vs Competitive Continuous) ---
  if (tabDailyMeows) {
    tabDailyMeows.addEventListener('click', () => {
      activeLeaderboardTab = 'daily';
      tabDailyMeows.classList.add('active');
      tabDailyMeows.setAttribute('aria-selected', 'true');
      if (tabCompetitiveContinuous) {
        tabCompetitiveContinuous.classList.remove('active');
        tabCompetitiveContinuous.setAttribute('aria-selected', 'false');
      }
      if (leaderboardTabHint) {
        leaderboardTabHint.textContent = "Showing all-day cumulative meows • Say meow to your heart's content!";
      }
      fetchLeaderboardData().then(board => renderLeaderboardUI(board));
    });
  }

  if (tabCompetitiveContinuous) {
    tabCompetitiveContinuous.addEventListener('click', () => {
      activeLeaderboardTab = 'continuous';
      tabCompetitiveContinuous.classList.add('active');
      tabCompetitiveContinuous.setAttribute('aria-selected', 'true');
      if (tabDailyMeows) {
        tabDailyMeows.classList.remove('active');
        tabDailyMeows.setAttribute('aria-selected', 'false');
      }
      if (leaderboardTabHint) {
        leaderboardTabHint.textContent = "🏆 Ranked by continuous meow count & time taken (pace in MPM). Max 60s silence breaks.";
      }
      fetchLeaderboardData().then(board => renderLeaderboardUI(board));
    });
  }

  function renderLeaderboardUI(board = []) {
    // Sort according to active tab
    if (activeLeaderboardTab === 'continuous') {
      board.sort((a, b) => {
        const streakDiff = (b.continuousStreak || 0) - (a.continuousStreak || 0);
        if (streakDiff !== 0) return streakDiff;
        // Shorter time taken ranks higher (breaks 1-meow-per-minute exploiters!)
        const aTime = a.continuousDurationSeconds || 999999;
        const bTime = b.continuousDurationSeconds || 999999;
        return aTime - bTime;
      });
    } else {
      board.sort((a, b) => (b.spokenMeows || 0) - (a.spokenMeows || 0));
    }

    // Profile card inside leaderboard
    if (profileCard) {
      if (currentUser) {
        const userRank = board.findIndex(p => p.id === currentUser.id || p.name.toLowerCase() === currentUser.nickname.toLowerCase()) + 1;
        const rankText = userRank > 0 ? `#${userRank} Globally 🌟` : 'Unranked (Speak your first meow!)';
        const bestStreakCount = dailyStats.bestContinuousStreak || dailyStats.bestStreak || 0;
        const bestStreakDur = formatDurationText(dailyStats.bestContinuousDuration || 0);
        const bestStreakPace = (dailyStats.bestContinuousPace || 0) > 0 ? `${dailyStats.bestContinuousPace.toFixed(1)} MPM` : '--';

        profileCard.innerHTML = `
          <div class="profile-info">
            <div class="profile-avatar">${currentUser.avatar}</div>
            <div>
              <div class="profile-name">${currentUser.nickname}</div>
              <div class="profile-rank">${rankText}</div>
            </div>
          </div>
          <div class="profile-stats-pill">
            <span class="stat-pill">🎙️ ${dailyStats.spokenMeows} Total</span>
            <span class="stat-pill">🔥 ${bestStreakCount} Run (${bestStreakDur} &bull; ${bestStreakPace})</span>
          </div>
        `;
      } else {
        profileCard.innerHTML = `
          <div class="profile-info">
            <div class="profile-avatar">🐱</div>
            <div>
              <div class="profile-name">Join the Leaderboard!</div>
              <div class="profile-rank">Choose your cat handle with anonymous sign-in</div>
            </div>
          </div>
          <button id="signInLeaderboardBtn" class="pill-btn primary-pill">
            <span>✨</span> Sign In Now
          </button>
        `;
        const btn = document.getElementById('signInLeaderboardBtn');
        if (btn) btn.addEventListener('click', () => {
          closeLeaderboardModal();
          setTimeout(openAuthModal, 200);
        });
      }
    }

    // Top 3 Podium
    if (podiumRow) {
      if (board.length >= 3) {
        const top3 = board.slice(0, 3);
        const podiumOrder = [
          { item: top3[1], pos: 2, badge: '🥈 2nd', class: 'podium-2' },
          { item: top3[0], pos: 1, badge: '👑 1st', class: 'podium-1' },
          { item: top3[2], pos: 3, badge: '🥉 3rd', class: 'podium-3' }
        ];

        podiumRow.style.display = 'flex';
        podiumRow.innerHTML = podiumOrder.map(p => {
          if (!p.item) return '';
          const scoreDisplay = activeLeaderboardTab === 'continuous'
            ? `${p.item.continuousStreak || 0} meows (${formatDurationText(p.item.continuousDurationSeconds || 0)})`
            : `${p.item.spokenMeows || 0} meows`;
          return `
            <div class="podium-step ${p.class}">
              <div class="podium-avatar">${p.item.avatar || '🐱'}</div>
              <div class="podium-name">${p.item.name}</div>
              <div class="podium-score">${scoreDisplay}</div>
              <div class="podium-badge">${p.badge}</div>
            </div>
          `;
        }).join('');
      } else {
        podiumRow.style.display = 'none';
        podiumRow.innerHTML = '';
      }
    }

    // Table Header
    if (leaderboardThead) {
      if (activeLeaderboardTab === 'continuous') {
        leaderboardThead.innerHTML = `
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Continuous Run 🔥</th>
            <th>Time Taken ⏱️</th>
            <th>Pace ⚡</th>
            <th>Tier 🎀</th>
          </tr>
        `;
      } else {
        leaderboardThead.innerHTML = `
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Total Meows 🎙️</th>
            <th>Best Streak 🔥</th>
            <th>Tier 🎀</th>
          </tr>
        `;
      }
    }

    // Table Rows
    if (leaderboardTbody) {
      if (board.length === 0) {
        leaderboardTbody.innerHTML = `
          <tr>
            <td colspan="${activeLeaderboardTab === 'continuous' ? 6 : 5}">
              <div class="empty-leaderboard-msg">
                <span class="empty-icon">🐱</span>
                <span>No felines on the leaderboard yet!<br>Be the very first player to sign in and meow!</span>
              </div>
            </td>
          </tr>
        `;
      } else {
        leaderboardTbody.innerHTML = board.map((p, idx) => {
          const isMe = currentUser && (p.id === currentUser.id || p.name.toLowerCase() === currentUser.nickname.toLowerCase());
          const rankDisplay = idx === 0 ? '👑 1' : idx === 1 ? '🥈 2' : idx === 2 ? '🥉 3' : `#${idx + 1}`;
          
          if (activeLeaderboardTab === 'continuous') {
            const timeText = formatDurationText(p.continuousDurationSeconds || 0);
            const paceText = (p.continuousPace || 0) > 0 ? `${(p.continuousPace).toFixed(1)} MPM` : '--';
            return `
              <tr class="${isMe ? 'current-user-row' : ''}">
                <td><strong>${rankDisplay}</strong></td>
                <td>${p.avatar || '🐱'} ${p.name} ${isMe ? '🐾 (You)' : ''}</td>
                <td><strong>${(p.continuousStreak || 0).toLocaleString()} meows</strong></td>
                <td>⏱️ ${timeText}</td>
                <td>⚡ ${paceText}</td>
                <td><small>${p.tier || 'Curious Kitten 🐾'}</small></td>
              </tr>
            `;
          } else {
            return `
              <tr class="${isMe ? 'current-user-row' : ''}">
                <td><strong>${rankDisplay}</strong></td>
                <td>${p.avatar || '🐱'} ${p.name} ${isMe ? '🐾 (You)' : ''}</td>
                <td><strong>${(p.spokenMeows || 0).toLocaleString()}</strong></td>
                <td>${(p.continuousStreak || 0).toLocaleString()}</td>
                <td><small>${p.tier || 'Curious Kitten 🐾'}</small></td>
              </tr>
            `;
          }
        }).join('');
      }
    }
  }

  // ==========================================================================
  // Authentic Feline Cat Voice Engine (REAL Cat Sounds - NO Human Speech!)
  // ==========================================================================
  // ==========================================================================
  // Authentic Feline Cat Voice Engine (REAL Cat Sounds - Warm, Sweet & Organic)
  // ==========================================================================
  function playAuthenticCatMeow(variant = 0) {
    if (!sfxEnabled) return;
    selfSoundUntil = Math.max(selfSoundUntil, performance.now() + 1100);
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = audioContext || new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;

      // 4 Distinct Real Kitten Vocal Profiles (Pitch curves & formant targets)
      const profiles = [
        // 0: Classic Sweet Kitten Meow ("Meooww~")
        { startF: 490, peakF: 820, endF: 430, dur: 0.78, peakT: 0.30, f1Start: 460, f1Peak: 1950, f1End: 520, vibFreq: 5.6, vibDepth: 14, breathVol: 0.025 },
        // 1: Playful High Kitten Nya ("Nyaaa~!")
        { startF: 580, peakF: 940, endF: 520, dur: 0.65, peakT: 0.24, f1Start: 540, f1Peak: 2250, f1End: 580, vibFreq: 6.2, vibDepth: 16, breathVol: 0.028 },
        // 2: Expressive Tender Meow ("Mew-meww...")
        { startF: 460, peakF: 760, endF: 390, dur: 0.85, peakT: 0.36, f1Start: 420, f1Peak: 1750, f1End: 480, vibFreq: 5.0, vibDepth: 12, breathVol: 0.020 },
        // 3: Inquisitive Soft Kitten Chirp ("Mrr-meow?")
        { startF: 520, peakF: 880, endF: 480, dur: 0.70, peakT: 0.28, f1Start: 480, f1Peak: 2100, f1End: 550, vibFreq: 7.0, vibDepth: 18, breathVol: 0.030 }
      ];

      const p = profiles[variant % profiles.length];
      const duration = p.dur;

      // Master Gain Node
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.0001, now);
      // Soft organic attack ("Mmm-")
      masterGain.gain.linearRampToValueAtTime(0.28, now + 0.10);
      // Gentle expressive sustain ("-eee-aaa-")
      masterGain.gain.setValueAtTime(0.25, now + p.peakT + 0.12);
      // Smooth natural decay ("-oooww...")
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      // --- 1. Glottal Vocal Source: Triangle wave (Soft harmonic rolloff) ---
      const oscTriangle = ctx.createOscillator();
      oscTriangle.type = 'triangle';

      // --- 2. Sub-Glottal Warmth: Sine wave (Pure feline throat resonance) ---
      const oscSine = ctx.createOscillator();
      oscSine.type = 'sine';

      // Pitch glide for vocal cords (/m/ -> /ɛ-æ/ -> /u-w/)
      [oscTriangle, oscSine].forEach(osc => {
        osc.frequency.setValueAtTime(p.startF, now);
        osc.frequency.exponentialRampToValueAtTime(p.peakF, now + p.peakT);
        osc.frequency.exponentialRampToValueAtTime(p.endF, now + duration);
      });

      // --- 3. Feline Laryngeal Vibrato (LFO) ---
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(p.vibFreq, now);
      lfoGain.gain.setValueAtTime(0, now);
      // Vibrato gently swells during the sustained vowel
      lfoGain.gain.linearRampToValueAtTime(p.vibDepth, now + p.peakT);
      lfoGain.gain.linearRampToValueAtTime(p.vibDepth * 0.4, now + duration);
      lfo.connect(lfoGain);
      lfoGain.connect(oscTriangle.frequency);
      lfoGain.connect(oscSine.frequency);
      lfo.start(now);
      lfo.stop(now + duration + 0.05);

      // --- 4. Dynamic Mouth & Throat Formant Filters ("M - E - O - W" Vowel Morph) ---
      // Formant 1: Mouth opening and closing transition
      const mouthFormant = ctx.createBiquadFilter();
      mouthFormant.type = 'bandpass';
      mouthFormant.Q.setValueAtTime(2.6, now);
      mouthFormant.frequency.setValueAtTime(p.f1Start, now);
      mouthFormant.frequency.exponentialRampToValueAtTime(p.f1Peak, now + p.peakT);
      mouthFormant.frequency.exponentialRampToValueAtTime(p.f1End, now + duration);

      // Formant 2: Nasal kitten cavity resonance (peaking around 2.4kHz - 2.8kHz)
      const nasalResonance = ctx.createBiquadFilter();
      nasalResonance.type = 'peaking';
      nasalResonance.frequency.setValueAtTime(2500, now);
      nasalResonance.Q.setValueAtTime(2.0, now);
      nasalResonance.gain.setValueAtTime(4.0, now);

      // Lowpass Filter: Tames high-frequency harshness for a velvety kitten voice
      const warmthFilter = ctx.createBiquadFilter();
      warmthFilter.type = 'lowpass';
      warmthFilter.frequency.setValueAtTime(3600, now);

      // Gain balancing between triangle and sine
      const triGain = ctx.createGain();
      triGain.gain.setValueAtTime(0.65, now);
      const sineGain = ctx.createGain();
      sineGain.gain.setValueAtTime(0.45, now);

      oscTriangle.connect(triGain);
      oscSine.connect(sineGain);
      triGain.connect(mouthFormant);
      sineGain.connect(mouthFormant);

      mouthFormant.connect(nasalResonance);
      nasalResonance.connect(warmthFilter);
      warmthFilter.connect(masterGain);

      // --- 5. Organic Feline Throat Breath Noise ---
      // Very soft, filtered breath gives the animal voice realism
      try {
        const bufferSize = Math.floor(ctx.sampleRate * duration);
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          output[i] = (lastOut + 0.02 * white) / 1.02; // Soft pink noise
          lastOut = output[i];
        }
        const noiseNode = ctx.createBufferSource();
        noiseNode.buffer = noiseBuffer;

        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(2100, now);
        noiseFilter.Q.setValueAtTime(1.8, now);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.0001, now);
        noiseGain.gain.linearRampToValueAtTime(p.breathVol, now + p.peakT * 0.7);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        noiseNode.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterGain);

        noiseNode.start(now);
        noiseNode.stop(now + duration + 0.05);
      } catch (err) {}

      masterGain.connect(ctx.destination);

      oscTriangle.start(now);
      oscSine.start(now);
      oscTriangle.stop(now + duration + 0.05);
      oscSine.stop(now + duration + 0.05);
    } catch (e) {
      console.warn('Real cat sound error:', e);
    }
  }

  // --- Talking Mascot Click: REAL Cat Sound & Increases Heard Count ---
  function triggerCatMascotSpeak() {
    const today = getTodayKey();
    if (dailyStats.date !== today) dailyStats = loadDailyStats();

    dailyStats.heardMeows += 1;
    saveDailyStats(dailyStats);

    // Play REAL feline acoustic meow (cycles through authentic animal sounds)
    playAuthenticCatMeow(catSoundIndex++);

    // Mascot facial reaction
    mascotArea.classList.add('meowing');
    clearTimeout(mouthResetTimer);
    mouthResetTimer = setTimeout(() => {
      mascotArea.classList.remove('meowing');
    }, 420);

    // Cute speech bubble
    const phrase = CAT_VOCAL_PHRASES[Math.floor(Math.random() * CAT_VOCAL_PHRASES.length)];
    bubbleText.textContent = phrase;
    speechBubble.classList.add('active');
    clearTimeout(bubbleResetTimer);
    bubbleResetTimer = setTimeout(() => {
      speechBubble.classList.remove('active');
    }, 1100);

    createFloatingParticle('1 🐾');

    if (navigator.vibrate) {
      try { navigator.vibrate(25); } catch (e) {}
    }

    updateUI();
  }

  mascotArea.addEventListener('click', triggerCatMascotSpeak);
  if (hearCatMeowBtn) hearCatMeowBtn.addEventListener('click', triggerCatMascotSpeak);
  if (mobileHearCatBtn) mobileHearCatBtn.addEventListener('click', triggerCatMascotSpeak);

  // --- Continuous Telemetry & Stopwatch Updates ---
  function updateStreakTelemetryUI() {
    if (runTimerDisplay) {
      runTimerDisplay.textContent = formatTimer(streakDurationSeconds);
    }
    if (runPaceDisplay) {
      const pace = streakDurationSeconds > 0 ? (streakCount / (streakDurationSeconds / 60)).toFixed(1) : '0.0';
      runPaceDisplay.textContent = pace;
    }
    if (silenceCountdownDisplay) {
      silenceCountdownDisplay.textContent = `${silenceSecondsRemaining}s`;
      if (silenceSecondsRemaining <= 15) {
        silenceCountdownDisplay.style.color = '#ef4444';
      } else {
        silenceCountdownDisplay.style.color = '#10b981';
      }
    }
    if (safetyProgressFill) {
      const pct = Math.min(100, Math.round((streakDurationSeconds / 1800) * 100));
      safetyProgressFill.style.width = `${pct}%`;
    }
    if (safetyProgressText) {
      const mins = Math.floor(streakDurationSeconds / 60);
      const secs = streakDurationSeconds % 60;
      safetyProgressText.textContent = `${mins}m ${secs}s / 30 mins`;
    }
    if (submitRunBtn) {
      if (streakCount > 0) {
        submitRunBtn.classList.add('pulse-active');
        submitRunBtn.title = `Submit & lock in ${streakCount} meows (${formatTimer(streakDurationSeconds)}) right now without waiting 60s!`;
      } else {
        submitRunBtn.classList.remove('pulse-active');
        submitRunBtn.title = 'Start meowing to build a continuous run first!';
      }
    }
  }

  function concludeContinuousRun(reason = 'silence') {
    clearInterval(streakStopwatchInterval);
    streakStopwatchInterval = null;
    clearInterval(silenceCountdownInterval);
    silenceCountdownInterval = null;
    clearTimeout(streakInactivityTimer);
    streakInactivityTimer = null;

    const finalCount = streakCount;
    const finalDuration = streakDurationSeconds;
    const finalPace = finalDuration > 0 ? Math.round((finalCount / (finalDuration / 60)) * 10) / 10 : 0;

    if (finalCount > 0) {
      const oldStreak = dailyStats.bestContinuousStreak || dailyStats.bestStreak || 0;
      const oldDuration = dailyStats.bestContinuousDuration || 999999;
      
      const isNewBest = 
        (finalCount > oldStreak) ||
        (finalCount === oldStreak && finalDuration > 0 && finalDuration < oldDuration) ||
        (!oldStreak);

      if (isNewBest) {
        dailyStats.bestContinuousStreak = finalCount;
        dailyStats.bestContinuousDuration = finalDuration;
        dailyStats.bestContinuousPace = finalPace;
        dailyStats.bestStreak = finalCount;
        saveDailyStats(dailyStats);
        syncUserToLeaderboard();
      }
    }

    streakCount = 0;
    streakStartTime = null;
    streakDurationSeconds = 0;
    silenceSecondsRemaining = 60;

    if (streakTimerStatus) {
      streakTimerStatus.textContent = 'Auto-concludes after 1 minute of silence • Max 30 mins';
      streakTimerStatus.style.color = '';
    }

    updateStreakTelemetryUI();
    updateUI();

    if (reason === 'safety_limit_30m') {
      if (safetyRunSummary) {
        safetyRunSummary.textContent = `Your continuous run (${finalCount} meows in 30:00 • ${finalPace} MPM) has been locked and saved to the leaderboard!`;
      }
      if (safetyCapModalBackdrop) {
        safetyCapModalBackdrop.classList.add('open');
        safetyCapModalBackdrop.setAttribute('aria-hidden', 'false');
      }
      showToast('🛑 30-Minute safety limit reached! Please touch grass 🌱 and drink water 💧!');
      if (navigator.vibrate) {
        try { navigator.vibrate([100, 100, 100, 100, 200]); } catch (e) {}
      }
    } else if (reason === 'manual_submit') {
      if (finalCount > 0) {
        showToast(`🏁 Run locked in & submitted! ${finalCount} meows in ${formatTimer(finalDuration)} (${finalPace} MPM) synced! 🎉`);
        triggerVoiceVisuals(1);
      } else {
        showToast('Run ended. No meows recorded yet! 🐾');
      }
    } else if (reason === 'silence' && finalCount > 0) {
      showToast(`Continuous run ended (${finalCount} meows in ${formatTimer(finalDuration)} • ${finalPace} MPM). Total Daily Meows are safe! 💕`);
    }
  }

  // Debug helper to easily preview the 30-minute safety limit modal
  window.trigger30MinSafetyModalTest = () => {
    concludeContinuousRun('safety_limit_30m');
  };

  // --- Unified Meow Dispatcher (Deduplicates Acoustic & Speech Fusion) ---
  function registerSpokenMeowUnified(source = 'Vocal Meow 🐾') {
    const now = Date.now();
    // Refractory cooldown: prevent double-firing within 180ms
    if (now - lastRegisteredMeowTimestamp < 180) {
      return;
    }
    lastRegisteredMeowTimestamp = now;
    registerSpokenMeow(1, source);
  }

  // --- Voice Meow Registration (Human Voice Spoken Only) ---
  function registerSpokenMeow(count, detectedWord = 'Voice') {
    if (count <= 0) return;

    const today = getTodayKey();
    if (dailyStats.date !== today) dailyStats = loadDailyStats();

    const currentHour = new Date().getHours();
    
    // 1. Total Daily Meows (Main Focus - accumulates all day to your heart's content!)
    dailyStats.spokenMeows += count;
    dailyStats.hourly[currentHour] = (dailyStats.hourly[currentHour] || 0) + count;

    // 2. One-Shot Continuous Meow Run (with Live Stopwatch & Anti-Cheat Pace Recording)
    streakCount += count;

    // Start live continuous stopwatch on first meow of the run
    if (!streakStartTime) {
      streakStartTime = Date.now();
      streakDurationSeconds = 1;
      clearInterval(streakStopwatchInterval);
      streakStopwatchInterval = setInterval(() => {
        if (streakStartTime) {
          streakDurationSeconds = Math.max(1, Math.floor((Date.now() - streakStartTime) / 1000));
          updateStreakTelemetryUI();

          // 30-Minute Vocal Safety Cap (1800 seconds)
          if (streakDurationSeconds >= 1800) {
            concludeContinuousRun('safety_limit_30m');
          }
        }
      }, 1000);
    }

    // Reset 1-minute (60s) silence break timer & live countdown
    silenceSecondsRemaining = 60;
    clearInterval(silenceCountdownInterval);
    silenceCountdownInterval = setInterval(() => {
      silenceSecondsRemaining--;
      if (silenceSecondsRemaining <= 0) {
        concludeContinuousRun('silence');
      } else {
        updateStreakTelemetryUI();
      }
    }, 1000);

    if (streakTimerStatus) {
      streakTimerStatus.textContent = 'Active run! (resets if silent for 1 min) • Timing active ⏱️';
      streakTimerStatus.style.color = '#10b981';
    }

    // 3. Velocity / Meows per Minute (MPM)
    const now = Date.now();
    for (let i = 0; i < count; i++) recentMeowTimestamps.push(now);
    recentMeowTimestamps = recentMeowTimestamps.filter(t => now - t <= 10000);
    const currentMPM = Math.round(recentMeowTimestamps.length * 6);
    if (currentMPM > dailyStats.maxSpeedMPM) {
      dailyStats.maxSpeedMPM = currentMPM;
    }

    // Save and sync
    saveDailyStats(dailyStats);
    syncUserToLeaderboard();
    checkMilestones();

    // Trigger visual reactions
    triggerVoiceVisuals(count);
    updateStreakTelemetryUI();
    updateUI(currentMPM);

    addFeedChip(`+${count} (${detectedWord})`, true);

    if (navigator.vibrate) {
      try { navigator.vibrate(30); } catch (e) {}
    }
  }

  // Instant Submit for Continuous Run (locks in score and pace without waiting 1-minute silence!)
  if (submitRunBtn) {
    submitRunBtn.addEventListener('click', () => {
      if (streakCount > 0) {
        concludeContinuousRun('manual_submit');
      } else {
        showToast('Start meowing to build a continuous run first! 🐾');
      }
    });
  }

  // Independent Reset for Continuous Run (Leaves Total Daily Meows Safe!)
  if (resetStreakBtn) {
    resetStreakBtn.addEventListener('click', () => {
      if (streakCount > 0) {
        concludeContinuousRun('reset_button');
        showToast(`Continuous run reset! Total Daily Meows are safe (${dailyStats.spokenMeows}). Ready for a fresh run! 🔥`);
      } else {
        showToast('Continuous run is already at 0. Start meowing to build a new streak! 🐾');
      }
    });
  }

  // --- Competitive Mode Selector Buttons ---
  if (modeCasualBtn && modeCompetitiveBtn) {
    modeCasualBtn.addEventListener('click', () => {
      isCompetitiveMode = false;
      modeCasualBtn.classList.add('active');
      modeCompetitiveBtn.classList.remove('active');
      if (competitiveTelemetryBar) competitiveTelemetryBar.style.display = 'none';
      showToast('Switched to Casual Mode: Meow at your own pace without stopwatch pressure! 🌸');
    });

    modeCompetitiveBtn.addEventListener('click', () => {
      isCompetitiveMode = true;
      modeCompetitiveBtn.classList.add('active');
      modeCasualBtn.classList.remove('active');
      if (competitiveTelemetryBar) competitiveTelemetryBar.style.display = 'flex';
      showToast('Competitive Mode Active! Timer and pace tracking enabled for the leaderboard. 🏆');
    });
  }

  // --- Competitive Rules Modal Listeners ---
  if (competitiveInfoBtn) {
    competitiveInfoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (competitiveRulesModalBackdrop) {
        competitiveRulesModalBackdrop.classList.add('open');
        competitiveRulesModalBackdrop.setAttribute('aria-hidden', 'false');
      }
    });
  }
  if (closeCompetitiveRulesBtn) {
    closeCompetitiveRulesBtn.addEventListener('click', () => {
      competitiveRulesModalBackdrop.classList.remove('open');
      competitiveRulesModalBackdrop.setAttribute('aria-hidden', 'true');
    });
  }
  if (gotRulesBtn) {
    gotRulesBtn.addEventListener('click', () => {
      competitiveRulesModalBackdrop.classList.remove('open');
      competitiveRulesModalBackdrop.setAttribute('aria-hidden', 'true');
    });
  }
  if (competitiveRulesModalBackdrop) {
    competitiveRulesModalBackdrop.addEventListener('click', (e) => {
      if (e.target === competitiveRulesModalBackdrop) {
        competitiveRulesModalBackdrop.classList.remove('open');
        competitiveRulesModalBackdrop.setAttribute('aria-hidden', 'true');
      }
    });
  }

  // --- 30-Minute Safety Modal ("Touch Grass & Drink Water") Listeners ---
  if (acknowledgeSafetyBtn) {
    acknowledgeSafetyBtn.addEventListener('click', () => {
      if (safetyCapModalBackdrop) {
        safetyCapModalBackdrop.classList.remove('open');
        safetyCapModalBackdrop.setAttribute('aria-hidden', 'true');
      }
    });
  }
  if (safetyCapModalBackdrop) {
    safetyCapModalBackdrop.addEventListener('click', (e) => {
      if (e.target === safetyCapModalBackdrop) {
        safetyCapModalBackdrop.classList.remove('open');
        safetyCapModalBackdrop.setAttribute('aria-hidden', 'true');
      }
    });
  }

  function triggerVoiceVisuals(countAdded) {
    mascotArea.classList.add('meowing');
    clearTimeout(mouthResetTimer);
    mouthResetTimer = setTimeout(() => {
      mascotArea.classList.remove('meowing');
    }, 380);

    bubbleText.textContent = countAdded > 1 ? `Heard you! x${countAdded} 🐾` : `Heard you! 🐾`;
    speechBubble.classList.add('active');
    clearTimeout(bubbleResetTimer);
    bubbleResetTimer = setTimeout(() => {
      speechBubble.classList.remove('active');
    }, 900);

    createFloatingParticle(`${countAdded} 🎙️`);

    counterDisplay.classList.remove('bounce');
    void counterDisplay.offsetWidth;
    counterDisplay.classList.add('bounce');

    playCuteMeowTone(540 + Math.random() * 120);
  }

  function createFloatingParticle(label) {
    const p = document.createElement('span');
    p.className = 'floating-plus';
    p.textContent = `+${label}`;
    const xOffset = 90 + (Math.random() * 60 - 30);
    const yOffset = 80 + (Math.random() * 30 - 15);
    p.style.left = `${xOffset}px`;
    p.style.top = `${yOffset}px`;
    popOverlay.appendChild(p);
    setTimeout(() => { if (p.parentElement) p.remove(); }, 950);
  }

  // --- Achievement Sound Effect: Celebratory Bell Fanfare ---
  function playAchievementFanfare() {
    if (!sfxEnabled) return;
    selfSoundUntil = Math.max(selfSoundUntil, performance.now() + 1100);
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = audioContext || new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      const notes = [659.3, 830.6, 987.8, 1318.5]; // E5, G#5, B5, E6
      const now = ctx.currentTime;

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const noteStart = now + idx * 0.08;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteStart);

        gain.gain.setValueAtTime(0.001, noteStart);
        gain.gain.linearRampToValueAtTime(0.2, noteStart + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.55);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(noteStart);
        osc.stop(noteStart + 0.6);
      });
    } catch (e) {}
  }

  function checkMilestones() {
    const totalSpoken = (dailyStats && typeof dailyStats.spokenMeows === 'number') ? dailyStats.spokenMeows : 0;
    let anyNew = false;
    for (const t of FELINE_TIERS) {
      if (totalSpoken >= t.min && !dailyStats.milestones.includes(t.id)) {
        dailyStats.milestones.push(t.id);
        anyNew = true;
        saveDailyStats(dailyStats);
        triggerAchievementCelebration(t);
      }
    }
    updateAchievementTrackerUI();
    if (achievementsModalBackdrop && achievementsModalBackdrop.classList.contains('open')) {
      renderAchievementsModal();
    }
  }

  function triggerAchievementCelebration(tier) {
    playAchievementFanfare();

    if (navigator.vibrate) {
      try { navigator.vibrate([40, 60, 40, 60, 100]); } catch (e) {}
    }

    const toast = document.createElement('div');
    toast.className = 'achievement-toast';
    toast.innerHTML = `
      <span class="achievement-ring">🔔</span>
      <div class="achievement-content">
        <span class="achievement-heading">✨ Achievement Unlocked!</span>
        <span class="achievement-title">${tier.badge} ${tier.name} (Pure Total Meows)</span>
      </div>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 4200);
  }

  // ==========================================================================
  // Achievements System & Milestone Tracker (Pure Total Meow Basis)
  // ==========================================================================
  function updateAchievementTrackerUI() {
    const totalSpoken = (dailyStats && typeof dailyStats.spokenMeows === 'number') ? dailyStats.spokenMeows : 0;
    const unlockedList = FELINE_TIERS.filter(t => totalSpoken >= t.min);
    const unlockedCount = unlockedList.length;
    const totalCount = FELINE_TIERS.length;

    if (headerAchieveCount) headerAchieveCount.textContent = `${unlockedCount}/${totalCount}`;
    if (unlockedCountBadge) unlockedCountBadge.textContent = `${unlockedCount}/${totalCount}`;

    // Find next locked tier
    const nextTier = FELINE_TIERS.find(t => totalSpoken < t.min);

    if (nextTier) {
      if (nextAchieveIcon) nextAchieveIcon.textContent = nextTier.badge;
      if (nextAchieveName) nextAchieveName.textContent = `${nextTier.name} (${nextTier.min} Meows)`;
      
      const prevMin = FELINE_TIERS[FELINE_TIERS.indexOf(nextTier) - 1]?.min || 0;
      const progressToNext = Math.max(0, totalSpoken - prevMin);
      const span = nextTier.min - prevMin;
      const pct = Math.min(100, Math.round((progressToNext / span) * 100));
      const remaining = nextTier.min - totalSpoken;

      if (achievementProgressFill) achievementProgressFill.style.width = `${pct}%`;
      if (achievementProgressText) achievementProgressText.textContent = `${totalSpoken} / ${nextTier.min} total meows (${pct}%)`;
      if (achievementRemainingText) achievementRemainingText.textContent = `${remaining} more meow${remaining === 1 ? '' : 's'} to unlock!`;
    } else {
      // All unlocked!
      if (nextAchieveIcon) nextAchieveIcon.textContent = '👑';
      if (nextAchieveName) nextAchieveName.textContent = 'All 8 Achievements Unlocked! 🌟';
      if (achievementProgressFill) achievementProgressFill.style.width = '100%';
      if (achievementProgressText) achievementProgressText.textContent = `${totalSpoken} total meows • Max Rank Master!`;
      if (achievementRemainingText) achievementRemainingText.textContent = 'Supreme Cat Royalty 🐾';
    }
  }

  function renderAchievementsModal() {
    if (!achievementsListGrid) return;
    const totalSpoken = (dailyStats && typeof dailyStats.spokenMeows === 'number') ? dailyStats.spokenMeows : 0;
    const unlockedList = FELINE_TIERS.filter(t => totalSpoken >= t.min);
    const unlockedCount = unlockedList.length;
    const totalCount = FELINE_TIERS.length;
    const currentTier = getCurrentTier();

    if (achieveTotalSpokenDisplay) achieveTotalSpokenDisplay.textContent = totalSpoken.toLocaleString();
    if (achieveUnlockedCountDisplay) achieveUnlockedCountDisplay.textContent = `${unlockedCount} / ${totalCount}`;
    if (achieveCurrentRankDisplay) achieveCurrentRankDisplay.textContent = `${currentTier.badge} ${currentTier.name}`;

    achievementsListGrid.innerHTML = '';

    FELINE_TIERS.forEach((tier, index) => {
      const isUnlocked = totalSpoken >= tier.min;
      const prevMin = index > 0 ? FELINE_TIERS[index - 1].min : 0;
      const span = tier.min - prevMin;
      const progress = Math.min(span, Math.max(0, totalSpoken - prevMin));
      const pct = isUnlocked ? 100 : Math.min(100, Math.round((progress / span) * 100));
      const remaining = Math.max(0, tier.min - totalSpoken);

      const card = document.createElement('div');
      card.className = `achievement-card ${isUnlocked ? 'unlocked' : 'locked'}`;
      card.innerHTML = `
        <div class="achievement-card-badge-wrap">
          <span class="achievement-card-badge">${tier.badge}</span>
          ${isUnlocked ? '<span class="achievement-unlocked-check">✓</span>' : '<span class="achievement-lock-icon">🔒</span>'}
        </div>
        <div class="achievement-card-body">
          <div class="achievement-card-header">
            <h4 class="achievement-card-title">${tier.name}</h4>
            <span class="achievement-card-req">🎯 ${tier.min} Total Meows</span>
          </div>
          <p class="achievement-card-desc">${tier.desc}</p>
          <div class="achievement-card-progress-bar">
            <div class="achievement-card-progress-fill" style="width: ${pct}%;"></div>
          </div>
          <div class="achievement-card-footer">
            <span class="achievement-status-tag ${isUnlocked ? 'tag-unlocked' : 'tag-locked'}">
              ${isUnlocked ? '🎉 UNLOCKED' : `${remaining} more meow${remaining === 1 ? '' : 's'} needed`}
            </span>
            <span class="achievement-pct-tag">${isUnlocked ? '100%' : `${totalSpoken}/${tier.min} (${pct}%)`}</span>
          </div>
        </div>
      `;
      achievementsListGrid.appendChild(card);
    });
  }

  function openAchievementsModal() {
    if (!achievementsModalBackdrop) return;
    achievementsModalBackdrop.classList.add('open');
    achievementsModalBackdrop.setAttribute('aria-hidden', 'false');
    if (mobileBottomBar) mobileBottomBar.style.transform = 'translateY(150%)';
    try {
      renderAchievementsModal();
    } catch (e) {
      console.warn('Error rendering achievements modal:', e);
    }
  }

  function closeAchievementsModal() {
    if (!achievementsModalBackdrop) return;
    achievementsModalBackdrop.classList.remove('open');
    achievementsModalBackdrop.setAttribute('aria-hidden', 'true');
    if (mobileBottomBar) mobileBottomBar.style.transform = '';
  }

  function playCuteMeowTone(baseFreq = 540) {
    if (!sfxEnabled) return;
    selfSoundUntil = Math.max(selfSoundUntil, performance.now() + 420);
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = audioContext || new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.35, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.9, now + 0.22);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.28);
    } catch (e) {}
  }

  // --- UI Update ---
  function updateUI(calculatedMPM = null) {
    counterDisplay.textContent = dailyStats.spokenMeows.toLocaleString();
    if (streakDisplay) streakDisplay.textContent = streakCount.toLocaleString();
    const bestCount = dailyStats.bestContinuousStreak || dailyStats.bestStreak || 0;
    if (bestStreakDisplay) bestStreakDisplay.textContent = `${bestCount.toLocaleString()} meows`;
    if (bestStreakMeta) {
      const dur = formatTimer(dailyStats.bestContinuousDuration || 0);
      const pace = (dailyStats.bestContinuousPace || 0) > 0 ? `${dailyStats.bestContinuousPace.toFixed(1)} MPM` : '0.0 MPM';
      bestStreakMeta.textContent = `(${dur} • ${pace})`;
    }
    if (heardCounterDisplay) heardCounterDisplay.textContent = dailyStats.heardMeows.toLocaleString();

    if (calculatedMPM !== null) {
      speedDisplay.textContent = calculatedMPM;
    } else {
      const now = Date.now();
      recentMeowTimestamps = recentMeowTimestamps.filter(t => now - t <= 10000);
      speedDisplay.textContent = Math.round(recentMeowTimestamps.length * 6);
    }

    const tier = getCurrentTier();
    if (catRankBadge) catRankBadge.textContent = `${tier.badge} ${tier.name}`;
    updateAchievementTrackerUI();
  }

  function getCurrentTier() {
    const total = dailyStats.spokenMeows;
    let current = FELINE_TIERS[0];
    for (const t of FELINE_TIERS) {
      if (total >= t.min) current = t;
    }
    return current;
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'cute-toast';
    toast.innerHTML = `<span>🐾</span> <span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 3200);
  }

  function addFeedChip(text, isMeow = false) {
    const chip = document.createElement('span');
    chip.className = `feed-chip ${isMeow ? 'detected' : ''}`;
    chip.textContent = text;
    const placeholder = transcriptFeed.querySelector('.feed-placeholder');
    if (placeholder) placeholder.remove();
    transcriptFeed.appendChild(chip);
    while (transcriptFeed.children.length > 14) {
      transcriptFeed.removeChild(transcriptFeed.firstChild);
    }
    transcriptFeed.scrollTop = transcriptFeed.scrollHeight;
  }

  // Reset All Daily Counts (Global fresh day reset)
  resetSessionBtn.addEventListener('click', () => {
    if (confirm("Reset your Total Daily Meows and Continuous Streak to 0 for a fresh day?")) {
      const today = getTodayKey();
      dailyStats = {
        date: today,
        spokenMeows: 0,
        heardMeows: 0,
        hourly: {},
        maxSpeedMPM: 0,
        bestStreak: 0,
        milestones: []
      };
      for (let h = 0; h < 24; h++) dailyStats.hourly[h] = 0;
      saveDailyStats(dailyStats);
      streakCount = 0;
      clearTimeout(streakInactivityTimer);
      recentMeowTimestamps = [];
      updateUI(0);
      syncUserToLeaderboard();
      showToast("All daily counts reset to zero. Ready for your voice! 🐾");
    }
  });

  // ==========================================================================
  // Web Speech API: Continuous Voice Meow & Nya Recognition
  // ==========================================================================
  function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.lang = 'en-US';

    rec.onstart = () => {
      statusDot.className = 'status-dot active';
      statusMsg.textContent = 'Listening! Say "meow", "nya", or "mew" to your heart\'s content... 🐾';
    };

    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript.toLowerCase();
        const isFinal = result.isFinal;

        const matches = transcript.match(MEOW_REGEX) || [];
        const detectedCount = matches.length;
        const previouslyCounted = streamCountMap.get(i) || 0;

        if (detectedCount > previouslyCounted) {
          const delta = detectedCount - previouslyCounted;
          streamCountMap.set(i, detectedCount);
          
          const now = Date.now();
          // In Hybrid mode: if an acoustic meow was already counted in the last 650ms,
          // don't double count! Just update the visual feedback chip!
          if (now - lastRegisteredMeowTimestamp < 650) {
            addFeedChip(`Recognized: "${matches[matches.length - 1]}" ✨`, true);
          } else {
            lastRegisteredMeowTimestamp = now;
            registerSpokenMeow(delta, matches[matches.length - 1]);
          }
        }

        if (isFinal) {
          streamCountMap.delete(i);
          if (matches.length > 0) {
            addFeedChip(`"${transcript.trim()}" (×${matches.length})`, true);
          } else {
            // Web speech recognized an English phrase that is NOT a meow (e.g. "hello", "testing")
            suppressAcousticUntil = performance.now() + 850;
            addFeedChip(`"${transcript.trim()}"`);
          }
        } else if (matches.length === 0 && transcript.trim().length > 0) {
          // Interim non-meow speech actively suppresses acoustic detector from mistaking "hello" for a meow
          suppressAcousticUntil = performance.now() + 650;
        }
      }
    };

    rec.onerror = (event) => {
      if (event.error === 'not-allowed') {
        showToast('Microphone access denied. Please grant microphone permissions.');
        stopListening();
      }
    };

    rec.onend = () => {
      if (isListening) {
        try { rec.start(); } catch (e) {}
      }
    };

    return rec;
  }

  // ==========================================================================
  // Web Audio API: Acoustic Pitch, Formant & Envelope Analyzer
  // ==========================================================================
  async function setupAudioContextAndMic() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;

      if (!audioContext) audioContext = new AudioCtx();
      if (audioContext.state === 'suspended') await audioContext.resume();

      if (!microphoneStream) {
        microphoneStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            // Echo cancellation stops the app's own sounds leaking into the mic
            echoCancellation: true,
            // Browser noise suppression is tuned for speech and squashes high-pitched,
            // tonal meows. Our pitch detector rejects air/fan noise on its own.
            noiseSuppression: false,
            autoGainControl: true
          }
        });
      }

      const source = audioContext.createMediaStreamSource(microphoneStream);
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 2048;
      analyserNode.smoothingTimeConstant = 0.25;

      try {
        // Highpass at 90 Hz: eliminates sub-bass mechanical rumble & DC drift without touching any vocal pitches
        const highpass = audioContext.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 90;
        highpass.Q.value = 0.5;

        source.connect(highpass);
        highpass.connect(analyserNode);
      } catch (filterErr) {
        source.connect(analyserNode);
      }

      startAudioVisualizerAndDetector();
      return true;
    } catch (err) {
      showToast('Could not access microphone: ' + err.message);
      return false;
    }
  }

  // Analysis window for pitch tracking (~21-23 ms, i.e. 2+ periods of even a 100 Hz voice)
  const PITCH_WINDOW = 1024;
  const PITCH_MIN_HZ = 100;   // deep / chesty meows
  const PITCH_MAX_HZ = 1800;  // squeaky falsetto & kitten-style meows

  function startAudioVisualizerAndDetector() {
    if (!analyserNode) return;
    const fullBuf = new Float32Array(analyserNode.fftSize);
    const byteBuf = new Uint8Array(analyserNode.fftSize);
    const hasFloat = typeof analyserNode.getFloatTimeDomainData === 'function';
    const winSize = Math.min(PITCH_WINDOW, analyserNode.fftSize);
    burstLastFrameTime = 0;

    const checkAudioFrame = () => {
      if (!isListening) {
        visualizerBar.style.width = '0%';
        acousticState = 'idle';
        return;
      }

      if (hasFloat) {
        analyserNode.getFloatTimeDomainData(fullBuf);
      } else {
        analyserNode.getByteTimeDomainData(byteBuf);
        for (let i = 0; i < byteBuf.length; i++) fullBuf[i] = (byteBuf[i] - 128) / 128;
      }

      // Most recent window of samples
      const win = fullBuf.subarray(fullBuf.length - winSize);
      let sum = 0;
      for (let i = 0; i < win.length; i++) sum += win[i] * win[i];
      const rms = Math.sqrt(sum / win.length);

      // Visualizer rests near 0% on background noise and jumps when you vocalize
      const effectiveRms = Math.max(0, rms - ambientNoiseFloor * 0.7);
      const volumePercent = Math.min(100, Math.round(effectiveRms * 500));
      visualizerBar.style.width = `${volumePercent}%`;

      const currentMode = detectionModeSelect ? detectionModeSelect.value : 'hybrid';
      if (currentMode === 'acoustic' || currentMode === 'hybrid') {
        processAcousticFrame(win, rms);
      }

      visualizerAnimFrame = requestAnimationFrame(checkAudioFrame);
    };

    visualizerAnimFrame = requestAnimationFrame(checkAudioFrame);
  }

  // ==========================================================================
  // Pitch Tracker: McLeod Normalized Square Difference Function (NSDF)
  // Returns the fundamental pitch and a "clarity" score (0..1).
  //  - Voiced sounds (any meow, any voice pitch) -> strong periodicity, clarity ~0.7-0.98
  //  - Air / fan hiss, breath, claps, taps -> aperiodic, clarity low
  // Because it measures periodicity rather than fixed frequency bands, it works
  // equally well for deep, normal and very high-pitched voices.
  // ==========================================================================
  let nsdfScratch = null;

  function detectPitch(buf, sampleRate) {
    const n = buf.length;
    const minLag = Math.max(2, Math.floor(sampleRate / PITCH_MAX_HZ));
    const maxLag = Math.min(n - 2, Math.ceil(sampleRate / PITCH_MIN_HZ));
    if (!nsdfScratch || nsdfScratch.length < maxLag + 2) nsdfScratch = new Float32Array(maxLag + 2);
    const nsdf = nsdfScratch;

    for (let tau = 0; tau <= maxLag + 1; tau++) {
      let acf = 0;
      let energy = 0;
      const lim = n - tau;
      for (let i = 0; i < lim; i++) {
        const a = buf[i];
        const b = buf[i + tau];
        acf += a * b;
        energy += a * a + b * b;
      }
      nsdf[tau] = energy > 0 ? (2 * acf) / energy : 0;
    }

    // Skip the zero-lag lobe, then collect the key maximum of each positive region
    let tau = 1;
    while (tau <= maxLag && nsdf[tau] > 0) tau++;

    const peaks = [];
    let globalMax = 0;
    let inPositive = false;
    let localMax = 0;
    let localTau = 0;
    for (; tau <= maxLag; tau++) {
      const v = nsdf[tau];
      if (v > 0) {
        if (!inPositive) { inPositive = true; localMax = v; localTau = tau; }
        else if (v > localMax) { localMax = v; localTau = tau; }
      } else if (inPositive) {
        inPositive = false;
        if (localTau >= minLag) {
          peaks.push(localTau);
          if (localMax > globalMax) globalMax = localMax;
        }
      }
    }
    if (inPositive && localTau >= minLag && localTau < maxLag) {
      peaks.push(localTau);
      if (localMax > globalMax) globalMax = localMax;
    }
    if (!peaks.length || globalMax <= 0) return { pitch: 0, clarity: 0 };

    // First peak close to the global max avoids octave-down errors on high voices
    const cutoff = globalMax * 0.86;
    let chosen = peaks[0];
    for (let i = 0; i < peaks.length; i++) {
      if (nsdf[peaks[i]] >= cutoff) { chosen = peaks[i]; break; }
    }

    // Parabolic interpolation for sub-sample accuracy
    const y0 = nsdf[chosen - 1];
    const y1 = nsdf[chosen];
    const y2 = nsdf[chosen + 1];
    const denom = y0 - 2 * y1 + y2;
    const shift = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / denom)) : 0;
    return { pitch: sampleRate / (chosen + shift), clarity: y1 };
  }

  // ==========================================================================
  // Voiced-Burst Meow Detector
  // A meow = a discrete burst of sound (80 ms - 2.4 s) that is mostly VOICED
  // (has a clear pitch anywhere from 100-1800 Hz). This accepts deep, normal,
  // and high-pitched meows alike, while rejecting:
  //  - steady air / fan / AC noise (unvoiced, or continuous for too long)
  //  - claps, taps, keyboard clicks (too short / no pitch)
  //  - the app's own chirps (self-sound guard)
  // ==========================================================================
  function processAcousticFrame(win, rms) {
    if (!audioContext) return;
    const now = performance.now();
    const dt = burstLastFrameTime ? Math.min(60, now - burstLastFrameTime) : 16;
    burstLastFrameTime = now;
    const inSelfSound = now < selfSoundUntil;

    // --- Adaptive room noise floor (paused while our own sounds play) ---
    if (!inSelfSound) {
      const rate = acousticState === 'idle' ? 0.05 : (acousticState === 'noise_rejected' ? 0.02 : 0.002);
      ambientNoiseFloor = ambientNoiseFloor * (1 - rate) + rms * rate;
    }
    ambientNoiseFloor = Math.max(0.002, Math.min(0.05, ambientNoiseFloor));

    // --- Thresholds driven by the Sensitivity slider (20-85, default 55 -> 1.0) ---
    const sens = Math.max(0.4, Math.min(1.6, acousticSensitivity / 55));
    const onThreshold = Math.max(0.010, ambientNoiseFloor * (1 + 1.5 / sens) + 0.003 / sens);
    const offThreshold = Math.max(0.006, ambientNoiseFloor * 1.3 + 0.0015);
    const clarityThreshold = Math.max(0.5, Math.min(0.85, 0.7 - (sens - 1) * 0.2));
    const minVoicedRatio = Math.max(0.3, Math.min(0.6, 0.45 - (sens - 1) * 0.2));

    // --- Pitch analysis (only when there is sound worth analysing) ---
    let voiced = false;
    let pitch = 0;
    if (rms >= offThreshold) {
      const r = detectPitch(win, audioContext.sampleRate);
      if (r.clarity >= clarityThreshold && r.pitch >= PITCH_MIN_HZ && r.pitch <= PITCH_MAX_HZ) {
        voiced = true;
        pitch = r.pitch;
      }
    }

    const finalizeBurst = (endTime) => {
      const duration = endTime - vocalBurstStartTime;
      const voicedRatio = burstVoicedMs / Math.max(1, burstActiveMs);
      const rearmOk = !burstRearmLevel || peakVocalEnergyInBurst >= burstRearmLevel * 2;

      if (duration < 80 || duration > 2400) return;
      if (burstVoicedMs < 55 || voicedRatio < minVoicedRatio) return;
      if (peakVocalEnergyInBurst < onThreshold * 1.15 || !rearmOk) return;
      if (endTime - lastMeowRegisteredTime < 160) return;

      // Guard: if speech recognition recently recognized non-meow speech (e.g. "hello"), suppress acoustic trigger
      if (endTime < suppressAcousticUntil) return;

      const validPitches = burstPitches.filter(p => p >= PITCH_MIN_HZ && p <= PITCH_MAX_HZ);
      if (validPitches.length < 3) return;

      const sorted = validPitches.slice().sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const p10 = sorted[Math.floor(sorted.length * 0.1)];
      const p90 = sorted[Math.floor(sorted.length * 0.9)];
      const pitchGlideRatio = p10 > 0 ? (p90 / p10) : 1;

      // Meow Identification Criteria:
      // 1. High-pitch / kitten meow (median >= 420 Hz): Normal human speech ("hello", "testing") is 85-255 Hz.
      //    Sounds at >= 420 Hz are high kitten cries, falsetto meows, and squeaky nyas.
      // 2. Melodic pitch glide (pitchGlideRatio >= 1.25): Real meows ("me-OOWW", "nyaa~") have a pronounced
      //    glissando / pitch contour (>25% pitch sweep), whereas normal speech like "hello" is flat/monotone.
      const isHighPitchMeow = median >= 420;
      const hasMeowGlide = pitchGlideRatio >= 1.25;

      const currentMode = detectionModeSelect ? detectionModeSelect.value : 'hybrid';
      let isAcousticMeow = false;
      if (isHighPitchMeow || hasMeowGlide) {
        isAcousticMeow = true;
      } else if (currentMode === 'acoustic' && pitchGlideRatio >= 1.18) {
        // In offline acoustic-only mode without speech-to-text, allow slightly softer glide
        isAcousticMeow = true;
      }

      // Flat conversational speech like "hello", "hi", "testing", "one two" is REJECTED!
      if (!isAcousticMeow) return;

      lastMeowRegisteredTime = endTime;
      const voiceType = median >= 520 ? 'high-pitch' : (median >= 420 ? 'kitten' : 'glide');
      registerSpokenMeowUnified(`Acoustic Meow 🐾 · ${voiceType} ~${Math.round(median)}Hz`);
    };

    if (acousticState === 'idle') {
      // A burst must START voiced: rejects claps, taps and breaths up front
      if (rms >= onThreshold && voiced) {
        acousticState = 'vocal_active';
        vocalBurstStartTime = now;
        peakVocalEnergyInBurst = rms;
        burstActiveMs = dt;
        burstVoicedMs = inSelfSound ? 0 : dt;
        burstPitches = inSelfSound ? [] : [pitch];
        burstQuietSince = 0;
        burstDipSince = 0;
      }
    } else if (acousticState === 'vocal_active') {
      if (rms >= offThreshold) {
        burstQuietSince = 0;
        burstActiveMs += dt;
        // Voiced time only counts outside the self-sound window, so our own chirp
        // can never complete a meow, but a real meow overlapping it still can.
        if (voiced && !inSelfSound) {
          burstVoicedMs += dt;
          burstPitches.push(pitch);
        }
        if (rms > peakVocalEnergyInBurst) peakVocalEnergyInBurst = rms;

        // Split rapid "meow-meow-meow": a sustained energy dip between syllables
        if (rms < peakVocalEnergyInBurst * 0.3 && burstVoicedMs >= 55) {
          if (!burstDipSince) {
            burstDipSince = now;
          } else if (now - burstDipSince >= 60) {
            finalizeBurst(burstDipSince);
            burstRearmLevel = rms;
            acousticState = 'idle';
            return;
          }
        } else {
          burstDipSince = 0;
        }
      } else {
        // Hangover: brief gaps inside one meow (e.g. "m-eow") don't split it
        if (!burstQuietSince) {
          burstQuietSince = now;
        } else if (now - burstQuietSince >= 80) {
          finalizeBurst(burstQuietSince);
          burstRearmLevel = 0;
          acousticState = 'idle';
          return;
        }
      }

      // Continuous sound protection: long voiced singing gets 2.4 s, unvoiced drones only 1.5 s
      const voicedRatioSoFar = burstVoicedMs / Math.max(1, burstActiveMs);
      const maxLen = voicedRatioSoFar >= 0.5 ? 2400 : 1500;
      if (now - vocalBurstStartTime > maxLen) {
        acousticState = 'noise_rejected';
        burstQuietSince = 0;
      }
    } else if (acousticState === 'noise_rejected') {
      // Wait for the drone to stop and the room to stay quiet briefly
      if (rms < offThreshold) {
        if (!burstQuietSince) burstQuietSince = now;
        else if (now - burstQuietSince >= 150) {
          acousticState = 'idle';
          burstRearmLevel = 0;
        }
      } else {
        burstQuietSince = 0;
      }
    }
  }

  // --- Start / Stop Listening ---
  async function startListening() {
    try {
      const mode = detectionModeSelect.value;
      const micReady = await setupAudioContextAndMic();
      if (!micReady) return;

      if (mode === 'speech' || mode === 'hybrid') {
        if (!recognition) recognition = setupSpeechRecognition();
        if (recognition) {
          try { recognition.start(); } catch (e) {}
        }
      }

      isListening = true;
      listenToggleBtn.classList.add('listening');
      micBtnLabel.textContent = 'Meowing Active (Click to Pause)';
      if (mobileMicIcon && mobileMicLabel) {
        mobileMicIcon.textContent = '⏸️';
        mobileMicLabel.textContent = 'Pause';
        mobileMicBtn.style.color = '#10b981';
      }
      statusDot.className = 'status-dot active';
      statusMsg.textContent = 'Meowing active! Say "meow" or "nya" into your mic! 🐾';
      showToast('Meow Detector is listening for your meows! 🐾');
    } catch (e) {
      showToast('Error initializing mic: ' + e.message);
    }
  }

  function stopListening() {
    isListening = false;
    listenToggleBtn.classList.remove('listening');
    micBtnLabel.textContent = 'Click to Start Meowing';
    if (mobileMicIcon && mobileMicLabel) {
      mobileMicIcon.textContent = '🎙️';
      mobileMicLabel.textContent = 'Meow';
      mobileMicBtn.style.color = '';
    }
    statusDot.className = 'status-dot';
    if (streakCount > 0) {
      statusMsg.innerHTML = 'Mic paused. Click <strong style="color:var(--accent-strawberry,#ff6b81);">"🏁 Submit Run"</strong> to lock your score now, or resume before the 60s limit!';
    } else {
      statusMsg.textContent = 'Paused. Tap the button to start meowing!';
    }

    if (recognition) {
      try { recognition.stop(); } catch (e) {}
    }
    if (visualizerAnimFrame) cancelAnimationFrame(visualizerAnimFrame);
    visualizerBar.style.width = '0%';
  }

  listenToggleBtn.addEventListener('click', () => {
    if (isListening) stopListening();
    else startListening();
  });

  if (mobileMicBtn) {
    mobileMicBtn.addEventListener('click', () => {
      if (isListening) stopListening();
      else startListening();
    });
  }

  detectionModeSelect.addEventListener('change', () => {
    const mode = detectionModeSelect.value;
    sensitivityWrap.style.display = mode === 'speech' ? 'none' : 'flex';
    if (isListening) {
      stopListening();
      setTimeout(startListening, 200);
    }
  });

  if (sensitivitySlider) {
    sensitivitySlider.addEventListener('input', (e) => {
      acousticSensitivity = parseInt(e.target.value, 10);
      if (sensitivityValDisplay) {
        let label = 'Normal';
        if (acousticSensitivity >= 65) label = 'High';
        else if (acousticSensitivity >= 50) label = 'Optimal';
        else label = 'Low';
        sensitivityValDisplay.textContent = `${acousticSensitivity} (${label})`;
      }
    });
  }

  // ==========================================================================
  // Statistics Modal & 24-Hour Hourly Chart
  // ==========================================================================
  function openStatsModal() {
    statsModalBackdrop.classList.add('open');
    statsModalBackdrop.setAttribute('aria-hidden', 'false');
    if (mobileBottomBar) mobileBottomBar.style.transform = 'translateY(150%)';
    try {
      renderStatsModalData();
      renderHourlyChart();
      renderTierList();
    } catch (e) {
      console.warn('Error rendering stats modal:', e);
    }
  }

  function closeStatsModal() {
    statsModalBackdrop.classList.remove('open');
    statsModalBackdrop.setAttribute('aria-hidden', 'true');
    if (mobileBottomBar) mobileBottomBar.style.transform = '';
  }

  openStatsBtn.addEventListener('click', openStatsModal);
  closeStatsBtn.addEventListener('click', closeStatsModal);
  statsModalBackdrop.addEventListener('click', (e) => {
    if (e.target === statsModalBackdrop) closeStatsModal();
  });

  // Achievements Modal Listeners
  if (openAchievementsBtn) openAchievementsBtn.addEventListener('click', openAchievementsModal);
  if (viewAchievementsBtn) viewAchievementsBtn.addEventListener('click', openAchievementsModal);
  if (closeAchievementsBtn) closeAchievementsBtn.addEventListener('click', closeAchievementsModal);
  if (closeAchievementsBottomBtn) closeAchievementsBottomBtn.addEventListener('click', closeAchievementsModal);
  if (mobileAchievementsBtn) mobileAchievementsBtn.addEventListener('click', openAchievementsModal);
  if (achievementsModalBackdrop) {
    achievementsModalBackdrop.addEventListener('click', (e) => {
      if (e.target === achievementsModalBackdrop) closeAchievementsModal();
    });
  }
  if (testChimeBtn) {
    testChimeBtn.addEventListener('click', () => {
      playAchievementFanfare();
      showToast('🔔 Chime Fanfare tested!');
    });
  }

  if (mobileStatsBtn) mobileStatsBtn.addEventListener('click', openStatsModal);
  if (mobileLeaderboardBtn) mobileLeaderboardBtn.addEventListener('click', openLeaderboardModal);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeStatsModal();
      closeLeaderboardModal();
      closeAuthModal();
      closeAchievementsModal();
    }
  });

  function renderStatsModalData() {
    if (statTodayTotal) statTodayTotal.textContent = (dailyStats.spokenMeows || 0).toLocaleString();
    if (statTodayHeard) statTodayHeard.textContent = (dailyStats.heardMeows || 0).toLocaleString();
    const streak = dailyStats.bestContinuousStreak || dailyStats.bestStreak || 0;
    if (statBestStreak) statBestStreak.textContent = streak.toLocaleString();
    if (statMaxSpeed) statMaxSpeed.textContent = dailyStats.maxSpeedMPM || 0;

    let peakH = 0;
    let peakCount = 0;
    for (let h = 0; h < 24; h++) {
      const count = (dailyStats.hourly && dailyStats.hourly[h]) || 0;
      if (count > peakCount) {
        peakCount = count;
        peakH = h;
      }
    }

    if (statPeakHour) {
      if (peakCount > 0) {
        const startH = String(peakH).padStart(2, '0');
        const endH = String((peakH + 1) % 24).padStart(2, '0');
        statPeakHour.textContent = `${startH}:00 - ${endH}:00`;
      } else {
        statPeakHour.textContent = 'None yet';
      }
    }
    if (statPeakCount) {
      statPeakCount.textContent = `${peakCount.toLocaleString()} meows`;
    }
  }

  // Draw 24-Hour Interactive Bar Chart on Canvas
  let chartHoveredHour = -1;

  function renderHourlyChart(highlightHour = -1) {
    if (!hourlyCanvas) return;
    const canvas = hourlyCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : (canvas.parentElement ? canvas.parentElement.clientWidth : 650);
    const h = 220;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const padding = { top: 34, right: 20, bottom: 35, left: 35 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    ctx.clearRect(0, 0, w, h);

    let maxCount = 5;
    for (let i = 0; i < 24; i++) {
      const c = dailyStats.hourly[i] || 0;
      if (c > maxCount) maxCount = c;
    }
    maxCount = Math.ceil(maxCount * 1.2);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark-kawaii';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 105, 180, 0.12)';
    const textColor = isDark ? '#d8b4e2' : '#8c5b73';
    const barNormal = isDark ? '#7b2cbf' : '#ffa8c0';
    const barPeak = isDark ? '#f43f5e' : '#ff3366';
    const barCurrent = isDark ? '#05d9e8' : '#ff6584';

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.fillStyle = textColor;
    ctx.font = '10px Quicksand, sans-serif';
    ctx.textAlign = 'right';

    const ySteps = 4;
    for (let s = 0; s <= ySteps; s++) {
      const yVal = Math.round((maxCount / ySteps) * s);
      const yPos = padding.top + chartH - (s / ySteps) * chartH;
      ctx.beginPath();
      ctx.moveTo(padding.left, yPos);
      ctx.lineTo(w - padding.right, yPos);
      ctx.stroke();
      ctx.fillText(yVal, padding.left - 6, yPos + 3);
    }

    let peakIndex = -1;
    let highestCount = 0;
    for (let i = 0; i < 24; i++) {
      const count = dailyStats.hourly[i] || 0;
      if (count > highestCount) {
        highestCount = count;
        peakIndex = i;
      }
    }

    const currentHour = new Date().getHours();
    const barWidth = Math.max(6, (chartW / 24) * 0.72);
    const step = chartW / 24;

    for (let i = 0; i < 24; i++) {
      const count = dailyStats.hourly[i] || 0;
      const x = padding.left + i * step + (step - barWidth) / 2;
      const barH = (count / maxCount) * chartH;
      const y = padding.top + chartH - barH;

      let fillColor = barNormal;
      if (count > 0 && i === peakIndex) fillColor = barPeak;
      else if (i === currentHour) fillColor = barCurrent;

      if (i === highlightHour) fillColor = '#fbbf24';

      ctx.fillStyle = fillColor;

      const radius = 4;
      if (barH > 0) {
        ctx.beginPath();
        ctx.moveTo(x, y + barH);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.lineTo(x + barWidth - radius, y);
        ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
        ctx.lineTo(x + barWidth, y + barH);
        ctx.closePath();
        ctx.fill();

        if (i === peakIndex && count > 0 && i !== highlightHour) {
          ctx.fillStyle = isDark ? '#fbbf24' : '#ff3366';
          ctx.font = 'bold 11px Fredoka, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`👑 ${count}`, x + barWidth / 2, y - 6);
        }
      }

      if (i === highlightHour) {
        const tooltipText = `${i}:00 • ${count} 🎙️`;
        ctx.fillStyle = isDark ? '#f43f5e' : '#ff3366';
        ctx.font = 'bold 11px Fredoka, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(tooltipText, Math.max(40, Math.min(w - 40, x + barWidth / 2)), Math.max(16, y - 8));
      }

      if (i % 3 === 0 || i === 23) {
        ctx.fillStyle = textColor;
        ctx.font = '10px Quicksand, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${i}h`, x + barWidth / 2, h - padding.bottom + 16);
      }
    }
  }

  function handleChartInteraction(e) {
    const rect = hourlyCanvas.getBoundingClientRect();
    const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
    const x = clientX - rect.left;
    const paddingLeft = 35;
    const paddingRight = 20;
    const chartW = rect.width - paddingLeft - paddingRight;
    const step = chartW / 24;
    const relativeX = x - paddingLeft;
    if (relativeX >= 0 && relativeX <= chartW) {
      const hour = Math.min(23, Math.max(0, Math.floor(relativeX / step)));
      chartHoveredHour = hour;
      renderHourlyChart(hour);
    }
  }

  hourlyCanvas.addEventListener('mousemove', handleChartInteraction);
  hourlyCanvas.addEventListener('touchstart', handleChartInteraction, { passive: true });
  hourlyCanvas.addEventListener('touchmove', handleChartInteraction, { passive: true });
  hourlyCanvas.addEventListener('mouseleave', () => {
    chartHoveredHour = -1;
    renderHourlyChart(-1);
  });

  // Render Feline Tiers (Pure Total Meow Basis)
  function renderTierList() {
    if (!tierList) return;
    tierList.innerHTML = '';
    const total = (dailyStats && typeof dailyStats.spokenMeows === 'number') ? dailyStats.spokenMeows : 0;

    FELINE_TIERS.forEach(t => {
      const unlocked = total >= t.min;
      const item = document.createElement('div');
      item.className = `tier-item ${unlocked ? 'unlocked' : ''}`;
      item.innerHTML = `
        <div class="tier-badge">${t.badge}</div>
        <div class="tier-info">
          <div class="tier-name">${t.name} ${unlocked ? '✅' : '🔒'}</div>
          <div class="tier-target">${t.min} Total Meows &bull; ${t.desc}</div>
        </div>
      `;
      tierList.appendChild(item);
    });
  }

  // Copy Daily Report to Clipboard
  copySummaryBtn.addEventListener('click', async () => {
    let peakH = 0;
    let peakCount = 0;
    for (let h = 0; h < 24; h++) {
      const c = dailyStats.hourly[h] || 0;
      if (c > peakCount) {
        peakCount = c;
        peakH = h;
      }
    }

    const currentTier = getCurrentTier();
    const summary = `🐱 MeowCounter.nya Feline Report 🐾\n` +
      `📅 Date: ${dailyStats.date}\n` +
      `🎙️ Total Daily Meows: ${dailyStats.spokenMeows}\n` +
      `🔥 Best Continuous Streak: ${dailyStats.bestStreak}\n` +
      `👑 Peak Hour: ${peakH}:00 - ${(peakH+1)%24}:00 (${peakCount} meows)\n` +
      `🐾 Real Cat Meows Heard: ${dailyStats.heardMeows}\n` +
      `🎀 Rank: ${currentTier.badge} ${currentTier.name}\n` +
      `🌟 Join the leaderboard at MeowCounter.nya!`;

    try {
      await navigator.clipboard.writeText(summary);
      showToast('Daily Report copied to clipboard! 📋');
    } catch (e) {
      showToast('Please select and copy manually.');
    }
  });

  // Clear Today's Stats
  clearTodayStatsBtn.addEventListener('click', () => {
    if (confirm("Reset today's daily meow counts?")) {
      const today = getTodayKey();
      dailyStats = {
        date: today,
        spokenMeows: 0,
        heardMeows: 0,
        hourly: {},
        maxSpeedMPM: 0,
        bestStreak: 0,
        milestones: []
      };
      for (let h = 0; h < 24; h++) dailyStats.hourly[h] = 0;
      saveDailyStats(dailyStats);
      streakCount = 0;
      clearTimeout(streakInactivityTimer);
      recentMeowTimestamps = [];
      updateUI(0);
      syncUserToLeaderboard();
      renderStatsModalData();
      renderHourlyChart();
      renderTierList();
      showToast("Stats reset. 🐾");
    }
  });

  // Theme Management
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'cute-pink';
    applyTheme(saved);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark-kawaii') {
      themeIcon.textContent = '☀️';
      themeLabel.textContent = 'Cute Pink';
    } else {
      themeIcon.textContent = '🌙';
      themeLabel.textContent = 'Dark Kawaii';
    }
    localStorage.setItem(THEME_KEY, theme);
    if (statsModalBackdrop.classList.contains('open')) renderHourlyChart();
  }

  themeToggleBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark-kawaii' ? 'cute-pink' : 'dark-kawaii';
    applyTheme(next);
    showToast(`Switched to ${next === 'dark-kawaii' ? 'Midnight Neko 🌙' : 'Cute Pink 🌸'} theme!`);
  });

  function initSfx() {
    const saved = localStorage.getItem(SFX_KEY);
    sfxEnabled = saved !== 'false';
    updateSfxIcon();
  }

  function updateSfxIcon() {
    sfxIcon.textContent = sfxEnabled ? '🔔' : '🔕';
    sfxToggleBtn.setAttribute('title', sfxEnabled ? 'Meow Chimes On' : 'Meow Chimes Muted');
  }

  sfxToggleBtn.addEventListener('click', () => {
    sfxEnabled = !sfxEnabled;
    localStorage.setItem(SFX_KEY, sfxEnabled);
    updateSfxIcon();
    showToast(sfxEnabled ? 'Sound Effects Enabled 🎶' : 'Sound Effects Muted 🔇');
    if (sfxEnabled) playCuteMeowTone(650);
  });

  function initPawBackground() {
    const pawIcons = ['🐾', '🐱', '✨', '🐾', '🌸', '🐾'];
    for (let i = 0; i < 14; i++) {
      const paw = document.createElement('div');
      paw.className = 'floating-paw';
      paw.textContent = pawIcons[i % pawIcons.length];
      paw.style.left = `${Math.random() * 96}%`;
      paw.style.animationDelay = `${Math.random() * 15}s`;
      paw.style.animationDuration = `${14 + Math.random() * 10}s`;
      paw.style.fontSize = `${16 + Math.random() * 16}px`;
      pawBackground.appendChild(paw);
    }
  }

  setInterval(() => {
    if (!mascotArea.classList.contains('meowing') && Math.random() > 0.3) {
      mascotArea.classList.add('blink');
      setTimeout(() => mascotArea.classList.remove('blink'), 150);
    }
  }, 3500);

  window.addEventListener('resize', () => {
    if (statsModalBackdrop.classList.contains('open')) renderHourlyChart();
  });

  // Mobile Bottom Sheet Swipe-Down to Dismiss
  let touchStartY = 0;
  function handleTouchStart(e) {
    if (e.touches && e.touches.length > 0) touchStartY = e.touches[0].clientY;
  }
  function handleTouchEnd(e) {
    if (e.changedTouches && e.changedTouches.length > 0) {
      const touchEndY = e.changedTouches[0].clientY;
      if (touchEndY - touchStartY > 55) {
        closeStatsModal();
        closeLeaderboardModal();
        closeAuthModal();
        closeAchievementsModal();
      }
    }
  }

  document.querySelectorAll('.modal-pull-handle, .stats-modal-header').forEach(el => {
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
  });

  // Mobile AudioContext Unlock
  function unlockAudioOnMobile() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioContext) audioContext = new AudioCtx();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  }
  document.addEventListener('touchstart', unlockAudioOnMobile, { once: true, passive: true });
  document.addEventListener('click', unlockAudioOnMobile, { once: true, passive: true });

  // Initialize
  initTheme();
  initSfx();
  initPawBackground();
  updateUserAuthUI();
  updateUI();

})();
