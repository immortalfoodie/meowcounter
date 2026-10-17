# 🐾 MeowCounter.nya ~ Voice Meow Tracker & Feline Community

> A hyper-responsive, privacy-focused voice meow tracker powered by in-browser Web Audio pitch analysis, acoustic glissando tracking, speech suppression, sound effects, and a global leaderboard.

---

## 🌟 Key Features

- 🎙️ **Real-time Acoustic Pitch Tracking**: Uses Normalized Square Difference Function (NSDF) pitch tracking (100 Hz – 1800 Hz) to detect real cat meows and human feline impressions across various pitches (deep meows, normal pitch, high kitten squeaks).
- 🎶 **Glissando & Melodic Contour Validation**: Checks for authentic pitch glides / frequency shifts characteristic of authentic meows, rejecting flat speech, room hums, and common words like *"hello"*, *"testing"*, or background air conditioners.
- ⚡ **Continuous Meow Speedrun Mode**: Built-in 3.5s interval continuous streak challenge with live pace (meows/min), streak multiplier combos, and speedrun ranks.
- 🔒 **100% Client-Side Privacy**: Raw audio never leaves your browser. All DSP and voice analysis happen strictly in real-time in memory via the Web Audio API.
- 🏆 **Global Cross-Device Leaderboard**: Synchronized across all devices worldwide via Vercel Serverless Functions + Upstash Redis / Vercel KV.
- 🔊 **Authentic Purr & Meow Soundboard**: Studio cat sound effects, celebratory meow blasts, streak confetti, and interactive avatar customization.

---

## 🚀 One-Click Deployment to Vercel

### Step 1: Import Project
1. Go to [Vercel](https://vercel.com) and click **"Add New..."** → **"Project"**.
2. Select your repository: `immortalfoodie/meowcounter`.
3. Keep default settings (Framework Preset: **Other**) and click **Deploy**.

### Step 2: Connect Free Global Leaderboard (Upstash KV)
1. On your Vercel project dashboard, click the **Storage** tab.
2. Click **Create Database** and choose **Upstash Redis** (or **KV**).
   - *Free tier includes 10,000 commands/day, 100% free forever, no credit card required.*
3. Click **Connect** to link the database to your `meowcounter` project.
4. Go to the **Deployments** tab and click **Redeploy**.

> 💡 *Vercel will automatically inject `KV_REST_API_URL` and `KV_REST_API_TOKEN`. The serverless endpoint at `api/leaderboard.js` will immediately start syncing all scores globally across all devices!*

---

## 💻 Running Locally

### Option A: With Local Node.js Server (Persists to local JSON)
```bash
# Clone the repository
git clone https://github.com/immortalfoodie/meowcounter.git
cd meowcounter

# Start the built-in HTTP & API server
npm start
```
Then open `http://localhost:3000` in your web browser.

### Option B: Pure Client-Side Static
Simply open `index.html` in Chrome, Edge, Safari, or Firefox (with microphone permission enabled).

---

## 📂 Project Architecture

```
├── api/
│   └── leaderboard.js      # Vercel serverless function (Upstash Redis KV + safe fallback)
├── data/
│   └── leaderboard.json    # Local JSON storage for standalone server.js
├── index.html              # Responsive UI with cat avatars, soundboard & counters
├── styles.css              # Cyber-kawaii glassmorphism design system
├── app.js                  # NSDF pitch tracking, glissando checks & client state
├── server.js               # Standalone Node.js HTTP server (for local dev or Render)
├── vercel.json             # Vercel routing configuration for /api/leaderboard
├── package.json            # Node project configuration
└── .gitignore              # Ignored files
```

---

## 📜 License
MIT License. Made with 🐾 for cat lovers and feline vocalists everywhere!
