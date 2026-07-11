// Gallery seed peer: creates a few permanent-looking art plots and holds them in the mesh.
// Run alongside your host so the world always has something to show:  pixelworld seed
import { joinWorld } from "./peer.js";
import { makePlot, applyCommand } from "../shared/protocol.js";

const SIG = process.env.PIXELMESH_SIGNALING || "wss://pixel-world.nethsarawmrc.deno.net";
const PEER = "seed_gallery";
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- tiny drawing helpers (128x128) ----
const rect = (x, y, w, h, color) => ({ cmd: "fill_rect", x, y, w, h, color });
function disc(cx, cy, r, color, into) {
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++)
      if (x * x + y * y <= r * r) into.push([cx + x, cy + y, color]);
}
function ring(cx, cy, r, t, color, into) {
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) {
      const d = x * x + y * y;
      if (d <= r * r && d >= (r - t) * (r - t)) into.push([cx + x, cy + y, color]);
    }
}
const px = (arr) => ({ cmd: "set_pixels", pixels: arr });

// ---- designs (each returns an array of World Protocol commands) ----
function car() {
  const p = [];
  disc(38, 96, 14, "#111111", p); disc(38, 96, 6, "#888888", p);   // wheels
  disc(90, 96, 14, "#111111", p); disc(90, 96, 6, "#888888", p);
  return [
    { cmd: "clear" }, { cmd: "set_title", title: "Car" },
    rect(0, 0, 128, 104, "#bfe3ff"),          // sky
    rect(0, 104, 128, 24, "#5a5a5a"),          // road
    rect(0, 100, 128, 4, "#d8b24a"),           // road line
    rect(24, 60, 80, 30, "#e11d48"),           // body
    rect(40, 40, 44, 24, "#e11d48"),           // cabin
    rect(44, 44, 16, 16, "#a9d5ff"),           // window
    rect(64, 44, 16, 16, "#a9d5ff"),
    rect(20, 74, 88, 8, "#9f172f"),            // trim
    rect(102, 66, 6, 8, "#fde047"),            // headlight
    px(p),
  ];
}

function joker() {
  const p = [];
  disc(64, 66, 40, "#f3d9c0", p);              // face
  disc(38, 34, 16, "#16a34a", p);              // hair tufts
  disc(90, 34, 16, "#ef4444", p);
  disc(64, 26, 14, "#3b82f6", p);
  disc(50, 60, 7, "#ffffff", p); disc(50, 60, 3, "#111111", p); // eyes
  disc(78, 60, 7, "#ffffff", p); disc(78, 60, 3, "#111111", p);
  disc(64, 74, 8, "#ef4444", p);               // nose
  disc(44, 78, 6, "#fca5a5", p); disc(84, 78, 6, "#fca5a5", p); // cheeks
  for (let x = 42; x <= 86; x++) {             // big smile arc
    const y = 84 + Math.round(Math.sin((x - 42) / 44 * Math.PI) * 12);
    p.push([x, y, "#b91c1c"], [x, y - 1, "#b91c1c"]);
  }
  return [{ cmd: "clear" }, { cmd: "set_title", title: "Joker" },
          rect(0, 0, 128, 128, "#111827"), px(p)];
}

function gentleman() {
  const p = [];
  disc(64, 74, 34, "#f0cba4", p);              // face
  disc(50, 70, 6, "#ffffff", p); disc(50, 70, 3, "#111111", p); // eyes
  disc(78, 70, 6, "#ffffff", p); disc(78, 70, 3, "#111111", p);
  ring(80, 70, 12, 2, "#111111", p);           // monocle
  for (let x = 44; x <= 84; x++) {             // mustache
    const y = 92 + Math.round(Math.cos((x - 64) / 20) * 4);
    p.push([x, y, "#3a2a17"], [x, y + 1, "#3a2a17"], [x, y + 2, "#3a2a17"]);
  }
  return [
    { cmd: "clear" }, { cmd: "set_title", title: "Sir Pixel" },
    rect(0, 0, 128, 128, "#e7e2d6"),
    rect(30, 6, 68, 30, "#141414"),            // top hat
    rect(20, 34, 88, 8, "#141414"),            // brim
    rect(30, 26, 68, 4, "#7a1f2b"),            // hat band
    px(p),
    rect(40, 108, 48, 20, "#1f2937"),          // suit
    rect(60, 108, 8, 20, "#e5e7eb"),           // tie/collar
  ];
}

const GALLERY = [
  { cell: 0, draw: car },
  { cell: 1, draw: joker },
  { cell: 2, draw: gentleman },
];

async function main() {
  console.log(`seeding gallery via ${SIG} …`);
  const { Y, plots, provider, awareness } = joinWorld(PEER, { signaling: SIG });
  await settle(1800);

  for (const g of GALLERY) {
    let plot = [...plots.values()].find((p) => p.get("owner") === PEER && p.get("cell") === g.cell);
    if (!plot) {
      const plotId = "plot_seed_" + g.cell;
      plot = makePlot(Y, plots, { plotId, owner: PEER, cell: g.cell });
    }
    const cmds = g.draw().map((c) => ({ ...c, plotId: plot.get("plotId") }));
    let ok = 0;
    for (const c of cmds) if (applyCommand(plots, PEER, c)) ok++;
    console.log(`  cell ${g.cell}: ${plot.get("title")} (${ok}/${cmds.length})`);
  }

  console.log(`gallery live · online: ${awareness.getStates().size}. Ctrl+C to stop holding it.`);
  process.on("SIGINT", () => { provider.destroy(); process.exit(0); });
  await new Promise(() => {}); // stay alive holding the gallery plots
}
main().catch((e) => { console.error("seed failed:", e.message); process.exit(1); });
