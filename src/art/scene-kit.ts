import {
  hash,
  put,
  rgb,
  TAU,
  type Pixels,
  type Point,
  type Rgb,
} from "./pixels";

export const GOLD = rgb("#c9a45c");

export function stars(
  px: Pixels,
  phase: number,
  count: number,
  seed: number,
  colours: Rgb[],
  below = 1,
): void {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(hash(seed + i * 3.1) * px.w);
    const y = Math.floor(hash(seed + i * 7.7) * px.h * below);
    const speed = 1 + Math.floor(hash(seed + i * 1.3) * 3);
    const twinkle =
      0.5 + 0.5 * Math.sin(TAU * (phase * speed + hash(seed + i * 5.9)));
    const c = colours[i % colours.length];
    put(px, x, y, c, 0.25 + 0.75 * twinkle);
    if (twinkle > 0.85 && hash(seed + i * 2.2) > 0.6) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        put(px, x + dx, y + dy, c, 0.45 * twinkle);
    }
  }
}

export const WHITE: Rgb = [255, 255, 255];

export const PLUS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// Particles behind the character dim so its sprite reads; the picker's
// thumbnails show no character, so they keep full strength.
export const calm = (px: Pixels, feet: Point, x: number, y: number): number =>
  px.w > 60 && Math.abs(x - feet.x) < 20 && y > feet.y - 55 && y < feet.y
    ? 0.4
    : 1;

export function line(
  px: Pixels,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: Rgb,
  a = 1,
): void {
  const n = Math.max(
    1,
    Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))),
  );
  for (let s = 0; s <= n; s++)
    put(px, x0 + ((x1 - x0) * s) / n, y0 + ((y1 - y0) * s) / n, c, a);
}

export const jagged = (x: number, step: number, seed: number): number => {
  const k = x / step;
  const i = Math.floor(k);
  const lo = hash(seed + i * 1.7);
  return lo + (hash(seed + (i + 1) * 1.7) - lo) * (k - i);
};
