# PixelMesh (P2P pixel world)

A live 32×32 pixel world that exists only in the browsers and terminals of whoever's
connected. Data syncs **peer-to-peer** (WebRTC + Yjs CRDT). No state server — so it
stays cheap no matter how many people join. The only hosted piece is a **tiny signaling
server** that just introduces peers, then gets out of the data path.

```
 terminal + agent ─┐                        ┌─ browser viewer
                   ├── WebRTC P2P mesh (Yjs) ┤
 terminal + agent ─┘   world lives here      └─ browser viewer
        │
        └─ signaling server: only introduces peers (tiny, cheap)
```

## What actually costs money (and what doesn't)
- **State server** (holds the world) → scales with users → we DON'T use one.
- **Signaling** (peer introductions) → tiny handshake messages, not in the data path →
  basically free even at scale. This is the one piece you must run.

> Public y-webrtc signaling servers are dead as of 2026 — you run your own (below).

---

## A. Test on your own machine (no tunnel, no hosting)

Everything on one PC. Three terminals, all in this folder.

```console
# 1. signaling server (leave running)
npm run signal                       # ws://localhost:4444

# 2. the browser viewer
npm run web                          # http://localhost:8080  → open it

# 3. connect a terminal (claims your plot, stays live)
npm run connect
```

Then in a 4th terminal, push a drawing:

```console
node cli/pixelmesh.js push build.json
```

The house appears in the browser within ~1s. That's the whole loop.

> Defaults point at `ws://localhost:4444`, so no config needed for local testing.

### Let your agent drive it
Open your coding agent (Claude Code, etc.) in this folder — it reads `AGENT.md`.
Say *"draw a red house with a sun"*; it writes `build.json` and runs the push for you.

---

## B. Let other people join (needs reachable signaling)

Other machines can't reach `localhost`. Point everyone at one reachable signaling URL:

- **Terminal:** `pixelmesh connect --signaling wss://YOUR-SIGNALING` (or set `PIXELMESH_SIGNALING`).
- **Browser:** open `.../index.html?sig=wss://YOUR-SIGNALING`.

Ways to get `wss://YOUR-SIGNALING`:

1. **Host it (recommended).** Deploy `npm run signal` (the y-webrtc server) to Fly.io /
   Railway free. Always-on, stable URL. Then bake it into `DEFAULT_SIGNALING`
   (in `cli/pixelmesh.js` and `web/index.html`) and commit.
2. **Tunnel your local one.** `cloudflared tunnel --url http://localhost:4444` gives a
   `wss://…trycloudflare.com` URL. Only up while your PC + tunnel run, and the URL
   changes each run. (Needs working IPv6 on your network for the quick-tunnel host.)

### One-command join, no clone (once signaling is baked in + repo is public)
```console
npx github:YOUR_GH_USER/YOUR_REPO connect
```

---

## Commands

| command | does |
|---|---|
| `npm run signal` | run the tiny signaling server (port 4444) |
| `npm run web` | serve the browser viewer (port 8080) |
| `pixelmesh connect` | join the mesh, claim a plot, receive protocol, stay live |
| `pixelmesh push build.json` | apply World Protocol commands to your plot |
| `pixelmesh status` | one-shot: who's online / how many plots |

Signaling resolution: `--signaling` > `PIXELMESH_SIGNALING` > saved config > `DEFAULT_SIGNALING`.

## Known limits (honest)
- **WebRTC full mesh** suits ~5–30 concurrent peers. Hundreds+ (r/place scale) needs a
  relay (SFU) = real cost. Fine for a demo/small world.
- **Some peers behind strict NATs** can't connect without a TURN server (public STUN is
  free but doesn't cover them). Add TURN if you see connection failures across networks.
- **No persistence.** World exists only while ≥1 peer holds it. Last peer leaves → gone.

## Files
- `shared/` — `protocol.js` (World Protocol), `layout.js` (spiral plots)
- `cli/` — `pixelmesh.js` (connect/push/status), `peer.js` (Node WebRTC via node-datachannel)
- `web/` — `index.html` (buildless viewer, yjs+y-webrtc via esm.sh)
- `AGENT.md` — instructions your coding agent reads
