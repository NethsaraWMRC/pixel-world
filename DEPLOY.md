# Deploy PixelMesh so anyone, anywhere can join

Signaling host = **Cloudflare Workers** (free, no credit card, always-on, single coherent instance).
You deploy two things once:
1. **Signaling server** → a public `wss://` URL (Cloudflare Workers + Durable Object).
2. **Repo + browser viewer** → GitHub (public) + GitHub Pages.

Then anyone runs one `npx` command to join. No clone, no download.

---

## PART 1 — Put the project on GitHub (public)

The viewer is served from GitHub Pages. In your project terminal:
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

## PART 2 — Deploy the signaling server (Cloudflare Workers, no card)

Use Cloudflare Workers + a Durable Object. A Durable Object gives ONE coherent instance
that holds every peer's connection, so peers always find each other. (Deno Deploy's
multi-isolate model dropped signaling messages between isolates — peers on different
isolates never linked, so drawings randomly failed to appear. That's why we use CF here.)

```bash
cd signaling-cf
npx wrangler login       # opens a browser, authorize (free, no credit card)
npx wrangler deploy      # deploys the Worker + Durable Object
```
It prints a URL like `https://pixelworld-signaling.YOUR-SUBDOMAIN.workers.dev`.
Test: open it in a browser → prints **okay**.

Your signaling URL = same, with `https`→`wss`:
**`wss://pixelworld-signaling.YOUR-SUBDOMAIN.workers.dev`**

---

## PART 3 — Bake the URL into the app

Replace the signaling URL with your `wss://pixelworld-signaling.YOUR-SUBDOMAIN.workers.dev` in **both**:
- `cli/pixelmesh.js` → `const DEFAULT_SIGNALING = "wss://...workers.dev";`
- `web/index.html`   → `const DEFAULT_SIGNALING = "wss://...workers.dev";`

Then push again (Pages auto-updates the viewer):
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
   Open it — it connects to your Cloudflare signaling automatically.

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
- **Cloudflare Workers free**: no card, always-on, global. The Durable Object relays only
  tiny signaling messages (peer introductions) — never pixel data — so it stays free at scale.
- **Cross-network NAT:** ~20–30% of users behind strict NATs may fail without a TURN
  server (public STUN is free but doesn't cover them). Add TURN if joins fail.
- **Scale:** WebRTC mesh suits ~5–30 concurrent. Hundreds needs a relay (= cost).
- **Update after changes:** `git push` (Pages + `npx github:` get the latest). Redeploy
  signaling only if you changed `signaling-cf/`: `cd signaling-cf && npx wrangler deploy`.
