# 🏏 Teekha Bouncer League

IPL Fantasy Points Tracker — built with React + Vite, deployable to Vercel.

---

## ⚡ Quick Setup (5 minutes)

### Step 1 — Get your Anthropic API Key
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up (free) → go to **API Keys** → **Create Key**
3. Copy the key (starts with `sk-ant-...`)

### Step 2 — Add your key to the app
Open `src/App.jsx` and replace line 8:
```js
const ANTHROPIC_API_KEY = "YOUR_API_KEY_HERE";
```
with:
```js
const ANTHROPIC_API_KEY = "sk-ant-your-actual-key-here";
```

### Step 3 — Deploy to Vercel
1. Push this folder to a GitHub repo:
   ```bash
   git init
   git add .
   git commit -m "Teekha Bouncer League 🏏"
   git remote add origin https://github.com/YOUR_USERNAME/teekha-bouncer.git
   git push -u origin main
   ```
2. Go to [vercel.com](https://vercel.com) → **New Project** → Import your repo
3. Leave all settings as default → click **Deploy**
4. ✅ You'll get a live URL like `https://teekha-bouncer.vercel.app`

### Step 4 — Share with your league!
Send the Vercel URL to everyone. The app works on mobile browsers — no app install needed.

---

## 🔐 Security Note
Your API key is embedded client-side. For a small private league this is fine, but for extra security you can use a Vercel Edge Function as a proxy (ask Claude to help set that up if needed).

---

## 💻 Run Locally
```bash
npm install
npm run dev
```
Then open http://localhost:5173

---

## 🏗️ Project Structure
```
teekha-bouncer/
├── index.html          # Entry HTML
├── vite.config.js      # Vite config
├── package.json        # Dependencies
├── public/
│   └── favicon.svg     # Cricket bat favicon
└── src/
    ├── main.jsx        # React entry point
    └── App.jsx         # ← Main app (edit API key here)
```
