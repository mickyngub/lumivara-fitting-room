import type { Sheet } from "./types";

/** A frame's head in its cell: centre column, top row, and width across the top. */
export type Head = { x: number; top: number; w: number };

// Half the width of the column band searched for the head, around the torso.
const REACH = 10;
// Rows under the top of the head measured for its centre and width.
const CROWN_ROWS = 8;
const MIN_PIXELS = 2;
// A frame whose top jumps further than this from its idle frame is holding
// something over its head, so it keeps the idle frame's head.
const MAX_JUMP = 6;

/**
 * Finds the head in every frame of a sheet: the first row with pixels in a
 * band around the torso, then the span of the rows under it.
 */
export function findHeads(
  data: Uint8ClampedArray,
  width: number,
  sheet: Omit<Sheet, "png">,
  torsoCentre: (direction: string) => number,
): Head[][] {
  const { cell, rows, baseline } = sheet;
  const opaque = (x: number, y: number) => data[(y * width + x) * 4 + 3] > 0;
  const measure = (r: number, i: number, centre: number): Head | null => {
    const ox = i * cell.w;
    const oy = r * cell.h;
    const from = Math.max(0, Math.round(centre - REACH));
    const to = Math.min(cell.w - 1, Math.round(centre + REACH));
    for (let y = 0; y < baseline; y++) {
      let count = 0;
      for (let x = from; x <= to; x++) if (opaque(ox + x, oy + y)) count++;
      if (count < MIN_PIXELS) continue;
      let min = cell.w;
      let max = -1;
      for (let yy = y; yy < Math.min(baseline, y + CROWN_ROWS); yy++) {
        for (let x = from; x <= to; x++) {
          if (!opaque(ox + x, oy + yy)) continue;
          min = Math.min(min, x);
          max = Math.max(max, x);
        }
      }
      return { x: (min + max + 1) / 2, top: y, w: max - min + 1 };
    }
    return null;
  };
  const idle = new Map<string, Head>();
  rows.forEach((row, r) => {
    const head =
      row.anim === "idle" ? measure(r, 0, torsoCentre(row.dir)) : null;
    if (head) idle.set(row.dir, head);
  });
  return rows.map((row, r) =>
    Array.from({ length: row.count }, (_, i) => {
      const still = idle.get(row.dir);
      const head = measure(r, i, torsoCentre(row.dir));
      if (!head) return still ?? { x: cell.w / 2, top: 0, w: 0 };
      return still && Math.abs(head.top - still.top) > MAX_JUMP ? still : head;
    }),
  );
}
