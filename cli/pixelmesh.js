#!/usr/bin/env node
// PixelMesh terminal client (P2P — no state server).
//   pixelmesh connect            join the mesh, claim a plot, receive protocol, stay live
//   pixelmesh push build.json    apply World Protocol commands to your plot
//   pixelmesh status             one-shot: who's online / how many plots
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { joinWorld, ROOM } from "./peer.js";
import { applyCommand, makePlot } from "../shared/protocol.js";
import { nextFreeCell } from "../shared/layout.js";

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

const [cmd, arg] = process.argv.slice(2);
(async () => {
  try {
    if (cmd === "connect") await connect();
    else if (cmd === "push") await push(arg);
    else if (cmd === "status") await status();
    else console.log("commands: connect | push <file.json> | status");
  } catch (e) {
    console.error("failed:", e.message);
    process.exit(1);
  }
})();
