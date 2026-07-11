// World Protocol — validate + apply commands onto Yjs plot types.
// No Yjs import: operates via the Y.Map interface passed in, so it works unchanged
// in the browser (esm CDN) and in Node (node_modules). Declarative only — never runs code.

// makePlot: create a plot as a Y.Map (with nested Y.Map pixels) inside `plots`.
// Y is passed in so this file stays import-free. Returns the new plot Y.Map.
export function makePlot(Y, plots, { plotId, owner, cell, w = 32, h = 32 }) {
  const plot = new Y.Map();
  plot.set("plotId", plotId);
  plot.set("owner", owner);
  plot.set("cell", cell);
  plot.set("w", w);
  plot.set("h", h);
  plot.set("title", "");
  plot.set("pixels", new Y.Map());        // "x,y" -> "#rrggbb"
  plot.set("updatedAt", Date.now());
  plots.set(plotId, plot);
  return plot;
}

export function applyCommand(plots, myPeerId, cmd) {
  const plot = plots.get(cmd.plotId);
  if (!plot) return false;
  if (plot.get("owner") !== myPeerId) return false;        // ownership: only your plot
  const w = plot.get("w"), h = plot.get("h");
  const px = plot.get("pixels");

  const put = (x, y, color) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;        // clamp to box
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;          // validate hex
    px.set(`${x},${y}`, color);
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
