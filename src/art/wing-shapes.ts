import {
  put,
  rgb,
  type Pixels,
  type Rgb,
} from "./pixels";

export type Art = { w: number; h: number; paint: (px: Pixels) => void };

export function grid(
  rows: string[],
  inks: Record<string, string>,
  alpha: Record<string, number> = {},
): Art {
  const palette = Object.fromEntries(
    Object.entries(inks).map(([k, hex]) => [k, rgb(hex)]),
  );
  return {
    w: Math.max(...rows.map((row) => row.length)),
    h: rows.length,
    paint: (px) =>
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const c = palette[row[x]];
          if (c) put(px, x, y, c, alpha[row[x]] ?? 1);
        }
      }),
  };
}

export type Hit = { t: number; side: number; half: number };
export type Shape = (x: number, y: number) => Hit | undefined;
export type Xy = [number, number];

export type Shader = (hit: Hit, x: number, y: number) => Rgb;

export function layer(
  px: Pixels,
  shape: Shape,
  outline: Rgb,
  shade: Shader,
  alpha: (hit: Hit, x: number, y: number) => number = () => 1,
): void {
  const hits: (Hit | undefined)[] = [];
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) hits.push(shape(x + 0.5, y + 0.5));
  const filled = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < px.w &&
    y < px.h &&
    hits[y * px.w + x] !== undefined;
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      const hit = hits[y * px.w + x];
      if (hit) put(px, x, y, shade(hit, x, y), alpha(hit, x, y));
      else if (
        filled(x - 1, y) ||
        filled(x + 1, y) ||
        filled(x, y - 1) ||
        filled(x, y + 1)
      )
        put(px, x, y, outline);
    }
}

export function fill(px: Pixels, shape: Shape, shade: Shader): void {
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      const hit = shape(x + 0.5, y + 0.5);
      if (hit) put(px, x, y, shade(hit, x, y));
    }
}

export function blade(
  from: Xy,
  to: Xy,
  width: number,
  base: number,
  widest: number,
): Shape {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  return (x, y) => {
    const ax = x - from[0];
    const ay = y - from[1];
    const t = (ax * dx + ay * dy) / (len * len);
    const side = (ax * dy - ay * dx) / len;
    const half =
      t < widest
        ? (base + (width - base) * (t / widest)) / 2
        : (width / 2) * ((1 - t) / (1 - widest));
    return t >= 0 && t <= 1 && Math.abs(side) < half
      ? { t, side, half }
      : undefined;
  };
}

export function plume(from: Xy, bend: Xy, to: Xy, width: number): Shape {
  const samples = Array.from({ length: 41 }, (_, i) => {
    const t = i / 40;
    const [a, b, c] = [(1 - t) * (1 - t), 2 * (1 - t) * t, t * t];
    const tx = 2 * (1 - t) * (bend[0] - from[0]) + 2 * t * (to[0] - bend[0]);
    const ty = 2 * (1 - t) * (bend[1] - from[1]) + 2 * t * (to[1] - bend[1]);
    const tl = Math.hypot(tx, ty);
    return {
      t,
      x: a * from[0] + b * bend[0] + c * to[0],
      y: a * from[1] + b * bend[1] + c * to[1],
      ux: tx / tl,
      uy: ty / tl,
    };
  });
  return (x, y) => {
    let near = samples[0];
    let best = Infinity;
    for (const s of samples) {
      const d = (x - s.x) ** 2 + (y - s.y) ** 2;
      if (d < best) {
        best = d;
        near = s;
      }
    }
    const half =
      (width / 2) *
      (near.t < 0.35
        ? 0.6 + (0.4 * near.t) / 0.35
        : ((1 - near.t) / 0.65) ** 0.8);
    const side = (x - near.x) * near.uy - (y - near.y) * near.ux;
    return Math.sqrt(best) < half ? { t: near.t, side, half } : undefined;
  };
}

export const blob =
  (cx: number, cy: number, r: number): Shape =>
  (x, y) =>
    Math.hypot(x - cx, y - cy) < r
      ? { t: 0, side: (cx - x + cy - y) * 0.7, half: r }
      : undefined;

export const minus =
  (shape: Shape, ...cuts: Shape[]): Shape =>
  (x, y) =>
    cuts.some((cut) => cut(x, y)) ? undefined : shape(x, y);

export function capsule(from: Xy, to: Xy, r: number): Shape {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  return (x, y) => {
    const ax = x - from[0];
    const ay = y - from[1];
    const t = Math.max(0, Math.min(1, (ax * dx + ay * dy) / (len * len)));
    return Math.hypot(ax - t * dx, ay - t * dy) < r
      ? { t, side: (ax * dy - ay * dx) / len, half: r }
      : undefined;
  };
}

/** t is the distance to the nearest edge; side is how much that edge faces the light from the top left. */
export function poly(points: Xy[]): Shape {
  return (x, y) => {
    let inside = false;
    let edge = Infinity;
    let side = 0;
    points.forEach(([x1, y1], i) => {
      const [x0, y0] = points[(i + points.length - 1) % points.length];
      if (y1 > y !== y0 > y && x < ((x0 - x1) * (y - y1)) / (y0 - y1) + x1)
        inside = !inside;
      const dx = x0 - x1;
      const dy = y0 - y1;
      const k = Math.max(
        0,
        Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)),
      );
      const ex = x - x1 - k * dx;
      const ey = y - y1 - k * dy;
      const d = Math.hypot(ex, ey);
      if (d < edge) {
        edge = d;
        side = d ? (ex * 0.6 + ey * 0.8) / d : 0;
      }
    });
    return inside ? { t: edge, side, half: 1 } : undefined;
  };
}

export function gear(
  c: Xy,
  body: number,
  tooth: number,
  teeth: number,
  hole: number,
): Shape {
  return (x, y) => {
    const dx = x - c[0];
    const dy = y - c[1];
    const r = Math.hypot(dx, dy);
    const rim = Math.cos(Math.atan2(dy, dx) * teeth) > 0.1 ? tooth : body;
    return r < rim && r >= hole
      ? { t: r / body, side: -(dx * 0.6 + dy * 0.8) / (r || 1), half: body }
      : undefined;
  };
}

export type Feather = [from: Xy, to: Xy, width: number, base: number, widest: number];

/** 1 when a shape's positive side, running from `from` to `to`, faces the light from the top left; else -1. */
export const litSide = (from: Xy, to: Xy): number =>
  Math.sign((to[0] - from[0]) * 0.8 - (to[1] - from[1]) * 0.6) || 1;

export function feathers(
  px: Pixels,
  list: Feather[],
  outline: Rgb,
  shade: Shader,
): void {
  for (const [from, to, width, base, widest] of list) {
    const lit = litSide(from, to);
    layer(px, blade(from, to, width, base, widest), outline, (hit, x, y) =>
      shade({ ...hit, side: hit.side * lit }, x, y),
    );
  }
}

export const tones =
  (palette: Rgb[], lit = 0.25, shadow = 0.4): Shader =>
  ({ side, half }) =>
    palette[side > half * lit ? 0 : side < -half * shadow ? 2 : 1];
