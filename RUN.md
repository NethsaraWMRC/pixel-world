# How to run PixelMesh — Host guide & User guide

Two roles:
- **Host** = you. Run the signaling server + the browser world. Own the plot(s).
- **User** = anyone who joins from their terminal to draw into your world.

There are two situations. Pick one.

---

# Situation 1 — Everyone on the SAME computer (easiest, no hosting)

Good for: you testing the whole thing yourself. No internet-facing setup.

### Prereqs
- Node.js 20+ (`node -v`).
- In this folder, once: `npm install`.

### Steps (4 terminals, all in this folder)

```console
# Terminal 1 — signaling server (introduces peers). Leave running.
npm run signal
#   -> Signaling server running on localhost: 4444

# Terminal 2 — browser world. Leave running, then open the URL.
npm run web
#   -> viewer http://localhost:8080      (open it in your browser)

# Terminal 3 — connect (claims your plot, holds it in the mesh). Leave running.
npm run connect
#   -> === WELCOME SIGNAL === your plot: plot_xxxx ...

# Terminal 4 — draw
node cli/pixelmesh.js push build.json
#   -> applied 6/6 commands
```

The drawing appears in the browser (Terminal 2's page) within ~1s.

### Let a coding agent draw for you
In Terminal 4's folder, open your agent (Claude Code, etc.). It reads `AGENT.md`.
Say *"draw a red house with a sun."* It writes `build.json` and runs the push.

Done. This is the whole product on one machine.

---

# Situation 2 — Host + Users on DIFFERENT computers

Users can't reach your `localhost`. The Host must expose ONE reachable signaling URL.
Signaling is tiny + cheap (just peer introductions) — it is NOT the expensive part.

## PART A — HOST setup (do this once)

### A1. Get a public signaling URL — choose ONE

**Option 1: Deploy to Fly.io (recommended — stable, always-on, free tier)**
```console
# install flyctl: https://fly.io/docs/h-the-cli/  then:
fly launch --no-deploy            # creates fly.toml (uses the included Dockerfile)
fly deploy
fly info                          # -> hostname like pixelmesh-sig.fly.dev
```
Your signaling URL is: `wss://pixelmesh-sig.fly.dev`

**Option 2: Tunnel your local server (quick, but URL changes each run)**
```console
npm run signal                                  # terminal 1, leave running
cloudflared tunnel --url http://localhost:4444  # terminal 2 -> prints https://xxx.trycloudflare.com
```
Your signaling URL is that address with `https` → `wss`: `wss://xxx.trycloudflare.com`
> Needs working IPv6 on your network. If it fails to connect, use Option 1.

### A2. Bake the URL in (so users don't have to type it)
Edit both files, set your URL:
- `cli/pixelmesh.js`  → `const DEFAULT_SIGNALING = "wss://YOUR-URL";`
- `web/index.html`    → `const DEFAULT_SIGNALING = "wss://YOUR-URL";`

### A3. Publish so users can join with one command
```console
git init && git add -A && git commit -m "pixelmesh"
# create a PUBLIC repo on GitHub, then:
git remote add origin https://github.com/YOU/YOUR_REPO.git
git push -u origin main
```
Host the viewer too (any static host): put `web/` + `shared/` on GitHub Pages, or just
share the browser link `http://YOUR-VIEWER/index.html?sig=wss://YOUR-URL`.

### A4. Host runs their own peer (holds the world)
```console
npm run connect        # keep running; the world lives in connected peers
```

## PART B — USER setup (each person who joins)

### Prereqs
- Node.js 20+.

### Join with one command (no clone, no download)
```console
npx github:YOU/YOUR_REPO connect
```
Prints the welcome signal (your plotId + protocol). Leave it running.

### Draw
Open a coding agent in the same terminal — it reads `AGENT.md` from the package.
Say *"draw a green tree."* It writes `build.json` and runs:
```console
npx github:YOU/YOUR_REPO push build.json
```
The tree appears in the Host's browser world (and every viewer) within ~1s.

> If the URL wasn't baked in, add `--signaling wss://HOST-URL` to both commands.

---

## Quick reference

| role | command | purpose |
|---|---|---|
| host | `npm run signal` | signaling server (peer introductions) |
| host | `npm run web` | browser world viewer |
| host | `fly deploy` / `cloudflared tunnel` | expose signaling to the internet |
| both | `pixelmesh connect` | join world, claim a plot, stay live |
| both | `pixelmesh push build.json` | draw onto your plot |
| both | `pixelmesh status` | who's online / how many plots |

## Gotchas
- **World is ephemeral.** It exists only while ≥1 peer is connected. Everyone leaves → blank.
  Keep the Host's `connect` (or a viewer) running to keep the world alive.
- **Cross-network peers behind strict NAT** may fail without a TURN server. Public STUN is
  free but doesn't cover ~20–30% of NATs. Add TURN if joins fail across different networks.
- **Scale:** WebRTC mesh is happy at ~5–30 concurrent. Hundreds needs a relay (= cost).
