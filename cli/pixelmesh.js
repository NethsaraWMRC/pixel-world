#!/usr/bin/env node
// PixelMesh terminal client (P2P — no state server).
//   pixelmesh connect            join the mesh, claim a plot, receive protocol, stay live
//   pixelmesh init               drop AGENT.md + build.json here so your agent knows what to do
//   pixelmesh push build.json    apply World Protocol commands to your plot
//   pixelmesh status             one-shot: who's online / how many plots
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

// signaling URL resolution: --signaling flag > PIXELMESH_SIGNALING env > saved cfg
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
// public signaling (Deno Deploy). Override locally with --signaling or PIXELMESH_SIGNALING.
const DEFAULT_SIGNALING = "wss://pixel-world.nethsarawmrc.deno.net";
function resolveSignaling() {
  return flag("--signaling") || process.env.PIXELMESH_SIGNALING || load().signaling || DEFAULT_SIGNALING;
}

const PROTOCOL = {
  plot: "32x32, coords 0..31, colors #rrggbb hex",
  commands: ["clear", "fill_rect", "set_pixels", "set_title"],
  howToPush: "write a JSON array of commands to build.json, then: pixelmesh push build.json",
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

  // claim: reuse my existing plot if present, else take the lowest free cell
  let mine = [...plots.values()].find((p) => p.get("owner") === peerId);
  if (!mine) {
    const cell = nextFreeCell(plots);
    const plotId = "plot_" + crypto.randomBytes(3).toString("hex");
    mine = makePlot(Y, plots, { plotId, owner: peerId, cell });
    console.log(`claimed ${plotId} at cell ${cell}`);
  }
  save({ peerId, plotId: mine.get("plotId"), room: ROOM, signaling });

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

  process.on("SIGINT", () => { provider.destroy(); process.exit(0); });
  await new Promise(() => {}); // keep the peer alive (it holds your plot in the mesh)
}

async function push(file) {
  if (!file) { console.error("usage: pixelmesh push <file.json>"); process.exit(1); }
  const cfg = load();
  if (!cfg.peerId) { console.error("run `pixelmesh connect` first."); process.exit(1); }
  const cmds = JSON.parse(fs.readFileSync(file, "utf8"));
  const { plots, provider } = joinWorld(cfg.peerId, { signaling: resolveSignaling() });

  // fill in plotId for commands that omit it (single-plot convenience)
  for (const c of cmds) if (!c.plotId) c.plotId = cfg.plotId;

  // wait until your plot actually syncs into this peer's doc (survives tunnel latency)
  console.log("joining mesh, waiting for your plot to sync…");
  const ok = await waitFor(() => plots.get(cfg.plotId), 15000);
  if (!ok) {
    console.error(`plot ${cfg.plotId} not found in the mesh. Is \`connect\` running (holding it)?`);
    provider.destroy(); process.exit(1);
  }

  let applied = 0;
  for (const cmd of cmds) if (applyCommand(plots, cfg.peerId, cmd)) applied++;
  console.log(`applied ${applied}/${cmds.length} commands to ${cfg.plotId}`);
  await settle(2500);   // let the change propagate to other peers before we exit
  provider.destroy();
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
  const agentMd = `# You are connected to a PixelMesh pixel world

You control ONE 32x32 pixel plot in a shared, live world. To draw: write a JSON array of
World Protocol commands to \`build.json\`, then run:  ${pushCmd}

## Commands you may put in build.json
- {"cmd":"clear"}
- {"cmd":"fill_rect","x":0,"y":0,"w":32,"h":8,"color":"#3b82f6"}
- {"cmd":"set_pixels","pixels":[[x,y,"#rrggbb"], ...]}
- {"cmd":"set_title","title":"..."}

## Rules
- Plot is 32x32. Coordinates 0..31. Colors are #rrggbb hex.
- Always start a fresh design with a \`clear\`.
- Do NOT include a plotId — it is filled in automatically from your connection.
- After writing build.json, run:  ${pushCmd}
- Your plot appears live in the browser world within ~1s.
${cfg.plotId ? `\nYour current plotId: ${cfg.plotId}` : "\n(Run `pixelmesh connect` first to claim your plot.)"}
`;
  const exampleBuild = JSON.stringify([
    { cmd: "clear" },
    { cmd: "set_title", title: "hello" },
    { cmd: "fill_rect", x: 8, y: 8, w: 16, h: 16, color: "#22c55e" },
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
    else console.log("commands: connect | init | push <file.json> | status");
  } catch (e) {
    console.error("failed:", e.message);
    process.exit(1);
  }
})();
