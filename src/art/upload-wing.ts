import type { Pixels } from "./pixels";

// A flat background is a border colour this close to the corners' colour.
const BACKGROUND_TOLERANCE = 40;
const OPAQUE = 128;

const at = (px: Pixels, x: number, y: number) => (y * px.w + x) * 4;

const distance = (d: Uint8ClampedArray, i: number, c: number[]) =>
  Math.hypot(d[i] - c[0], d[i + 1] - c[1], d[i + 2] - c[2]);

/**
 * Clears a flat background reached from the image's border, the way a wing
 * drawn on white or black arrives; an image that is already cut out, or whose
 * corners differ, is left as it is.
 */
export function clearBackground(px: Pixels): void {
  const { w, h, data } = px;
  const corners = [
    at(px, 0, 0),
    at(px, w - 1, 0),
    at(px, 0, h - 1),
    at(px, w - 1, h - 1),
  ];
  if (corners.some((i) => data[i + 3] < OPAQUE)) return;
  const colour = [0, 1, 2].map(
    (k) => corners.reduce((sum, i) => sum + data[i + k], 0) / corners.length,
  );
  if (corners.some((i) => distance(data, i, colour) > BACKGROUND_TOLERANCE))
    return;
  const seen = new Uint8Array(w * h);
  const queue: number[] = [];
  const visit = (x: number, y: number) => {
    const p = y * w + x;
    if (seen[p]) return;
    seen[p] = 1;
    if (distance(data, p * 4, colour) <= BACKGROUND_TOLERANCE) queue.push(p);
  };
  for (let x = 0; x < w; x++) (visit(x, 0), visit(x, h - 1));
  for (let y = 0; y < h; y++) (visit(0, y), visit(w - 1, y));
  while (queue.length) {
    const p = queue.pop()!;
    data[p * 4 + 3] = 0;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) visit(x - 1, y);
    if (x < w - 1) visit(x + 1, y);
    if (y > 0) visit(x, y - 1);
    if (y < h - 1) visit(x, y + 1);
  }
}

/** The box around the image's opaque pixels, or null when it has none. */
export function opaqueBox(
  px: Pixels,
): { x: number; y: number; w: number; h: number } | null {
  let [left, top, right, bottom] = [px.w, px.h, -1, -1];
  for (let y = 0; y < px.h; y++) {
    for (let x = 0; x < px.w; x++) {
      if (px.data[at(px, x, y) + 3] < OPAQUE) continue;
      [left, top, right, bottom] = [
        Math.min(left, x),
        Math.min(top, y),
        Math.max(right, x),
        Math.max(bottom, y),
      ];
    }
  }
  return right < 0
    ? null
    : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

/** Makes every pixel fully opaque or fully clear, so a resampled wing keeps a crisp pixel edge. */
export function hardenAlpha(px: Pixels): void {
  for (let i = 3; i < px.data.length; i += 4)
    px.data[i] = px.data[i] >= OPAQUE ? 255 : 0;
}

/** Mirrors the image left to right. */
export function mirror(px: Pixels): void {
  const { w, h, data } = px;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w >> 1; x++) {
      const a = at(px, x, y);
      const b = at(px, w - 1 - x, y);
      for (let k = 0; k < 4; k++)
        [data[a + k], data[b + k]] = [data[b + k], data[a + k]];
    }
  }
}

/** The size that fits w x h inside max, keeping its shape and never growing below 1 px. */
export function fitInside(
  w: number,
  h: number,
  max: { w: number; h: number },
): { w: number; h: number } {
  const s = Math.min(max.w / w, max.h / h);
  return {
    w: Math.max(1, Math.round(w * s)),
    h: Math.max(1, Math.round(h * s)),
  };
}
