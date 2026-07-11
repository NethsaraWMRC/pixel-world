// World Protocol — validate + apply commands onto Yjs plot types.
// No Yjs import: operates via the Y.Map interface passed in, so it works unchanged
// in the browser (esm CDN) and in Node (node_modules). Declarative only — never runs code.
//
// Pixel storage is a COMPACT PACKED GRID, not per-pixel CRDT entries:
//   plot.cells = base64 of a Uint8Array(w*h) of palette indices (0 = empty)
//   plot.pal   = array of "#rrggbb" colors; grid value v>0 -> pal[v-1]
// Plots are single-writer (only the owner draws), so we don't need per-pixel merge.
// This keeps the sync payload tiny (~22KB for a full 128x128) instead of ~570KB.

// base64 <-> Uint8Array (btoa/atob are global in both browsers and Node 20+)
export function packCells(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}
export function unpackCells(b64, len) {
  const u8 = new Uint8Array(len);
  if (!b64) return u8;
  const s = atob(b64);
  for (let i = 0; i < len && i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

// makePlot: create a plot as a Y.Map inside `plots`. Y is passed in so this file
// stays import-free. Returns the new plot Y.Map.
export function makePlot(Y, plots, { plotId, owner, cell, w = 128, h = 128 }) {
  const plot = new Y.Map();
  plot.set("plotId", plotId);
  plot.set("owner", owner);
  plot.set("cell", cell);
  plot.set("w", w);
  plot.set("h", h);
  plot.set("title", "");
  plot.set("cells", "");      // empty grid
  plot.set("pal", []);        // palette
  plot.set("updatedAt", Date.now());
  plots.set(plotId, plot);
  return plot;
}

export function applyCommand(plots, myPeerId, cmd) {
  const plot = plots.get(cmd.plotId);
  if (!plot) return false;
  if (plot.get("owner") !== myPeerId) return false;        // ownership: only your plot
  const w = plot.get("w"), h = plot.get("h");

  let pal = (plot.get("pal") || []).slice();
  let grid = unpackCells(plot.get("cells") || "", w * h);
  const palIndex = (color) => {
    let i = pal.indexOf(color);
    if (i < 0) { pal.push(color); i = pal.length - 1; }
    return i + 1;                                            // 1-based; 0 = empty
  };
  const put = (x, y, color) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;         // clamp to box
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;           // validate hex
    grid[y * w + x] = palIndex(color);
  };

  switch (cmd.cmd) {
    case "set_pixels":
      if (!Array.isArray(cmd.pixels)) return false;
      for (const [x, y, c] of cmd.pixels) put(x | 0, y | 0, c);
      break;
    case "fill_rect":
      for (let y = cmd.y | 0; y < (cmd.y | 0) + (cmd.h | 0); y++)
        for (let x = cmd.x | 0; x < (cmd.x | 0) + (cmd.w | 0); x++) put(x, y, cmd.color);
      break;
    case "clear":
      grid = new Uint8Array(w * h);
      pal = [];
      break;
    case "set_title":
      plot.set("title", String(cmd.title).slice(0, 40));
      plot.set("updatedAt", Date.now());
      return true;                                          // no grid change
    default:
      return false;
  }
  plot.set("cells", packCells(grid));
  plot.set("pal", pal);
  plot.set("updatedAt", Date.now());
  return true;
}
