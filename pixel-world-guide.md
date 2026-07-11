# PixelMesh — A Serverless, Agent-Built Shared Pixel World

> A live 2D pixel world that exists only in the browsers and terminals of whoever's currently connected. No database, no always-on world server. People connect from a terminal, ask their coding agent to design something, and push it into the world. Everyone sees it appear in real time.

---

## Table of contents

1. [The core idea](#1-the-core-idea)
2. [Why this can run for free](#2-why-this-can-run-for-free)
3. [Architecture overview](#3-architecture-overview)
4. [Technology stack](#4-technology-stack)
5. [The World Protocol](#5-the-world-protocol)
6. [How plots grow and shrink with population](#6-how-plots-grow-and-shrink-with-population)
7. [Repo layout](#7-repo-layout)
8. [Part A — The signaling service](#8-part-a--the-signaling-service)
9. [Part B — The shared world state (Yjs)](#9-part-b--the-shared-world-state-yjs)
10. [Part C — The browser viewer](#10-part-c--the-browser-viewer)
11. [Part D — The terminal client + CLI](#11-part-d--the-terminal-client--cli)
12. [Part E — The agent integration](#12-part-e--the-agent-integration)
13. [End-to-end example](#13-end-to-end-example-a-full-session)
14. [Local persistence & reclaiming your plot](#14-local-persistence--reclaiming-your-plot)
15. [Moderation without a server](#15-moderation-without-a-server)
16. [Deploy & ship](#16-deploy--ship)
17. [Weekend build order](#17-weekend-build-order)

---

## 1. The core idea

- The world is a grid of **plots**. Each plot is a fixed-size pixel canvas (e.g. 32×32).
- When you connect, you're assigned **one plot** that's yours to draw on.
- The number of plots in the world equals the number of people online. 4 people = 4 plots. A 5th joins = a 5th plot appears at the edge.
- All plots together form the visible world, rendered in the browser and in any connected terminal.
- There is **no central copy of the world**. The world is the live sum of everyone's plots, synced peer-to-peer.
- You interact with your plot through your **own coding agent**, running in your **own terminal**. You ask it to design something; it produces pixels and pushes them via the World Protocol.

The whole thing is a **CRDT** (conflict-free replicated data type) shared between peers. That's the one concept that makes "no server owns the truth" actually work — more on that in §9.

---

## 2. Why this can run for free

The expensive part of any multiplayer app is the always-on server holding state and relaying every message. We eliminate it in two moves:

1. **No persistence.** The world only exists while people are connected. Nothing is written to a database. When the last person leaves, the world is simply gone (you can snapshot it — see §15).
2. **Peer-to-peer data.** Actual pixel data flows browser-to-browser and terminal-to-terminal over **WebRTC data channels**. No server sits in the data path.

The only thing you *must* host is a tiny **signaling service** whose entire job is to introduce two peers to each other once, then get out of the way. It processes a handful of small messages per connection and holds no state. This fits comfortably in **Cloudflare Workers' free tier** (or any equivalent).

> **Reality check:** browsers cannot speak raw SSH or open arbitrary sockets — only HTTP, WebSocket, and WebRTC. So "a chain of SSH hops" can't include the browser. WebRTC is the browser-legal way to do true peer-to-peer, and the signaling hop is the one small piece that can't be removed (peers behind home routers can't find each other without an introduction).

---

## 3. Architecture overview

```
                    ┌─────────────────────────┐
                    │   Signaling service     │   (stateless, free tier)
                    │   Cloudflare Worker      │   only makes introductions
                    └───────────┬─────────────┘
              one-time handshake │ (WebSocket)
        ┌──────────────┬─────────┴────────┬──────────────┐
        ▼              ▼                   ▼              ▼
 ┌─────────────┐ ┌─────────────┐   ┌─────────────┐ ┌─────────────┐
 │  Terminal   │ │  Browser    │   │  Browser    │ │  Terminal   │
 │  + agent    │ │  viewer     │   │  viewer     │ │  + agent    │
 └──────┬──────┘ └──────┬──────┘   └──────┬──────┘ └──────┬──────┘
        │               │                 │               │
        └───────────────┴────────┬────────┴───────────────┘
                     direct P2P WebRTC data channels
                  (Yjs CRDT syncs the shared world here)
```

Two planes:

- **Control plane** (signaling): tiny, hosted, free. Used only at connect time.
- **Data plane** (WebRTC mesh): serverless, direct between peers. Carries all pixels and world updates.

---

## 4. Technology stack

| Layer | Technology | Why |
|---|---|---|
| Shared state | **Yjs** (CRDT) | Automatic conflict resolution; battle-tested |
| P2P transport | **y-webrtc** | Yjs provider that syncs over WebRTC + signaling |
| Signaling | **Cloudflare Workers** (WebSocket) | Free, stateless, global |
| Browser render | **HTML5 Canvas** (2D) | Simplest fast pixel rendering |
| Terminal client | **Node.js + node-datachannel** | WebRTC in a CLI; speaks the same mesh |
| Agent | **Any coding agent** (Claude Code, etc.) | Runs in the user's terminal, calls our CLI |
| Protocol | **Custom JSON "World Protocol"** | Small, declarative, agent-friendly |

You can swap the terminal side to Go with `pion/webrtc` if you prefer; the Node path is shown here because it shares a language with the browser and Yjs.

---

## 5. The World Protocol

The World Protocol is the small, declarative contract every peer speaks. Agents produce these; clients apply them. Keeping it **declarative** (describe the result, not "run this code") is the key safety boundary — no peer ever executes another peer's code.

### 5.1 Plot object (what lives in shared state)

```json
{
  "plotId": "plot_a1b2c3",
  "owner": "peer_9f8e7d",
  "x": 64,
  "y": 0,
  "w": 32,
  "h": 32,
  "pixels": "base64-or-runlength-encoded-rgba",
  "title": "My little house",
  "updatedAt": 1731000000000
}
```

### 5.2 Commands (what an agent emits)

All commands are plain JSON. The CLI validates and applies them to your plot.

```json
{ "cmd": "set_pixels", "plotId": "plot_a1b2c3", "pixels": [[x, y, "#rrggbb"], ...] }
```
```json
{ "cmd": "fill_rect", "plotId": "plot_a1b2c3", "x": 0, "y": 0, "w": 32, "h": 8, "color": "#3b82f6" }
```
```json
{ "cmd": "clear", "plotId": "plot_a1b2c3" }
```
```json
{ "cmd": "set_title", "plotId": "plot_a1b2c3", "title": "My little house" }
```

### 5.3 Rules the client enforces

- You may only write to a plot whose `owner` equals your peer id. Commands targeting any other plot are rejected locally before they ever hit the mesh.
- Coordinates are clamped to the plot's `w`/`h`. No drawing outside your box.
- Colors must be valid hex. Invalid commands are dropped, not crashed on.

That's the whole protocol. Small enough for any agent to emit reliably, strict enough that a plot can't be griefed by a malformed or malicious command.

---

## 6. How plots grow and shrink with population

**Do not reflow the whole world when population changes** — that would visually resize everyone's art every time a stranger joins, and people will hate it. Instead, **append at the edge**.

Plots are laid out on a spiral of fixed-size cells:

```
        7   8   9
        6   1   2
        5   4   3
```

- Plot #1 is placed at the center. Each new plot takes the next free cell on an outward spiral.
- When a peer leaves, their cell becomes **free** (rendered blank), but no other plot moves.
- When a new peer joins, they claim the **lowest-numbered free cell** (reusing gaps before extending the spiral).

This gives you the "the world breathes with the crowd" behavior without ever disturbing existing work. The spiral index → (x, y) mapping is pure math, so every peer computes the same layout independently with no coordinator.

```js
// spiralCell(n) -> {gx, gy}  grid coords for the nth cell (0-indexed)
function spiralCell(n) {
  if (n === 0) return { gx: 0, gy: 0 };
  let x = 0, y = 0, d = 1, m = 1;
  let i = 0;
  while (true) {
    for (let k = 0; k < m; k++) { x += d; if (++i === n) return { gx: x, gy: y }; }
    for (let k = 0; k < m; k++) { y += d; if (++i === n) return { gx: x, gy: y }; }
    d = -d; m++;
  }
}
// world pixel origin for a plot on cell n (plots are PLOT_W x PLOT_H)
function plotOrigin(n) {
  const { gx, gy } = spiralCell(n);
  return { x: gx * PLOT_W, y: gy * PLOT_H };
}
```

---

## 7. Repo layout

```
pixelmesh/
├── signaling/            # Cloudflare Worker (control plane)
│   ├── src/worker.js
│   └── wrangler.toml
├── shared/               # code shared by browser + terminal
│   ├── protocol.js       # World Protocol validation + apply
│   ├── layout.js         # spiral plot layout
│   └── world.js          # Yjs doc setup + helpers
├── web/                  # browser viewer
│   ├── index.html
│   └── main.js
├── cli/                  # terminal client
│   ├── bin/pixelmesh.js  # CLI entrypoint
│   └── peer.js           # WebRTC peer via node-datachannel
├── AGENT.md              # instructions the user's agent reads
└── package.json
```

---

## 8. Part A — The signaling service

The Worker relays signaling messages between peers in the same "room" (our world). It stores nothing beyond the set of currently-open WebSocket connections in one Durable Object.

`signaling/src/worker.js`:

```js
export class Room {
  constructor(state) { this.state = state; this.peers = new Set(); }

  async fetch(req) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.peers.add(server);

    server.addEventListener("message", (e) => {
      // Broadcast every signaling message to all other peers in the room.
      for (const p of this.peers) {
        if (p !== server && p.readyState === 1) p.send(e.data);
      }
    });
    const drop = () => this.peers.delete(server);
    server.addEventListener("close", drop);
    server.addEventListener("error", drop);

    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(req, env) {
    const id = env.ROOM.idFromName("pixelmesh-world"); // single shared world
    return env.ROOM.get(id).fetch(req);
  },
};
```

`signaling/wrangler.toml`:

```toml
name = "pixelmesh-signaling"
main = "src/worker.js"
compatibility_date = "2024-01-01"

[[durable_objects.bindings]]
name = "ROOM"
class_name = "Room"

[[migrations]]
tag = "v1"
new_classes = ["Room"]
```

> **Even simpler option:** y-webrtc ships with a public signaling server and you can point at community-hosted ones for prototyping. Host your own (above) before you share the project widely, so you're not dependent on someone else's uptime.

---

## 9. Part B — The shared world state (Yjs)

Yjs gives every peer a replicated document that automatically merges concurrent edits. We model the world as a `Y.Map` of plots. Because it's a CRDT, if two peers change things at the same time, everyone converges to the same result with **zero merge code from you**.

`shared/world.js`:

```js
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";

export function joinWorld(signalingUrl, peerId) {
  const doc = new Y.Doc();
  const plots = doc.getMap("plots"); // plotId -> plot object (as Y.Map)

  const provider = new WebrtcProvider("pixelmesh-world", doc, {
    signaling: [signalingUrl],
  });

  // awareness = who's online right now (drives population count)
  provider.awareness.setLocalStateField("peer", { id: peerId, t: Date.now() });

  return { doc, plots, provider, awareness: provider.awareness };
}
```

Population count comes straight from Yjs **awareness** (its built-in presence system): the number of connected peers is `awareness.getStates().size`. That's your live "how many plots should exist" signal — no counting logic needed.

`shared/protocol.js`:

```js
export function applyCommand(plots, myPeerId, cmd) {
  const plot = plots.get(cmd.plotId);
  if (!plot) return false;
  if (plot.get("owner") !== myPeerId) return false;      // ownership check
  const w = plot.get("w"), h = plot.get("h");
  const px = plot.get("pixels");                          // Y.Map "x,y" -> hex

  const put = (x, y, color) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;       // clamp
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;         // validate
    px.set(`${x},${y}`, color);
  };

  switch (cmd.cmd) {
    case "set_pixels":
      for (const [x, y, c] of cmd.pixels) put(x, y, c);
      break;
    case "fill_rect":
      for (let y = cmd.y; y < cmd.y + cmd.h; y++)
        for (let x = cmd.x; x < cmd.x + cmd.w; x++) put(x, y, cmd.color);
      break;
    case "clear":
      px.clear();
      break;
    case "set_title":
      plot.set("title", String(cmd.title).slice(0, 40));
      break;
    default:
      return false;
  }
  plot.set("updatedAt", Date.now());
  return true;
}
```

Because `plots`, each plot, and its `pixels` are all Yjs types, every `.set()` above automatically propagates to all peers over the WebRTC mesh. You never write networking code for pixel updates — mutating the shared doc *is* the network call.

---

## 10. Part C — The browser viewer

`web/index.html`:

```html
<!DOCTYPE html>
<meta charset="utf-8" />
<title>PixelMesh</title>
<style>
  body { margin: 0; background: #0b0b0f; display: grid; place-items: center; height: 100vh; }
  canvas { image-rendering: pixelated; border: 1px solid #222; }
  #hud { position: fixed; top: 8px; left: 8px; color: #8a8; font: 12px monospace; }
</style>
<div id="hud"></div>
<canvas id="c" width="512" height="512"></canvas>
<script type="module" src="./main.js"></script>
```

`web/main.js`:

```js
import { joinWorld } from "../shared/world.js";
import { plotOrigin } from "../shared/layout.js";

const SIGNALING = "wss://pixelmesh-signaling.<you>.workers.dev";
const PLOT_W = 32, PLOT_H = 32, SCALE = 4;

const peerId = "peer_" + Math.random().toString(36).slice(2, 8);
const { plots, awareness } = joinWorld(SIGNALING, peerId);

const cv = document.getElementById("c");
const ctx = cv.getContext("2d");
const hud = document.getElementById("hud");

function render() {
  ctx.fillStyle = "#0b0b0f";
  ctx.fillRect(0, 0, cv.width, cv.height);
  const list = [...plots.values()].sort(
    (a, b) => a.get("cell") - b.get("cell")
  );
  for (const plot of list) {
    const { x: ox, y: oy } = plotOrigin(plot.get("cell"));
    const px = plot.get("pixels");
    px.forEach((color, key) => {
      const [x, y] = key.split(",").map(Number);
      ctx.fillStyle = color;
      ctx.fillRect((ox + x) * SCALE, (oy + y) * SCALE, SCALE, SCALE);
    });
  }
  hud.textContent = `online: ${awareness.getStates().size} · plots: ${plots.size}`;
}

plots.observeDeep(render);
awareness.on("change", render);
render();
```

The viewer is pure read-side: it never writes. It just renders whatever the shared doc currently contains and repaints on any change. Open two browser tabs and they'll show the same world.

---

## 11. Part D — The terminal client + CLI

The CLI is what the agent calls. It joins the same mesh as a headless peer, claims a plot, and exposes commands to apply World Protocol updates.

`cli/bin/pixelmesh.js`:

```js
#!/usr/bin/env node
import { Command } from "commander";
import { connectPeer } from "../peer.js";
import { applyCommand } from "../../shared/protocol.js";
import { nextFreeCell } from "../../shared/layout.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CFG = path.join(os.homedir(), ".pixelmesh.json");
const load = () => (fs.existsSync(CFG) ? JSON.parse(fs.readFileSync(CFG)) : {});
const save = (o) => fs.writeFileSync(CFG, JSON.stringify(o, null, 2));

const program = new Command();

program.command("connect").description("join the world and claim a plot")
  .action(async () => {
    const cfg = load();
    const peerId = cfg.peerId || "peer_" + Math.random().toString(36).slice(2, 8);
    const { plots, awareness, done } = await connectPeer(peerId);

    // claim a plot: reuse mine if present, else take lowest free cell
    let mine = [...plots.values()].find((p) => p.get("owner") === peerId);
    if (!mine) {
      const cell = nextFreeCell(plots);
      const plotId = "plot_" + Math.random().toString(36).slice(2, 8);
      mine = makePlot(plots, { plotId, owner: peerId, cell });
      console.log(`claimed ${plotId} at cell ${cell}`);
    }
    save({ peerId, plotId: mine.get("plotId") });
    console.log(`connected as ${peerId} · online: ${awareness.getStates().size}`);
    await done; // keep process alive
  });

program.command("push <file>")
  .description("apply a JSON array of World Protocol commands to your plot")
  .action(async (file) => {
    const cfg = load();
    const cmds = JSON.parse(fs.readFileSync(file, "utf8"));
    const { plots, close } = await connectPeer(cfg.peerId);
    let ok = 0;
    for (const cmd of cmds) if (applyCommand(plots, cfg.peerId, cmd)) ok++;
    console.log(`applied ${ok}/${cmds.length} commands`);
    setTimeout(close, 1500); // give the mesh time to propagate, then exit
  });

program.command("status").action(async () => {
  const { plots, awareness, close } = await connectPeer(load().peerId);
  console.log(`online: ${awareness.getStates().size} · plots: ${plots.size}`);
  close();
});

program.parse();
```

`cli/peer.js` (WebRTC in Node via `node-datachannel`, which y-webrtc can use through a small polyfill, or use `@roamhq/wrtc`):

```js
import { joinWorld } from "../shared/world.js";
const SIGNALING = "wss://pixelmesh-signaling.<you>.workers.dev";

export async function connectPeer(peerId) {
  const { plots, provider, awareness } = joinWorld(SIGNALING, peerId);
  await new Promise((r) => setTimeout(r, 800)); // let initial sync settle
  const close = () => provider.destroy();
  const done = new Promise(() => {}); // never resolves; keeps `connect` alive
  return { plots, provider, awareness, close, done };
}
```

> **WebRTC-in-Node note:** browsers have WebRTC built in; Node does not. `node-datachannel` or `@roamhq/wrtc` supplies it. You wire it into y-webrtc by providing the `Peer` implementation — a ~15-line polyfill documented in the y-webrtc README. Budget an hour for this one integration; it's the fiddliest part of the whole build.

---

## 12. Part E — The agent integration

The magic UX: the user runs their coding agent **inside the connected terminal**, and just asks in natural language. The agent's job is to translate a request into World Protocol commands and call `pixelmesh push`.

You give the agent this context via an `AGENT.md` in the repo (Claude Code, Cursor, etc. read files like this automatically, or the user pastes it):

`AGENT.md`:

```md
# You are connected to a PixelMesh world

You control ONE 32x32 pixel plot. To draw, write a JSON array of World Protocol
commands to `build.json`, then run `pixelmesh push build.json`.

## Commands you may emit
- {"cmd":"clear","plotId":"<PLOT_ID>"}
- {"cmd":"fill_rect","plotId":"<PLOT_ID>","x":0,"y":0,"w":32,"h":8,"color":"#3b82f6"}
- {"cmd":"set_pixels","plotId":"<PLOT_ID>","pixels":[[x,y,"#rrggbb"], ...]}
- {"cmd":"set_title","plotId":"<PLOT_ID>","title":"..."}

## Rules
- Your plot is 32x32. Coordinates 0..31. Colors are #rrggbb hex.
- Read your PLOT_ID from ~/.pixelmesh.json.
- Always start a fresh design with a `clear`.
- After writing build.json, run: pixelmesh push build.json

## Example: a small house
Produce build.json, then push it.
```

Now the interaction is literally: user opens the connected terminal, types to their agent *"draw a red house with a sun in the corner,"* and the agent writes `build.json` + runs `pixelmesh push`. The house appears in every viewer within a second.

---

## 13. End-to-end example (a full session)

**Terminal 1 (Alice):**

```console
$ npx pixelmesh connect
claimed plot_7x9k2a at cell 0
connected as peer_a1b2c3 · online: 1
```

Alice starts her agent in the same terminal and says: *"Draw a little house with a blue roof."*

The agent writes `build.json`:

```json
[
  { "cmd": "clear", "plotId": "plot_7x9k2a" },
  { "cmd": "set_title", "plotId": "plot_7x9k2a", "title": "House" },
  { "cmd": "fill_rect", "plotId": "plot_7x9k2a", "x": 8,  "y": 16, "w": 16, "h": 12, "color": "#a3612b" },
  { "cmd": "fill_rect", "plotId": "plot_7x9k2a", "x": 6,  "y": 10, "w": 20, "h": 6,  "color": "#2563eb" },
  { "cmd": "fill_rect", "plotId": "plot_7x9k2a", "x": 14, "y": 20, "w": 4,  "h": 8,  "color": "#4b2e12" },
  { "cmd": "set_pixels", "plotId": "plot_7x9k2a", "pixels": [[27,4,"#fbbf24"],[28,4,"#fbbf24"],[27,5,"#fbbf24"],[28,5,"#fbbf24"]] }
]
```

…then runs:

```console
$ pixelmesh push build.json
applied 6/6 commands
```

**Browser (anyone with the page open):** the house pops in at the center plot. HUD reads `online: 1 · plots: 1`.

**Terminal 2 (Bob) joins:**

```console
$ npx pixelmesh connect
claimed plot_3m8p1q at cell 1
connected as peer_d4e5f6 · online: 2
```

Instantly every viewer's HUD updates to `online: 2 · plots: 2`, and a new blank plot appears to the right of Alice's house. Bob asks his agent for *"a green tree"* — it appears in his plot, next to Alice's house, in real time. Neither plot moved or resized.

**Bob closes his terminal:** his plot goes blank, HUD returns to `online: 1 · plots: 1`, Alice's house is untouched.

That's the entire product loop working with no world server anywhere in the data path.

---

## 14. Local persistence & reclaiming your plot

Because there's no server account system, identity and saved art live **on the user's machine**:

- `~/.pixelmesh.json` stores a stable `peerId` (generated once) and the user's current `plotId`.
- On `connect`, if a plot owned by your `peerId` still exists in the live doc, you keep it. Otherwise you claim the lowest free cell.
- To let users **save and restore their art** across sessions (since the world itself is ephemeral), have `push` also write the resulting pixels to `~/.pixelmesh/plots/<plotId>.json`. Add a `pixelmesh restore` command that replays a saved file as `set_pixels`. Now a user can rebuild their design instantly even after the world emptied out overnight.

This keeps auth and persistence fully serverless — nothing for you to store, secure, or leak.

---

## 15. Moderation without a server

Even "just pixels" needs a safety valve. Since there's no central authority, moderation is **client-side and social**:

- **Local content checks:** the CLI can reject titles matching a profanity list before they enter the shared doc.
- **Client-side hide:** each viewer keeps a local blocklist of `peerId`s; blocked plots simply aren't rendered for that user. Ship a small "hide this plot" affordance in the browser.
- **Optional snapshot bot:** run a peer (on your own machine or a free scheduled job) that periodically joins, screenshots the world to a PNG, and posts it somewhere. This gives you (a) something to show when the world is empty and (b) an audit trail if something needs addressing.

For a weekend project this is enough. If it grows, the natural next step is an optional "trusted snapshot peer" that can flag or freeze content — but don't build that until you need it.

---

## 16. Deploy & ship

**Signaling (one-time):**

```console
$ cd signaling
$ npx wrangler deploy
# -> wss://pixelmesh-signaling.<you>.workers.dev
```

**Browser viewer:** it's static files — deploy `web/` to any free static host (Cloudflare Pages, GitHub Pages, Netlify). Point `SIGNALING` at your Worker URL.

**CLI:** publish to npm so anyone can `npx pixelmesh connect`, or ship a single bundled binary. Include `AGENT.md` in the package so agents pick it up.

**The one-command pitch for your README:**

```console
npx pixelmesh connect
# then ask your coding agent to build something, and watch it appear at
# https://pixelmesh.pages.dev
```

That single paste-able line is what makes it shareable — zero signup, zero install friction, instant payoff.

---

## 17. Weekend build order

Do it in this order so you always have something working:

1. **Sat AM — Shared state first, no networking.** Build `shared/world.js`, `protocol.js`, `layout.js`. Open two browser tabs on `localhost`; use y-webrtc's public signaling temporarily. Get two tabs syncing a hardcoded plot. *This proves the hardest concept early.*
2. **Sat PM — Browser viewer.** Finish `web/`. Get plots rendering and the spiral layout growing as you fake more peers.
3. **Sat eve — Your own signaling Worker.** Deploy it, switch the browser off the public server onto yours.
4. **Sun AM — CLI.** Build `connect` and `push`. This is where the Node-WebRTC polyfill hour lives. Get a terminal pushing a house that shows up in the browser.
5. **Sun PM — Agent glue + polish.** Write `AGENT.md`, test the full "ask agent → push → appears" loop, write the README with the one-command pitch, record a 15-second screen capture for the repo.

Ship the screen capture with your first tweet/post — the "type one command, ask an AI, watch it draw into a shared world" demo is the whole hook.

---

## Appendix — `shared/layout.js`

```js
export const PLOT_W = 32, PLOT_H = 32;

export function spiralCell(n) {
  if (n === 0) return { gx: 0, gy: 0 };
  let x = 0, y = 0, d = 1, m = 1, i = 0;
  while (true) {
    for (let k = 0; k < m; k++) { x += d; if (++i === n) return { gx: x, gy: y }; }
    for (let k = 0; k < m; k++) { y += d; if (++i === n) return { gx: x, gy: y }; }
    d = -d; m++;
  }
}

export function plotOrigin(cell) {
  const { gx, gy } = spiralCell(cell);
  // shift so center cell sits in the middle of a positive canvas
  return { x: (gx + 8) * PLOT_W, y: (gy + 8) * PLOT_H };
}

export function nextFreeCell(plots) {
  const used = new Set([...plots.values()].map((p) => p.get("cell")));
  let n = 0;
  while (used.has(n)) n++;
  return n;
}
```

---

*Built to run on nothing. The world lives only while people do.*
