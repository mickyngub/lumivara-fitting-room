export type Rgb = [number, number, number];
export type Pixels = {
  w: number;
  h: number;
  data: Uint8ClampedArray<ArrayBuffer>;
};
export type Point = { x: number; y: number };

export const TAU = Math.PI * 2;

export const pixels = (w: number, h: number): Pixels => ({
  w,
  h,
  data: new Uint8ClampedArray(w * h * 4),
});

export const rgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Blends c over the pixel at (x, y) with opacity a; coordinates are rounded and clipped. */
export function put(px: Pixels, x: number, y: number, c: Rgb, a = 1): void {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= px.w || iy >= px.h || a <= 0) return;
  const i = (iy * px.w + ix) * 4;
  const d = px.data;
  if (a >= 1 || d[i + 3] === 0) {
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    d[i + 3] = a >= 1 ? 255 : Math.max(d[i + 3], Math.round(a * 255));
    return;
  }
  d[i] += (c[0] - d[i]) * a;
  d[i + 1] += (c[1] - d[i + 1]) * a;
  d[i + 2] += (c[2] - d[i + 2]) * a;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(
  (v) => (v + 0.5) / 16,
);

/** Ordered dithering threshold for a pixel, so smooth values land on a few flat colours like hand-made pixel art. */
export const bayer = (x: number, y: number): number =>
  BAYER[(y & 3) * 4 + (x & 3)];

export const quantize = (
  v: number,
  levels: number,
  x: number,
  y: number,
): number =>
  Math.max(0, Math.min(levels, Math.floor(v * levels + bayer(x, y)))) / levels;

export const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export const wrap = (v: number): number => v - Math.floor(v);

/** Fills every pixel with a dithered vertical blend through the given stops. */
export function verticalGradient(px: Pixels, stops: Rgb[], levels = 10): void {
  for (let y = 0; y < px.h; y++) {
    for (let x = 0; x < px.w; x++) {
      const t = quantize(y / (px.h - 1), levels, x, y) * (stops.length - 1);
      const i = Math.min(stops.length - 2, Math.floor(t));
      put(px, x, y, mix(stops[i], stops[i + 1], t - i));
    }
  }
}

/** A one-pixel ellipse outline, the stage's floor ring drawn on the pixel grid. */
export function ring(
  px: Pixels,
  c: Point,
  rx: number,
  ry: number,
  colour: Rgb,
  a: number,
): void {
  const seen = new Set<number>();
  const steps = Math.ceil(TAU * Math.max(rx, ry) * 2);
  for (let s = 0; s < steps; s++) {
    const t = (s / steps) * TAU;
    const x = Math.round(c.x + Math.cos(t) * rx);
    const y = Math.round(c.y + Math.sin(t) * ry);
    const key = y * px.w + x;
    if (seen.has(key)) continue;
    seen.add(key);
    put(px, x, y, colour, a);
  }
}

/**
 * Stamps a character-grid pattern: '.' is transparent and every other
 * character is looked up in the palette. flipX mirrors it.
 */
export function stamp(
  px: Pixels,
  pattern: string[],
  x: number,
  y: number,
  palette: Record<string, Rgb>,
  flipX = false,
): void {
  pattern.forEach((row, r) => {
    for (let k = 0; k < row.length; k++) {
      const ch = row[flipX ? row.length - 1 - k : k];
      if (ch !== "." && palette[ch]) put(px, x + k, y + r, palette[ch]);
    }
  });
}
