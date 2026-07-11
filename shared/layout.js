// Spiral plot layout — pure math, no deps. Same on every peer, no coordinator.
// Plots never move: new peers claim the lowest free cell, leavers free their cell.
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
  // shift so the center cell sits inside a positive canvas
  return { x: (gx + 8) * PLOT_W, y: (gy + 8) * PLOT_H };
}

// lowest free cell across the live plots map (reuses gaps before extending)
export function nextFreeCell(plots) {
  const used = new Set([...plots.values()].map((p) => p.get("cell")));
  let n = 0;
  while (used.has(n)) n++;
  return n;
}
