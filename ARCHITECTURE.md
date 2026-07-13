# How PixelWorld Actually Works — A Complete Beginner's Guide

This explains the whole project from zero. No prior knowledge of P2P, WebRTC, or CRDTs
assumed. Every concept is explained the first time it's used, with a plain-English
analogy and then how it maps to real code in this repo.

---

## Table of contents

1. [The one-sentence idea](#1-the-one-sentence-idea)
2. [Why not just use a normal server?](#2-why-not-just-use-a-normal-server)
3. [The big picture](#3-the-big-picture)
4. [Concept: Peer-to-peer (P2P)](#4-concept-peer-to-peer-p2p)
5. [Concept: WebRTC](#5-concept-webrtc)
6. [Concept: Signaling (the phone book problem)](#6-concept-signaling-the-phone-book-problem)
7. [Concept: STUN and TURN (getting through routers)](#7-concept-stun-and-turn-getting-through-routers)
8. [Concept: CRDT and Yjs (merging without conflicts)](#8-concept-crdt-and-yjs-merging-without-conflicts)
9. [The World Protocol (how drawing works)](#9-the-world-protocol-how-drawing-works)
10. [Every piece of the system](#10-every-piece-of-the-system)
11. [Full connection flow, step by step](#11-full-connection-flow-step-by-step)
12. [Full drawing flow, step by step](#12-full-drawing-flow-step-by-step)
13. [How your drawing survives you closing the terminal](#13-how-your-drawing-survives-you-closing-the-terminal)
14. [How two people don't collide](#14-how-two-people-dont-collide)
15. [What's hosted vs what's peer-to-peer](#15-whats-hosted-vs-what-is-peer-to-peer)
16. [Glossary](#16-glossary)

---

## 1. The one-sentence idea

A shared drawing canvas, split into small squares ("plots"), where each person owns one
square, draws in it by talking to a coding agent in their terminal, and the drawing
appears live for everyone else — without any central server storing the picture.

---

## 2. Why not just use a normal server?

The obvious way to build this: one server holds the picture in a database. Everyone's
browser asks that server "what does the picture look like?" and sends it "here's my new
pixel." Simple, and how 99% of apps work.

**The problem:** that server has to stay running forever, and it has to handle every
single pixel from every single user passing through it. More users = more server cost,
forever. For a fun side project, that's a bill that never stops.

**The idea we used instead:** what if the picture doesn't live on a server at all? What
if it just lives inside everyone's browser/terminal while they're connected, and those
browsers/terminals send pixels **directly to each other**? Then there's no database, no
"pixel highway" server to pay for. That direct browser-to-browser connection is called
**peer-to-peer (P2P)**, explained in section 4.

The catch: to connect directly, two computers first need to find each other and agree on
*how* to connect. That tiny "let me introduce you two" step is the only thing that still
needs a server — and it's small enough to stay free forever. That's section 6.

---

## 3. The big picture

```
   Your terminal                                    Your friend's terminal
  ┌───────────────┐                                 ┌───────────────┐
  │ coding agent   │                                 │ coding agent   │
  │ writes pixels  │                                 │ writes pixels  │
  └───────┬────────┘                                 └───────┬────────┘
          │ pixelworld push                                   │ pixelworld push
          ▼                                                    ▼
  ┌───────────────┐        direct connection         ┌───────────────┐
  │ connect (Node) │◄─────────────────────────────────►│ connect (Node) │
  │ holds YOUR plot│         (WebRTC, P2P)             │ holds THEIR plot│
  └───────┬────────┘                                 └───────┬────────┘
          │                                                    │
          │        ┌─────────────────────────────┐            │
          └───────►│  tiny signaling server        │◄──────────┘
                    │  (Cloudflare) — just makes    │
                    │  introductions, then steps out│
                    └─────────────────────────────┘
          ▲                                                    ▲
          │              direct connection (WebRTC)             │
          └────────────────────┬───────────────────────────────┘
                                ▼
                    ┌───────────────────────┐
                    │   browser viewer        │  (anyone watching)
                    │   renders both plots     │
                    └───────────────────────┘
```

Two totally different kinds of "connection" are happening, and mixing them up is the
#1 source of confusion, so let's be very precise:

- **The signaling server** (hosted on Cloudflare) never sees a single pixel. Its ONLY
  job is: "hey peer A, here's how to reach peer B." Then it's out of the conversation.
- **The actual drawing data** flows peer-to-peer — straight from your `connect` process
  to your friend's `connect` process, and to any open browser tab. No server in the
  middle of that traffic.

---

## 4. Concept: Peer-to-peer (P2P)

**Analogy:** Normally, if you want to send your friend a photo, you might upload it to a
cloud drive, and they download it from there — the cloud drive is a middleman. P2P is
you handing them a USB stick directly. No middleman holds the photo.

In networking, "peer-to-peer" means two computers talk **directly** to each other over
the internet, instead of both talking to a shared server that relays messages between
them.

**Why it's hard normally:** your home computer sits behind a router (this is called
**NAT — Network Address Translation**). The internet can't just "call" your computer
directly the way it can call a public server, because your router is hiding you behind
one shared public address for your whole house. Two computers, each behind their own
router, generally **can't** find each other without help. That help is what sections 6
and 7 solve.

**In this project:** every `pixelworld connect` (your terminal) and every open browser
tab is a "peer." They all try to form **direct connections** to each other. Once
connected, drawing data flows straight between them — nobody's data passes through a
server that could see it, log it, or cost you money per pixel.

---

## 5. Concept: WebRTC

**WebRTC** (Web Real-Time Communication) is the technology that actually makes
peer-to-peer connections possible **inside a web browser**. It was originally built for
video calls (that's how Google Meet, Discord voice, etc. connect you directly to other
people instead of routing video through a server). We're using the same tech, but instead
of sending video/audio, we send small text messages describing pixel colors.

**Key fact:** browsers can only do a few kinds of networking — regular web requests
(HTTP), WebSockets (a persistent two-way pipe to *one* server), and WebRTC (a direct pipe
to *another browser*). WebRTC is the only browser-legal way to talk peer-to-peer.

**In this project:**
- The **browser viewer** ([web/index.html](web/index.html)) uses WebRTC natively — it's
  built into every browser.
- **Node.js (your terminal)** does NOT have WebRTC built in — it's a browser feature. So
  [cli/peer.js](cli/peer.js) plugs in a library called `node-datachannel` that gives
  Node.js the same WebRTC powers a browser has. This is why running the "connect" command
  in a terminal can still form a real peer-to-peer video-call-style connection with a
  browser tab across the internet.

We don't call the raw WebRTC APIs directly — a library called **y-webrtc** handles the
connection setup for us, layered on top of WebRTC, and hands us a synced shared document
(explained in section 8).

---

## 6. Concept: Signaling (the phone book problem)

Here's the puzzle WebRTC has: to connect directly, peer A needs to send peer B a message
that says "here's my network address and how to reach me." But peer A and peer B have no
way to send each other that FIRST message — because they're not connected yet! It's a
chicken-and-egg problem.

**Analogy:** imagine you and a friend want to meet up in a city, but neither of you knows
the other's phone number. You need some existing shared channel — a mutual friend, or a
message board — where you can both post "I'm looking for you, here's how to reach me,"
and read each other's post. Once you both have that info, you can call each other
directly and never need the message board again.

That "message board" is called a **signaling server**. Its entire job:
1. Both peers connect to it (over a normal WebSocket, not WebRTC — this part is easy,
   it's just a regular server).
2. Peer A sends its connection info; the signaling server forwards it to peer B.
3. Peer B replies with its own connection info; forwarded back to A.
4. Now A and B have enough information to open a **direct** WebRTC connection to each
   other. The signaling server is no longer involved — it never carried any drawing data.

**In this project:** [signaling-cf/src/worker.js](signaling-cf/src/worker.js) is our
signaling server — about 80 lines of code, deployed on Cloudflare. It uses a Cloudflare
feature called a **Durable Object**, which guarantees ALL peers talk to the exact same
single instance of this small server (important — see the sidebar below).

> **Sidebar: why we specifically use a Cloudflare Durable Object.**
> We originally tried Deno Deploy, a "serverless" host that spins up many parallel copies
> (isolates) of your code around the world for speed. That's great for a normal website,
> but terrible for signaling: if peer A's introduction request landed on isolate #1 and
> peer B's landed on isolate #2, they'd never see each other's messages — the isolates
> don't share memory. Peers on different isolates silently failed to connect, which is
> exactly the "my friend can't see my drawing" bug we hit. A Durable Object solves this
> by pinning ALL requests for our one signaling "room" to a single, consistent instance,
> no matter where in the world the peer connects from.

---

## 7. Concept: STUN and TURN (getting through routers)

Signaling (section 6) tells two peers *how* to reach each other, but sometimes even with
that information, a direct connection **still can't be made** — home routers are
protective and block unsolicited incoming connections.

**STUN** is a tiny helper server that a peer asks: "what does my connection look like
from the *outside* of my router?" Your router usually hides your real address, so STUN
helps you discover the address other people would need to use to reach you. This works
for most home WiFi setups. `stun.l.google.com` (a free public STUN server) is used in this
project.

**TURN** is the fallback for when STUN isn't enough — some networks (especially mobile
data / cellular networks using something called Carrier-Grade NAT, and some strict
corporate networks) make direct connection *impossible*, no matter what. TURN is a
relay server: both peers connect to it, and it forwards traffic between them. This is
the one case where your drawing data DOES pass through a server — but only for the
minority of connections that truly need it (roughly 20–30% of real-world connections).

**In this project:** we use a free TURN service from **metered.ca**. You can see the
exact server list in [cli/peer.js](cli/peer.js) and [web/index.html](web/index.html)
(`ICE_SERVERS`). "ICE" (Interactive Connectivity Establishment) is just the umbrella term
for "try STUN first, fall back to TURN if needed" — WebRTC handles that negotiation
automatically once you give it the server list.

> **Real bug we hit:** the Node.js WebRTC library we use (`node-datachannel`) turned out
> to hang indefinitely when given a TURN server address that uses TCP or TLS
> (`?transport=tcp` or `turns:`) — it only reliably works with plain UDP TURN. Browsers
> handle all of those fine. So [cli/peer.js](cli/peer.js) intentionally gives the Node
> side a *smaller* TURN list (UDP only) than what the browser uses — both sides still
> meet at the same relay servers, just via different transport methods.

---

## 8. Concept: CRDT and Yjs (merging without conflicts)

Say two people edit the same document at the same time, with no server arbitrating.
Normally you'd worry: what if their edits conflict? Whose change wins?

A **CRDT** (Conflict-free Replicated Data Type) is a special way of structuring data so
that this question never comes up — the data structure is *designed* so that no matter
what order changes arrive in, or if two people change different things at the same
"time," every copy automatically ends up **identical** once everyone has seen everyone
else's changes. No conflict, no arbitration, no server needed to decide a "winner."

**Analogy:** imagine a shared shopping list where instead of one file everyone edits
(which can conflict — "who deleted milk?"), each person can only *add* items to their own
named section. Combining everyone's sections into one big list is trivial and never
conflicts, because nobody is editing the same section as anyone else.

**Yjs** is the JavaScript library that implements CRDTs for us. We don't write any merge
logic — we just treat a `Y.Doc` (Yjs document) like a normal JavaScript
object/map/array, and Yjs handles making sure every peer's copy converges to the same
state.

**In this project** ([shared/protocol.js](shared/protocol.js)):
- The whole world is one `Y.Doc`.
- It contains a `Y.Map` called `plots` — think of it like a JavaScript object where each
  key is a plot ID (like `"plot_a1b2c3"`) and the value is that plot's data (owner, cell
  position, size, title, and the pixel grid).
- **Ownership rule enforced in code, not by the CRDT:** anyone *could* technically write
  to any plot's data, but [applyCommand()](shared/protocol.js) checks
  `plot.get("owner") !== myPeerId` and refuses to apply the change if you're not the
  owner. Because every well-behaved client enforces this same rule, plots stay
  effectively single-writer in practice — which is also why the CRDT merging is simple:
  nobody else is racing to write to your plot, so there's nothing to reconcile.

**y-webrtc** is the glue library that connects Yjs to WebRTC — it takes care of "whenever
my Y.Doc changes, send that change to all my connected peers over WebRTC" and "whenever a
peer sends me a change, apply it to my local Y.Doc." This is *also* the library that
manages the signaling connection and calls `RTCPeerConnection` under the hood — it's
doing a lot of the heavy lifting described in sections 5–7 for us.

---

## 9. The World Protocol (how drawing works)

We don't let a coding agent poke arbitrary code into the world — that would be a huge
security hole (imagine an agent writing malicious JavaScript that runs on everyone's
screen). Instead, agents can only emit small, safe, **declarative** JSON commands — they
describe *what* they want drawn, never *how* to draw it in code. This file defines the
whole vocabulary, in [shared/protocol.js](shared/protocol.js):

```json
{ "cmd": "clear" }
{ "cmd": "fill_rect", "x": 0, "y": 0, "w": 128, "h": 32, "color": "#3b82f6" }
{ "cmd": "set_pixels", "pixels": [[10, 10, "#ff0000"], [11, 10, "#ff0000"]] }
{ "cmd": "set_title", "title": "My House" }
```

Every command passes through `applyCommand()`, which enforces three safety rules before
touching the shared world:
1. **Ownership** — you can only draw on the plot you own.
2. **Bounds clamping** — coordinates outside `0..127` (or whatever the plot size is) are
   silently ignored, so nobody can draw outside their box.
3. **Color validation** — anything that isn't a proper `#rrggbb` hex color is rejected.

### How pixels are actually stored (and why)

The naive approach would be: one CRDT entry per pixel (`"10,10" -> "#ff0000"`). We
actually tried this first — and it broke. A fully-colored 128×128 plot is 16,384 pixels;
storing each as a separate entry made the "here's the whole plot" sync message roughly
**570 KB**, which is too large to reliably pass over a WebRTC data channel (especially
one relayed through TURN). Big fills would just silently fail to reach other peers.

The fix, now in place: each plot stores its pixels as **one packed grid** —
a single `Uint8Array` (one byte per pixel, holding a small "palette index" number),
converted to a base64 text string for storage in the CRDT (`plot.cells`), plus a small
list of actual colors used (`plot.pal`, so palette index `3` might mean `"#3b82f6"`).
This shrinks a full 128×128 plot down to roughly **22 KB** — small enough to sync
reliably, even relayed over TURN. This works specifically *because* plots are
single-writer (section 8) — we don't need per-pixel CRDT merging, just "here's my whole
current picture," which a single owner can safely overwrite atomically.

---

## 10. Every piece of the system

| File / Folder | What it is | Analogy |
|---|---|---|
| [signaling-cf/](signaling-cf/) | The Cloudflare Worker + Durable Object that introduces peers | The mutual-friend message board (section 6) |
| [shared/protocol.js](shared/protocol.js) | Draw commands + how pixels are packed/validated | The rulebook everyone agrees to follow |
| [shared/layout.js](shared/layout.js) | Math for where each plot sits in the world grid (spiral layout) | The seating chart |
| [shared/world.js](shared/world.js) | (if present) shared Yjs doc setup helpers | — |
| [cli/peer.js](cli/peer.js) | Gives Node.js WebRTC powers + sets up the shared Yjs doc | The "phone" your terminal uses to call other peers |
| [cli/pixelmesh.js](cli/pixelmesh.js) | The actual `pixelworld` command-line tool | The dashboard you interact with |
| [cli/seed.js](cli/seed.js) | Creates the small "gallery" example plots (car, joker, etc.) | Decorating an empty room before guests arrive |
| [web/index.html](web/index.html) | The browser viewer — pans, zooms, renders every plot | The window you look through to see the world |
| [AGENT.md](AGENT.md) | Instructions a coding agent reads to know how to draw | The agent's "user manual" for this world |

---

## 11. Full connection flow, step by step

This is exactly what happens when you run `pixelworld connect`:

1. **Load your local identity.** Your computer checks `~/.pixelmesh.json` for a saved
   `peerId` and `plotId` from before. First time ever? It generates a random one now
   (like `peer_a1b2c3`) and will reuse it forever after, so you keep the same plot.

2. **Open a WebSocket to the signaling server.** This is a normal, boring, well-understood
   web connection to our Cloudflare Worker (`wss://pixelworld-signaling....workers.dev`).
   Not WebRTC yet — just "hi, I'm here."

3. **Announce yourself and wait to hear about others.** Through that WebSocket, you tell
   the signaling server "I'm interested in room `pixelmesh-world`." Anyone else already
   in that room gets told about you, and you get told about them.

4. **WebRTC handshake begins (section 5).** For each other peer you learned about, your
   computer and theirs exchange a few small setup messages *through* the signaling
   server (this is the "offer/answer" and "ICE candidate" exchange — the actual
   technical name for what section 6 called "here's how to reach me"). If STUN alone
   can't get you connected, TURN kicks in as a fallback (section 7).

5. **Direct connection established.** Once that handshake finishes, you have a live,
   direct WebRTC data channel to that peer. The signaling server's job for this pair is
   done.

6. **Yjs syncs the whole shared document over that channel.** Every plot that peer knows
   about, you now learn about too (and vice versa) — this all happens automatically via
   y-webrtc, no code we wrote does this explicitly.

7. **Claim or reuse your plot.** [cli/pixelmesh.js](cli/pixelmesh.js) looks through the
   now-synced `plots` map for one you already own. Found one → reuse it (same plot,
   same position, forever). Not found → claim the next open grid cell
   ([shared/layout.js](shared/layout.js)'s spiral math) and create a new plot entry.

8. **Restore your last drawing, if any.** If you have a locally-saved snapshot of your
   last drawing (from before you closed the terminal) and it matches the current plot's
   size, it's painted back in immediately — see section 13.

9. **Print the welcome signal.** Your plot ID, the drawing rules, and a direct link to
   view your plot in the browser.

10. **Stay alive, listening for two things continuously:** new commands to draw
    (section 12), and whether your plot's grid cell collides with someone else's
    (section 14).

---

## 12. Full drawing flow, step by step

This is what happens when you ask a coding agent to draw something and it runs
`pixelworld push build.json`:

1. **The agent writes `build.json`** — a JSON array of World Protocol commands
   (section 9) describing the picture, always starting with `{"cmd":"clear"}`.

2. **`push` does NOT rejoin the whole peer-to-peer mesh.** Early versions did — and it
   was slow and unreliable (a brand new peer has to redo the whole signaling +
   WebRTC handshake dance from section 11 just to push one drawing). Instead:

3. **`push` writes your commands to a small local file** (`~/.pixelmesh/inbox.json`) —
   this is a hand-off to your own already-running `connect` process on the same
   computer, not a network operation at all. Practically instant.

4. **Your `connect` process notices the new file** (it checks it a few times a second)
   and runs each command through `applyCommand()` (section 9's safety rules), updating
   its in-memory copy of your plot.

5. **Yjs sees your plot's data changed** and automatically sends that change to every
   peer you're directly connected to over WebRTC — no networking code we wrote does
   this explicitly, it's automatic once you `.set()` a value on a `Y.Map`.

6. **Every connected peer's Yjs doc updates too**, including the browser viewer's, which
   triggers a redraw of the canvas — usually within about a second.

7. **`connect` also saves a local snapshot** of your finished drawing, so it survives you
   closing the terminal (section 13).

---

## 13. How your drawing survives you closing the terminal

The world itself is genuinely temporary — if literally everyone disconnects, there's no
server keeping a backup, so the shared Yjs document for that "room" simply ceases to
exist (nobody has a copy anymore). This is intentional (see the original design guide,
`pixel-world-guide.md`, section 2) — no database to run or pay for.

But that would mean YOUR drawing disappears every time you close your laptop, which is
annoying. The fix is **local persistence**, entirely on your own machine:

- After every successful draw, `connect` writes your current pixel grid, palette, and
  title to `~/.pixelmesh/plot.json`.
- When you reconnect later, if you don't find your plot already alive in the mesh (e.g.
  you were the last one to leave, so it genuinely vanished), you recreate a plot with
  your same saved `plotId` and immediately repaint your last saved picture into it — see
  step 8 of section 11.
- A size check guards against restoring stale data from an old, differently-sized version
  of the world (this bit us once — a leftover 32×32 snapshot got restored into a 128×128
  plot and looked broken until this check was added).

This is why the world *looks* permanent even though nothing is technically ever "saved"
to a server — everyone's own machine keeps a backup of just their own plot, and
reconnecting seamlessly restores it into the shared world.

---

## 14. How two people don't collide

Every plot sits in one numbered "cell" of a spiral grid (section 10's
[shared/layout.js](shared/layout.js)) — cell 0 is the center, cell 1 is next to it, and
so on outward. Normally, when you connect, you claim the **lowest empty cell**.

**The bug we hit:** if two people connect to the world for the very first time at nearly
the same moment, *before* they've finished syncing with each other, they can BOTH
independently look at their own (still incomplete) view of the world, both see cell 0 as
"empty," and both claim it. Once they finish syncing, they discover they picked the same
spot — and since the world is CRDT-merged (section 8), there's no crash or error, but two
plots now render stacked on top of each other, so only one is visible at a time
(whichever was drawn most recently).

**The fix, in [cli/pixelmesh.js](cli/pixelmesh.js):** every `connect` process regularly
checks: "is any other plot sitting in my same cell?" If so, both peers apply the exact
same rule independently — **whichever plot has the alphabetically/numerically larger
plot ID moves** to the next truly-free cell. Because every peer computes this the same
way with no coordination needed, everyone converges on the same outcome without
needing to ask anyone's permission — a very CRDT-flavored way to solve the problem.

---

## 15. What's hosted vs what is peer-to-peer

This is the single most important thing to understand about why this project is cheap
to run at any scale of *drawing* (though not unlimited scale of *connections* — see the
caveats below).

| What | Hosted or P2P? | Where | Cost driver? |
|---|---|---|---|
| Introducing two peers (signaling) | **Hosted** | Cloudflare Worker | Tiny messages only — stays essentially free even with many users |
| Relaying traffic when direct connection fails | **Hosted, but only as fallback** | metered.ca (or Cloudflare) TURN | Only used by the ~20–30% of connections that need it; has a data cap to watch |
| Every pixel you draw | **Peer-to-peer** | Straight between browsers/terminals | Free — no server carries this |
| The shared "world" document itself | **Nowhere permanent** | Lives in memory in every connected peer | Free — but genuinely temporary without local snapshots (section 13) |
| The viewer webpage (HTML/JS files) | **Hosted (static)** | GitHub Pages | Free — it's just files, no server logic |

**Honest limitations, so you're not surprised later:**
- **WebRTC "mesh" doesn't scale to hundreds of people.** Every peer connects to every
  other peer directly, so the number of connections grows very fast as people join
  (technically N² — 10 people means up to 45 direct connections total). This project is
  happy at maybe 5–30 concurrent people. Beyond that, you'd need a different
  architecture (a relay server that fans data out, at which point you're paying for
  bandwidth again).
- **TURN has a data cap on the free tier.** Since only some connections need it, this
  usually isn't an issue for casual use, but heavy sustained use by many mobile users
  could hit it.

---

## 16. Glossary

- **P2P (peer-to-peer):** two computers talking directly to each other, no server relaying
  the conversation.
- **WebRTC:** the browser technology that makes real-time P2P connections (video, voice,
  or in our case, small data messages) possible.
- **NAT:** the reason your home computer isn't directly reachable from the internet — your
  router shares one public address among every device in your house.
- **Signaling:** the small "let me introduce you two" step that happens *before* a P2P
  connection can be formed, since two computers can't message each other until they
  already have a way to message each other.
- **STUN:** a helper server that tells you what your connection looks like from outside
  your router — usually enough to connect directly.
- **TURN:** a fallback relay server used when a direct connection truly can't be made
  (e.g. some mobile networks); your data passes through it instead of going direct.
- **ICE:** the overall process of trying STUN, then falling back to TURN if needed, to
  establish a WebRTC connection.
- **CRDT (Conflict-free Replicated Data Type):** a way of structuring shared data so that
  everyone's copy automatically becomes identical after seeing each other's changes, with
  no server needed to resolve conflicts.
- **Yjs:** the JavaScript library implementing CRDTs that this project uses for the shared
  world document.
- **y-webrtc:** the library that connects Yjs to WebRTC — handles signaling, connecting to
  peers, and syncing document changes over those connections.
- **Durable Object:** a Cloudflare feature that guarantees a piece of server code always
  runs as one single, consistent instance, no matter where in the world requests come
  from — used here so all peers reliably reach the *same* signaling server, not scattered
  copies of it.
- **Palette-packed grid:** how this project stores pixels efficiently — one small number
  per pixel (a palette index) instead of a full color, kept in a compact array instead of
  one CRDT entry per pixel, to keep sync messages small enough to travel over WebRTC
  (especially when relayed through TURN).
