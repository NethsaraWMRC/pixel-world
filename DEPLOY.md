# Deploy PixelMesh so anyone, anywhere can join

Signaling host = **Deno Deploy** (free, no credit card, always-on).
You deploy two things once:
1. **Signaling server** → a public `wss://` URL (Deno Deploy).
2. **Repo + browser viewer** → GitHub (public) + GitHub Pages.

Then anyone runs one `npx` command to join. No clone, no download.

---

## PART 1 — Put the project on GitHub (public)

Deno Deploy + Pages both pull from GitHub. In your project terminal:
```cmd
git init
git add -A
git commit -m "PixelMesh"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```
Make the repo **public**.

---

## PART 2 — Deploy the signaling server (Deno Deploy, no card)

1. Go to **https://dash.deno.com** → **Sign in with GitHub** (no credit card).
2. **New Project** → **Deploy from GitHub repository** → pick **YOUR_REPO**.
3. Settings:
   - **Production branch:** `main`
   - **Entry point:** `signaling-deno/main.ts`
   - (no build step, no env vars needed)
4. **Deploy**. Wait ~1 min.
5. You get a URL like `https://your-project.deno.dev`.
6. Test: open it in a browser → prints **okay**.

Your signaling URL = same, with `https`→`wss`: **`wss://your-project.deno.dev`**

---

## PART 3 — Bake the URL into the app

Replace `ws://localhost:4444` with your `wss://your-project.deno.dev` in **both**:
- `cli/pixelmesh.js` → `const DEFAULT_SIGNALING = "wss://your-project.deno.dev";`
- `web/index.html`   → `const DEFAULT_SIGNALING = "wss://your-project.deno.dev";`

Then push again (Deno Deploy + Pages auto-update):
```cmd
git add -A
git commit -m "bake signaling url"
git push
```

---

## PART 4 — Host the browser viewer (GitHub Pages, free)

1. GitHub repo → **Settings → Pages**.
2. **Source: Deploy from a branch**, Branch **main**, Folder **/ (root)**. Save.
3. Wait ~1 min. Viewer is at:
   ```
   https://YOUR_USER.github.io/YOUR_REPO/web/index.html
   ```
   Open it — it connects to your Deno signaling automatically.

---

## PART 5 — Commands people run AFTER deploy

### Keep the world alive
The world exists only while ≥1 peer is connected. Keep one peer running (your PC, a
spare terminal) so it never goes blank:
```cmd
npx github:YOUR_USER/YOUR_REPO connect
```

### Any user, anywhere
```cmd
# 1. join — claims their plot, prints their plotId, stays live
npx github:YOUR_USER/YOUR_REPO connect

# 2. draw — their coding agent writes build.json (reads AGENT.md), then:
npx github:YOUR_USER/YOUR_REPO push build.json
```
Then open the viewer, paste your plotId into **Focus** (top-right) to jump to it:
```
https://YOUR_USER.github.io/YOUR_REPO/web/index.html
```

connect → ask agent to draw → push → it appears for everyone.

---

## Notes / limits
- **Users need Node.js 20+** (`node -v`). That's all `npx` needs.
- **Deno Deploy free**: no card, always-on, global. It relays only tiny signaling messages
  (peer introductions) — never the pixel data — so it stays free at scale.
- **Cross-network NAT:** ~20–30% of users behind strict NATs may fail without a TURN
  server (public STUN is free but doesn't cover them). Add TURN if joins fail.
- **Scale:** WebRTC mesh suits ~5–30 concurrent. Hundreds needs a relay (= cost).
- **Update after changes:** `git push`. Deno Deploy redeploys signaling, Pages updates the
  viewer, and `npx github:` always fetches the latest.
