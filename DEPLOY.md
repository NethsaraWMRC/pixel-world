# Deploy PixelMesh so anyone, anywhere can join

You deploy two things once:
1. **Signaling server** → a public `wss://` URL (tiny, cheap, always-on).
2. **Repo + browser viewer** → GitHub (public) + GitHub Pages.

Then anyone runs one `npx` command to join. No clone, no download.

---

## PART 1 — Deploy the signaling server (Fly.io, free)

### 1.1 Install flyctl + sign in
```powershell
# Windows PowerShell
iwr https://fly.io/install.ps1 -useb | iex
fly auth signup      # or: fly auth login
```

### 1.2 Deploy (uses signaling/Dockerfile + fly.toml)
```cmd
cd signaling
fly launch --no-deploy
#   - pick a UNIQUE app name (e.g. yourname-pixelmesh-sig)
#   - "Would you like to set up a database / redis?"  -> No
#   - it detects the Dockerfile and updates fly.toml
fly deploy
```

### 1.3 Get your URL + test
```cmd
fly info
#   Hostname = your-app.fly.dev
```
Open `https://your-app.fly.dev` in a browser → it should print **okay**.
Your signaling URL is: **`wss://your-app.fly.dev`**

---

## PART 2 — Bake the URL into the app

Edit two files, replacing the localhost default with your `wss://` URL:

- `cli/pixelmesh.js` → `const DEFAULT_SIGNALING = "wss://your-app.fly.dev";`
- `web/index.html`   → `const DEFAULT_SIGNALING = "wss://your-app.fly.dev";`

---

## PART 3 — Push the repo to GitHub (public)

```cmd
cd ..
git init
git add -A
git commit -m "PixelMesh"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```
(The repo must be **public** for `npx github:` to work.)

---

## PART 4 — Host the browser viewer (GitHub Pages, free)

1. GitHub repo → **Settings → Pages**.
2. **Source: Deploy from a branch**, Branch: **main**, Folder: **/ (root)**. Save.
3. Wait ~1 min. Your viewer is at:
   ```
   https://YOUR_USER.github.io/YOUR_REPO/web/index.html
   ```
   Open it — it connects to your Fly signaling automatically.

---

## PART 5 — Commands people run AFTER deploy

### The host (keeps the world alive)
The world exists only while ≥1 peer is connected. Keep one peer running so it never
goes blank (on your PC, or leave a terminal open):
```cmd
npx github:YOUR_USER/YOUR_REPO connect
```

### Any user, anywhere
```cmd
# 1. join — claims their own plot, prints their plotId, stays live
npx github:YOUR_USER/YOUR_REPO connect

# 2. draw — their coding agent writes build.json (reads AGENT.md), then:
npx github:YOUR_USER/YOUR_REPO push build.json
```
Then open the viewer and paste your plotId into **Focus** (top-right) to jump to it:
```
https://YOUR_USER.github.io/YOUR_REPO/web/index.html
```

That's it. connect → ask agent to draw → push → it appears for everyone.

---

## Notes / limits
- **Prereq for users:** Node.js 20+ (`node -v`). That's all `npx` needs.
- **Cross-network NAT:** ~20–30% of users behind strict NATs may fail to connect without a
  TURN server (public STUN is free but doesn't cover them). Add TURN if you see failures.
- **Scale:** WebRTC mesh is fine for ~5–30 concurrent. Hundreds needs a relay (= cost).
- **Cost:** Fly free tier covers the tiny signaling. No state server = no per-user cost.
- **Update after code changes:** `git push` (viewer auto-updates via Pages). Redeploy
  signaling only if you changed `signaling/`: `cd signaling && fly deploy`.
