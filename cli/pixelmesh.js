#!/usr/bin/env node
// PixelWorld terminal client (P2P — no state server).
//   pixelworld connect            join the mesh, claim a plot, receive protocol, stay live
//   pixelworld init               drop AGENT.md + build.json here so your agent knows what to do
//   pixelworld push build.json    apply World Protocol commands to your plot
//   pixelworld status             one-shot: who's online / how many plots
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { joinWorld, ROOM } from "./peer.js";
import { applyCommand, makePlot } from "../shared/protocol.js";
import { nextFreeCell } from "../shared/layout.js";

const REPO = "NethsaraWMRC/pixel-world";     // used in generated agent instructions
const VIEWER = "https://nethsarawmrc.github.io/pixel-world/web/index.html"; // browser world

const CFG = path.join(os.homedir(), ".pixelmesh.json");
const load = () => (fs.existsSync(CFG) ? JSON.parse(fs.readFileSync(CFG, "utf8")) : {});
const save = (o) => fs.writeFileSync(CFG, JSON.stringify(o, null, 2));

// local IPC: `push` hands commands to the running `connect` session (single writer).
const DIR = path.join(os.homedir(), ".pixelmesh");
const SESSION = path.join(DIR, "session.json");   // connect heartbeat
const INBOX = path.join(DIR, "inbox.json");        // pending push commands
const SNAP = path.join(DIR, "plot.json");          // your last drawing (survives disconnect)
const loadSnap = () => { try { return JSON.parse(fs.readFileSync(SNAP, "utf8")); } catch { return null; } };
const saveSnap = (plot) => {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(SNAP, JSON.stringify({
      cells: plot.get("cells") || "", pal: plot.get("pal") || [], title: plot.get("title") || "",
    }));
  } catch {}
};

// signaling URL resolution: --signaling flag > PIXELMESH_SIGNALING env > saved cfg
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
// public signaling (Deno Deploy). Override locally with --signaling or PIXELMESH_SIGNALING.
const DEFAULT_SIGNALING = "wss://pixelworld-signaling.www-ravindunethsararc.workers.dev";
function resolveSignaling() {
  // explicit flag/env wins; otherwise always the baked default (never a stale saved value)
  return flag("--signaling") || process.env.PIXELMESH_SIGNALING || DEFAULT_SIGNALING;
}

const PROTOCOL = {
  plot: "128x128, coords 0..127, colors #rrggbb hex",
  commands: ["clear", "fill_rect", "set_pixels", "set_title"],
  howToPush: "write a JSON array of commands to build.json, then: pixelworld push build.json",
};

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

// poll `cond` every 300ms until truthy or timeout; resolves true/false
async function waitFor(cond, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (cond()) return true;
    await settle(300);
  }
  return false;
}

async function connect() {
  const cfg = load();
  const peerId = cfg.peerId || "peer_" + crypto.randomBytes(3).toString("hex");
  const signaling = resolveSignaling();
  console.log(`joining "${ROOM}" via ${signaling} …`);
  const { Y, plots, awareness, provider } = joinWorld(peerId, { signaling });
  await settle(1500); // let initial sync + peer discovery settle

  // claim: reuse my existing plot if present, else recreate my stable identity
  let mine = [...plots.values()].find((p) => p.get("owner") === peerId);
  if (!mine) {
    // keep the same plotId + cell across sessions when possible (stable identity + link)
    const used = new Set([...plots.values()].map((p) => p.get("cell")));
    const cell = (cfg.cell != null && !used.has(cfg.cell)) ? cfg.cell : nextFreeCell(plots);
    const plotId = cfg.plotId || ("plot_" + crypto.randomBytes(3).toString("hex"));
    mine = makePlot(Y, plots, { plotId, owner: peerId, cell });
    // restore your last drawing from the local snapshot (world is otherwise ephemeral)
    const snap = loadSnap();
    if (snap && snap.cells) {
      mine.set("cells", snap.cells);
      mine.set("pal", snap.pal || []);
      if (snap.title) mine.set("title", snap.title);
      mine.set("updatedAt", Date.now());
      console.log("restored your last drawing");
    }
    console.log(`claimed ${plotId} at cell ${cell}`);
  }
  save({ peerId, plotId: mine.get("plotId"), cell: mine.get("cell"), room: ROOM });
  saveSnap(mine);   // persist current state (also covers the very first empty plot)

  console.log("\n=== WELCOME SIGNAL ===");
  console.log("your plot:", mine.get("plotId"));
  console.log("rules   :", PROTOCOL.plot);
  console.log("push    :", PROTOCOL.howToPush);
  console.log("commands:", PROTOCOL.commands.join(", "));
  console.log("\nSEE YOUR DRAWING — open this in a browser:");
  console.log(`  ${VIEWER}?plot=${mine.get("plotId")}`);
  console.log(`\nlive · online: ${awareness.getStates().size} · plots: ${plots.size}. Ctrl+C to leave.\n`);

  awareness.on("change", () =>
    console.log(`online: ${awareness.getStates().size} · plots: ${plots.size}`));

  // ---- this session is the single writer for your plot ----
  // publish a heartbeat, and apply any commands `push` drops in the local inbox.
  const myPlotId = mine.get("plotId");
  fs.mkdirSync(DIR, { recursive: true });
  const beat = () => { try { fs.writeFileSync(SESSION, JSON.stringify({ plotId: myPlotId, ts: Date.now() })); } catch {} };
  beat(); setInterval(beat, 2000);
  let lastNonce = 0;
  setInterval(() => {
    let msg; try { msg = JSON.parse(fs.readFileSync(INBOX, "utf8")); } catch { return; }
    if (!msg || msg.nonce <= lastNonce) return;
    lastNonce = msg.nonce;
    let ok = 0;
    for (const c of msg.cmds) { if (!c.plotId) c.plotId = myPlotId; if (applyCommand(plots, peerId, c)) ok++; }
    saveSnap(mine);   // persist so it survives disconnect
    console.log(`drew ${ok}/${msg.cmds.length} from push`);
  }, 400);

  process.on("SIGINT", () => { try { fs.unlinkSync(SESSION); } catch {} provider.destroy(); process.exit(0); });
  await new Promise(() => {}); // keep the peer alive (it holds your plot in the mesh)
}

async function push(file) {
  if (!file) { console.error("usage: pixelworld push <file.json>"); process.exit(1); }
  const cfg = load();
  if (!cfg.peerId) { console.error("run `pixelworld connect` first."); process.exit(1); }
  const cmds = JSON.parse(fs.readFileSync(file, "utf8"));

  // hand the commands to the running `connect` session via the local inbox (no mesh join).
  let sess; try { sess = JSON.parse(fs.readFileSync(SESSION, "utf8")); } catch {}
  if (!sess || Date.now() - sess.ts > 8000) {
    console.error("no live session. In another terminal run `pixelworld connect` and keep it open, then push again.");
    process.exit(1);
  }
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(INBOX, JSON.stringify({ cmds, nonce: Date.now(), plotId: cfg.plotId }));
  console.log(`queued ${cmds.length} commands to your live session (${sess.plotId}) — appears in the world in ~1s.`);
  process.exit(0);
}

async function status() {
  const cfg = load();
  const peerId = cfg.peerId || "peer_probe";
  const { plots, awareness, provider } = joinWorld(peerId, { signaling: resolveSignaling() });
  // wait for peer discovery + a first sync (up to 8s) so we don't report an empty world early
  await waitFor(() => awareness.getStates().size > 1 && plots.size > 0, 8000);
  console.log(`online: ${awareness.getStates().size} · plots: ${plots.size}`);
  provider.destroy();
  process.exit(0);
}

// drop AGENT.md + example build.json into the current folder so a coding agent
// (Claude Code, Cursor, …) can read the rules and draw, on a machine that never cloned the repo.
function init() {
  const cfg = load();
  const pushCmd = `npx -y github:${REPO} push build.json`;
  const agentMd = `# You are connected to a PixelWorld pixel world

You control ONE 128x128 pixel plot in a shared, live world. To draw: write a JSON array of
World Protocol commands to \`build.json\`, then run:  ${pushCmd}

## Commands you may put in build.json
- {"cmd":"clear"}
- {"cmd":"fill_rect","x":0,"y":0,"w":128,"h":32,"color":"#3b82f6"}
- {"cmd":"set_pixels","pixels":[[x,y,"#rrggbb"], ...]}
- {"cmd":"set_title","title":"..."}

## Rules
- Plot is 128x128. Coordinates 0..127. Colors are #rrggbb hex.
- Always start a fresh design with a \`clear\`.
- Do NOT include a plotId — it is filled in automatically from your connection.
- After writing build.json, run:  ${pushCmd}
- Your plot appears live in the browser world within ~1s.
${cfg.plotId ? `\nYour current plotId: ${cfg.plotId}` : "\n(Run `pixelworld connect` first to claim your plot.)"}
`;
  const exampleBuild = JSON.stringify([
    { cmd: "clear" },
    { cmd: "set_title", title: "hello" },
    { cmd: "fill_rect", x: 32, y: 32, w: 64, h: 64, color: "#22c55e" },
  ], null, 2) + "\n";

  fs.writeFileSync(path.join(process.cwd(), "AGENT.md"), agentMd);
  if (!fs.existsSync(path.join(process.cwd(), "build.json")))
    fs.writeFileSync(path.join(process.cwd(), "build.json"), exampleBuild);

  console.log("wrote AGENT.md + build.json here.");
  console.log("next: open your coding agent in this folder and say e.g.");
  console.log('      "read AGENT.md, then draw a green tree and push it"');
}

const [cmd, arg] = process.argv.slice(2);
(async () => {
  try {
    if (cmd === "connect") await connect();
    else if (cmd === "init") init();
    else if (cmd === "push") await push(arg);
    else if (cmd === "status") await status();
    else if (cmd === "seed") await import("./seed.js");
    else console.log("commands: connect | init | push <file.json> | status | seed");
  } catch (e) {
    console.error("failed:", e.message);
    process.exit(1);
  }
})();
