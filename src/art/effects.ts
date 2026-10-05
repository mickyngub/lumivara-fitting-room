import {
  bayer,
  hash,
  mix,
  put,
  quantize,
  rgb,
  ring,
  TAU,
  verticalGradient,
  wrap,
  type Pixels,
  type Point,
  type Rgb,
} from "./pixels";

/**
 * An animated background painted on the game's pixel grid. phase runs 0 to 1
 * over one card loop, and every motion is periodic in it, so a card's frames
 * loop without a seam.
 */
export type Effect = {
  id: string;
  name: string;
  plate: string;
  paint: (px: Pixels, feet: Point, phase: number) => void;
};

const GOLD = rgb("#c9a45c");

function stars(
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

const aurora: Effect = {
  id: "aurora",
  name: "ออโรร่า",
  plate: "#0c1638",
  paint(px, feet, phase) {
    verticalGradient(px, [rgb("#060a22"), rgb("#0f1b47"), rgb("#16285e")]);
    stars(
      px,
      phase,
      Math.round((px.w * px.h) / 260),
      11,
      [rgb("#ffffff"), rgb("#bfe9ff")],
      0.7,
    );
    const bands: [Rgb, number, number, number][] = [
      [rgb("#3cf2c5"), 0.3, 1, 5],
      [rgb("#ffd36b"), 0.44, -1, 4],
    ];
    for (const [colour, base, dir, amp] of bands) {
      for (let x = 0; x < px.w; x++) {
        const u = x / px.w;
        const crest =
          px.h * base +
          amp * Math.sin(TAU * (u * 1.6 + dir * phase)) +
          2 * Math.sin(TAU * (u * 3.4 - dir * phase * 2));
        const glow = 0.55 + 0.45 * Math.sin(TAU * (u * 2.2 + phase));
        for (let y = 0; y < px.h; y++) {
          const d = y - crest;
          const v = (d < 0 ? Math.exp(d / 9) : Math.exp((-d * d) / 6)) * glow;
          const q = quantize(v * 0.9, 4, x, y);
          if (q > 0)
            put(
              px,
              x,
              y,
              mix(colour, [255, 255, 255], q > 0.7 ? 0.35 : 0),
              q * 0.85,
            );
        }
      }
    }
    ring(px, feet, 24, 7, GOLD, 0.6);
  },
};

const starfield: Effect = {
  id: "starfield",
  name: "ห้วงดาว",
  plate: "#0a0a24",
  paint(px, feet, phase) {
    verticalGradient(px, [rgb("#04051a"), rgb("#0d0a2e"), rgb("#1d0f3f")]);
    for (let y = 0; y < px.h; y++) {
      for (let x = 0; x < px.w; x++) {
        const u = x / px.w;
        const v = y / px.h;
        const n =
          0.5 +
          0.25 * Math.sin(TAU * (u * 1.3 + v * 0.7 + phase)) +
          0.25 * Math.sin(TAU * (u * 0.6 - v * 1.5 - phase));
        const band = Math.exp(-((v - 0.35 - 0.25 * u) ** 2) / 0.02) * n;
        const q = quantize(band * 0.7, 3, x, y);
        if (q > 0)
          put(px, x, y, mix(rgb("#5a2a8c"), rgb("#c25aa8"), q), q * 0.6);
      }
    }
    stars(
      px,
      phase,
      Math.round((px.w * px.h) / 160),
      23,
      [rgb("#ffffff"), rgb("#9fd8ff"), rgb("#ffe7a3")],
      0.85,
    );
    const sx = -12 + phase * (px.w + 24);
    const sy = px.h * 0.12 + phase * px.h * 0.3;
    for (let k = 0; k < 7; k++)
      put(px, sx - k, sy - k * 0.45, [255, 255, 255], 1 - k / 7);
    ring(px, feet, 24, 7, GOLD, 0.6);
  },
};

const magic: Effect = {
  id: "magic",
  name: "วงเวท",
  plate: "#1c0a33",
  paint(px, feet, phase) {
    for (let y = 0; y < px.h; y++) {
      for (let x = 0; x < px.w; x++) {
        const d = Math.hypot((x - feet.x) / px.w, ((y - feet.y) / px.h) * 1.4);
        put(
          px,
          x,
          y,
          mix(
            rgb("#3a1466"),
            rgb("#0d0420"),
            quantize(Math.min(1, d * 1.6), 8, x, y),
          ),
        );
      }
    }
    const pulse = 0.75 + 0.25 * Math.sin(TAU * phase);
    for (let y = 0; y < feet.y; y++) {
      for (let x = Math.round(feet.x - 14); x <= feet.x + 14; x++) {
        const v =
          Math.exp(-((x - feet.x) ** 2) / 70) * (y / feet.y) * 0.35 * pulse;
        const q = quantize(v, 3, x, y);
        if (q > 0) put(px, x, y, rgb("#b98cff"), q);
      }
    }
    const violet = rgb("#b98cff");
    const bright = rgb("#f2e3ff");
    ring(px, feet, 30, 9, violet, 0.85 * pulse);
    ring(px, feet, 22, 6.5, violet, 0.6 * pulse);
    for (let i = 0; i < 12; i++) {
      const a = TAU * (i / 12 + phase);
      put(px, feet.x + Math.cos(a) * 26, feet.y + Math.sin(a) * 7.8, bright, 1);
    }
    for (let i = 0; i < 16; i++) {
      const p = wrap(phase + hash(i * 4.7));
      const x = feet.x + (hash(i * 9.1) - 0.5) * 56;
      const y = feet.y - p * px.h * 0.85;
      put(
        px,
        x,
        y,
        i % 3 ? rgb("#f5d0ff") : rgb("#9ff3ff"),
        Math.sin(Math.PI * p),
      );
    }
  },
};

const embers: Effect = {
  id: "embers",
  name: "ประกายไฟ",
  plate: "#2a0c07",
  paint(px, feet, phase) {
    verticalGradient(px, [rgb("#150504"), rgb("#2e0b06"), rgb("#5a1a0a")]);
    for (let y = Math.floor(px.h * 0.55); y < px.h; y++) {
      for (let x = 0; x < px.w; x++) {
        const heat =
          ((y - px.h * 0.55) / (px.h * 0.45)) *
          (0.75 + 0.25 * Math.sin(TAU * ((x / px.w) * 2 + phase)));
        const q = quantize(heat * 0.6, 3, x, y);
        if (q > 0) put(px, x, y, rgb("#b8380e"), q * 0.7);
      }
    }
    const count = Math.round((px.w * px.h) / 120);
    for (let i = 0; i < count; i++) {
      const p = wrap(phase + hash(i * 3.3));
      const x =
        hash(i * 8.1) * px.w +
        2.5 * Math.sin(TAU * (phase * 2 + hash(i * 1.7)));
      const y = px.h + 2 - p * (px.h + 6);
      const c = mix(rgb("#ffd166"), rgb("#ff4d1a"), p);
      const flicker = 0.75 + 0.25 * Math.sin(TAU * (phase * 3 + hash(i * 4.4)));
      put(px, x, y, c, (1 - p * 0.6) * flicker);
      if (hash(i * 6.6) > 0.6) put(px, x, y + 1, c, 0.55 * (1 - p));
    }
    ring(px, feet, 24, 7, rgb("#ffb35c"), 0.55);
  },
};

const sakura: Effect = {
  id: "sakura",
  name: "ซากุระ",
  plate: "#3a1f4f",
  paint(px, feet, phase) {
    verticalGradient(px, [rgb("#22143a"), rgb("#55295e"), rgb("#b4627f")]);
    const moon = { x: px.w * 0.8, y: px.h * 0.2 };
    for (let y = -6; y <= 6; y++) {
      for (let x = -6; x <= 6; x++) {
        const d = Math.hypot(x, y);
        if (d <= 5)
          put(px, moon.x + x, moon.y + y, rgb("#ffe9f0"), d > 4 ? 0.7 : 1);
      }
    }
    const petals = [rgb("#ffd1dc"), rgb("#ff9fb8"), rgb("#ffe4ec")];
    const count = Math.round((px.w * px.h) / 330);
    for (let i = 0; i < count; i++) {
      const p = wrap(phase + hash(i * 2.9));
      const x = wrap(hash(i * 7.3) + p * 0.35) * (px.w + 8) - 4;
      const y = -4 + p * (px.h + 8);
      const c = petals[i % petals.length];
      put(px, x, y, c);
      const flip = Math.sin(TAU * (p * 3 + hash(i)));
      put(px, x + (flip > 0 ? 1 : 0), y + (flip > 0 ? 0 : 1), c, 0.8);
    }
    ring(px, feet, 24, 7, rgb("#ffe9a6"), 0.6);
  },
};

const WHITE: Rgb = [255, 255, 255];

const PLUS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// Particles behind the character dim so its sprite reads; the picker's
// thumbnails show no character, so they keep full strength.
const calm = (px: Pixels, feet: Point, x: number, y: number): number =>
  px.w > 60 && Math.abs(x - feet.x) < 20 && y > feet.y - 55 && y < feet.y
    ? 0.4
    : 1;

function line(
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

const jagged = (x: number, step: number, seed: number): number => {
  const k = x / step;
  const i = Math.floor(k);
  const lo = hash(seed + i * 1.7);
  return lo + (hash(seed + (i + 1) * 1.7) - lo) * (k - i);
};

const snowfall: Effect = {
  id: "snowfall",
  name: "หิมะ",
  plate: "#1b3354",
  paint(px, feet, phase) {
    phase = wrap(phase);
    verticalGradient(px, [rgb("#0b1a33"), rgb("#23426b"), rgb("#6f95c0")]);
    const rock = rgb("#183052");
    const cap = rgb("#4d6f9e");
    const drift = rgb("#a9c3e0");
    const hollow = rgb("#86a5cc");
    const bank = rgb("#dfeaf7");
    const step = Math.max(2, Math.round(px.w / 9));
    for (let x = 0; x < px.w; x++) {
      const u = x / px.w;
      const ridge = px.h * (0.34 + 0.16 * jagged(x, step, 3));
      const back = px.h * (0.6 + 0.03 * Math.sin(TAU * (u * 1.5 + 0.15)));
      const front =
        px.h * (0.8 - 0.1 * Math.cos(TAU * u) + 0.02 * Math.sin(TAU * u * 3));
      for (let y = Math.floor(ridge); y < px.h; y++) {
        if (y >= front)
          put(
            px,
            x,
            y,
            mix(
              bank,
              drift,
              quantize((y - front) / (px.h * 0.3), 3, x, y) * 0.7,
            ),
          );
        else if (y >= back)
          put(
            px,
            x,
            y,
            mix(drift, hollow, quantize((y - back) / (front - back), 3, x, y)),
          );
        else
          put(
            px,
            x,
            y,
            quantize((px.h * 0.43 - y) / 3 + 0.5, 1, x, y) > 0 ? cap : rock,
          );
      }
    }
    const count = Math.round((px.w * px.h) / 120);
    for (let i = 0; i < count; i++) {
      const big = hash(i * 4.3) > 0.72;
      const p = wrap(phase * (big ? 2 : 1) + hash(i * 2.7));
      const x =
        hash(i * 6.1) * px.w +
        (big ? 2 : 1) * Math.sin(TAU * (phase * 2 + hash(i * 3.9)));
      const y = -2 + p * (px.h + 4);
      const a = (big ? 0.95 : 0.6) * calm(px, feet, x, y);
      put(px, x, y, WHITE, a);
      if (big)
        for (const [dx, dy] of PLUS) put(px, x + dx, y + dy, WHITE, a * 0.45);
    }
    ring(px, feet, 24, 7, rgb("#cfe6ff"), 0.6);
  },
};

const lava: Effect = {
  id: "lava",
  name: "ลาวา",
  plate: "#2b0f0a",
  paint(px, feet, phase) {
    phase = wrap(phase);
    verticalGradient(px, [rgb("#120808"), rgb("#2a0f0a"), rgb("#3b1a10")]);
    const pulse = 0.8 + 0.2 * Math.sin(TAU * phase);
    const rock = rgb("#1a1210");
    const heat = rgb("#ff6a1a");
    const crust = rgb("#3a1a10");
    const scorch = rgb("#8a2a0c");
    const molten = [
      rgb("#c4320c"),
      rgb("#ff7a1a"),
      rgb("#ffb03a"),
      rgb("#ffd166"),
    ];
    const step = Math.max(2, Math.round(px.w / 20));
    for (let x = 0; x < px.w; x++) {
      const u = x / px.w;
      const cliff =
        px.h * (0.06 + 2.2 * Math.min(u, 1 - u) + 0.3 * jagged(x, step, 7));
      const top = Math.min(
        cliff,
        px.h * (0.62 + 0.015 * Math.sin(TAU * u * 3)),
      );
      const pool = px.h * (0.8 + 0.02 * Math.sin(TAU * (u * 2.5 - phase)));
      for (let y = Math.max(0, Math.floor(top)); y < px.h; y++) {
        if (y >= pool) {
          const d = (y - pool) / (px.h - pool + 1);
          const lump =
            Math.sin(TAU * (u * 5 - phase * 2)) *
            Math.sin(TAU * (d * 1.8 + u * 2.5 - phase));
          const surge = 0.5 + 0.5 * Math.sin(TAU * (u * 2.5 - phase + d));
          const q =
            y - pool < 1
              ? 1
              : quantize((1 - d) * 0.55 + surge * 0.45 * pulse, 3, x, y);
          put(
            px,
            x,
            y,
            lump > 0.55
              ? crust
              : lump > 0.4
                ? scorch
                : molten[Math.round(q * 3)],
          );
        } else {
          put(px, x, y, rock);
          const g = quantize(
            Math.exp((y - pool) / (px.h * 0.05)) * pulse * 0.9,
            2,
            x,
            y,
          );
          if (g > 0) put(px, x, y, heat, g * 0.45);
        }
      }
    }
    const ash = [rgb("#8a7f7a"), rgb("#5d5452"), rgb("#b0a49c")];
    const count = Math.round((px.w * px.h) / 200);
    for (let i = 0; i < count; i++) {
      const p = wrap(phase + hash(i * 3.7));
      const x =
        hash(i * 9.3) * px.w + 3 * Math.sin(TAU * (phase + hash(i * 1.9)));
      const y = px.h * 0.82 - p * px.h * 0.9;
      const a = 0.8 * Math.sin(Math.PI * p) * calm(px, feet, x, y);
      put(px, x, y, ash[i % 3], a);
      if (i % 3 === 0) put(px, x + 1, y, ash[i % 3], a * 0.6);
    }
    ring(px, feet, 24, 7, rgb("#ffb35c"), 0.55);
  },
};

const SPIRES = [
  [0.05, 0.8, 0.68, 0.075],
  [0.95, 0.82, 0.72, 0.08],
  [0.17, 0.76, 0.42, 0.05],
  [0.84, 0.77, 0.46, 0.055],
  [0.26, 0.73, 0.2, 0.03],
  [0.74, 0.73, 0.17, 0.03],
  [0.1, 1.04, 0.22, 0.045],
  [0.9, 1.04, 0.18, 0.04],
  [0.37, 1.04, 0.09, 0.025],
  [0.63, 1.04, 0.11, 0.03],
];

const crystal: Effect = {
  id: "crystal",
  name: "คริสตัล",
  plate: "#20124a",
  paint(px, feet, phase) {
    phase = wrap(phase);
    verticalGradient(px, [rgb("#0e0a24"), rgb("#241452"), rgb("#3a1d6e")]);
    stars(
      px,
      phase,
      Math.round((px.w * px.h) / 320),
      31,
      [rgb("#9ff3ff"), rgb("#d9b8ff")],
      0.65,
    );
    const floor = rgb("#170d3a");
    const shine = rgb("#2b1866");
    for (let x = 0; x < px.w; x++) {
      const top = px.h * (0.6 + 0.015 * Math.sin(TAU * (x / px.w) * 3));
      for (let y = Math.floor(top); y < px.h; y++)
        put(
          px,
          x,
          y,
          mix(shine, floor, quantize((y - top) / (px.h * 0.12), 2, x, y)),
        );
    }
    const faces = [
      rgb("#e8d9ff"),
      rgb("#b98cff"),
      rgb("#6a3fc4"),
      rgb("#3d2287"),
    ];
    const sweep = -4 + phase * (px.w + px.h * 0.5 + 8);
    const band = Math.max(1, px.w * 0.03);
    for (const [sx, sb, sh, sw] of SPIRES) {
      const cx = sx * px.w;
      const base = sb * px.h;
      const tip = base - sh * px.h;
      const hw = Math.max(1, sw * px.w);
      const shoulder = tip + hw * 1.8;
      for (
        let y = Math.max(0, Math.floor(tip));
        y < Math.min(px.h, base);
        y++
      ) {
        const half = y < shoulder ? (hw * (y - tip)) / (shoulder - tip) : hw;
        const left = Math.round(cx - half);
        const right = Math.round(cx + half);
        for (let x = left; x <= right; x++) {
          const face =
            x === left
              ? 0
              : x === right && right > left + 1
                ? 3
                : x < cx
                  ? 1
                  : 2;
          const lit = Math.abs(x + (px.h - y) * 0.5 - sweep) < band;
          put(px, x, y, lit ? mix(faces[face], WHITE, 0.6) : faces[face]);
        }
      }
    }
    SPIRES.forEach(([sx, sb, sh, sw], j) => {
      const t =
        0.5 + 0.5 * Math.sin(TAU * (phase * (1 + (j % 3)) + hash(j * 5.5)));
      if (t < 0.7) return;
      const x = sx * px.w + (hash(j * 4.1) - 0.5) * sw * px.w;
      const y = (sb - sh * (0.35 + 0.4 * hash(j * 2.3))) * px.h;
      const a = (t - 0.7) / 0.3;
      put(px, x, y, WHITE, a);
      for (const [dx, dy] of PLUS)
        put(px, x + dx, y + dy, rgb("#9ff3ff"), a * 0.7);
    });
    ring(px, feet, 24, 7, rgb("#d9c2ff"), 0.6);
  },
};

const storm: Effect = {
  id: "storm",
  name: "พายุ",
  plate: "#1a2232",
  paint(px, feet, phase) {
    phase = wrap(phase);
    const flash =
      phase < 0.6 || phase >= 0.7
        ? 0
        : phase < 0.63
          ? 1
          : phase < 0.645
            ? 0.35
            : (0.8 * (0.7 - phase)) / 0.055;
    const lit = rgb("#7d93b5");
    verticalGradient(
      px,
      [rgb("#0d121c"), rgb("#1c2636"), rgb("#2b3a4f")].map((c) =>
        mix(c, lit, flash * 0.55),
      ),
    );
    const cloud = mix(rgb("#2b3548"), rgb("#5a6d8c"), flash);
    for (let y = 0; y < px.h * 0.5; y++) {
      const v = y / px.h;
      const upper = Math.exp(-((v - 0.1) ** 2) / 0.008);
      const lower = 0.8 * Math.exp(-((v - 0.32) ** 2) / 0.004);
      for (let x = 0; x < px.w; x++) {
        const u = x / px.w;
        const n =
          0.6 +
          0.25 * Math.sin(TAU * (u * 2 + phase)) +
          0.15 * Math.sin(TAU * (u * 5 - phase * 2 + v * 6));
        const d =
          upper * n +
          lower * (0.5 + 0.5 * Math.sin(TAU * (u * 3 - phase + v * 2)));
        const q = quantize(d, 3, x, y);
        if (q > 0) put(px, x, y, cloud, q * 0.8);
      }
    }
    if (flash > 0.3) {
      const bolt = rgb("#f4f8ff");
      const halo = rgb("#9fb8d8");
      let bx = px.w * (0.82 + 0.06 * (hash(41) - 0.5));
      let by = 0;
      for (let s = 1; s <= 7; s++) {
        const nx = Math.min(
          px.w * 0.97,
          Math.max(px.w * 0.7, bx + (hash(s * 3.7 + 1) - 0.5) * px.w * 0.14),
        );
        const ny = (s / 7) * px.h * 0.62;
        line(px, bx - 1, by, nx - 1, ny, halo, 0.45 * flash);
        line(px, bx + 1, by, nx + 1, ny, halo, 0.45 * flash);
        line(px, bx, by, nx, ny, bolt);
        if (s === 3)
          line(px, nx, ny, nx + px.w * 0.06, ny + px.h * 0.1, bolt, 0.8);
        bx = nx;
        by = ny;
      }
    }
    const far = mix(rgb("#141c2a"), rgb("#3b4b66"), flash * 0.6);
    const hill = mix(rgb("#0a0e16"), rgb("#2c3a52"), flash * 0.6);
    const ground: number[] = [];
    for (let x = 0; x < px.w; x++) {
      const u = x / px.w;
      const back = px.h * (0.56 + 0.04 * Math.sin(TAU * (u * 2 + 0.3)));
      ground[x] =
        px.h *
        (0.64 +
          0.03 * Math.sin(TAU * (u * 1.3 + 0.7)) +
          0.015 * Math.sin(TAU * u * 5));
      for (let y = Math.floor(back); y < px.h; y++)
        put(px, x, y, y >= ground[x] ? hill : far);
    }
    const rain = rgb("#8fa6c4");
    const count = Math.round((px.w * px.h) / 45);
    for (let i = 0; i < count; i++) {
      const p = wrap(phase * (3 + (i % 2)) + hash(i * 1.9));
      const y = -3 + p * (px.h + 6);
      const x = wrap(hash(i * 5.3) - p * 0.3) * (px.w + 4) - 2;
      const len = i % 3 ? 2 : 3;
      const a = (0.35 + 0.3 * flash) * calm(px, feet, x, y);
      for (let j = 0; j < len; j++)
        put(px, x + j * 0.4, y - j, rain, a * (1 - j / (len + 1)));
    }
    for (let i = 0; i < Math.round(px.w / 6); i++) {
      if (wrap(phase * 4 + hash(i * 8.2)) > 0.15) continue;
      const x = Math.floor(hash(i * 2.9) * px.w);
      const y = ground[x] + 1 + hash(i * 6.6) * (px.h - ground[x] - 2);
      put(px, x - 1, y - 1, rain, 0.6);
      put(px, x + 1, y - 1, rain, 0.6);
    }
    ring(px, feet, 24, 7, rgb("#9fb8d8"), 0.55);
  },
};

const CANOPY = [
  [0.02, 0.06, 0.24],
  [0.2, -0.04, 0.17],
  [0.1, 0.3, 0.13],
  [0.98, 0.08, 0.24],
  [0.8, -0.02, 0.17],
  [0.9, 0.32, 0.13],
];

const fireflies: Effect = {
  id: "fireflies",
  name: "หิ่งห้อย",
  plate: "#10261a",
  paint(px, feet, phase) {
    phase = wrap(phase);
    verticalGradient(px, [rgb("#050d0a"), rgb("#0e2418"), rgb("#183a26")]);
    const ground = (x: number) =>
      px.h * (0.66 + 0.02 * Math.sin(TAU * (x / px.w) * 3));
    const trunks: [number, number, Rgb][] = [
      [0.21, 0.035, rgb("#0a1b11")],
      [0.79, 0.035, rgb("#0a1b11")],
      [0.06, 0.07, rgb("#030806")],
      [0.94, 0.075, rgb("#030806")],
    ];
    for (const [tx, tw, c] of trunks)
      for (
        let x = Math.round(px.w * (tx - tw / 2));
        x <= px.w * (tx + tw / 2);
        x++
      )
        for (let y = 0; y < ground(x) + 1; y++) put(px, x, y, c);
    const leaf = rgb("#0a1d12");
    const vein = rgb("#16361f");
    for (const [cx0, cy0, cr] of CANOPY) {
      const cx = cx0 * px.w;
      const cy = cy0 * px.h;
      const r = cr * px.w;
      for (let y = Math.max(0, Math.floor(cy - r)); y <= cy + r; y++) {
        for (let x = Math.max(0, Math.floor(cx - r)); x <= cx + r; x++) {
          const d = Math.hypot(x - cx, y - cy) / r;
          if (d > 1 || (d > 0.82 && bayer(x, y) > (1 - d) / 0.18)) continue;
          put(px, x, y, hash(x * 12.9 + y * 78.2) > 0.9 ? vein : leaf);
        }
      }
    }
    const soil = rgb("#07130c");
    for (let x = 0; x < px.w; x++)
      for (let y = Math.floor(ground(x)); y < px.h; y++) put(px, x, y, soil);
    const grass = [rgb("#173d24"), rgb("#2c6138")];
    for (let i = 0; i < Math.round(px.w / 3); i++) {
      const x = Math.round(hash(i * 4.4) * px.w);
      const top = ground(x);
      const y = Math.round(top + (i % 2 ? 0 : hash(i * 6.2) * (px.h - top)));
      const sway = Math.round(0.8 * Math.sin(TAU * (phase + hash(i * 2.6))));
      const c = grass[i % 2];
      put(px, x, y, c);
      put(px, x, y - 1, c);
      put(px, x + sway, y - 2, c);
      put(px, x - 1, y, c);
      put(px, x - 2, y - 1, c);
      put(px, x + 1, y, c);
      put(px, x + 2, y - 1, c);
    }
    const core = rgb("#e8ff8a");
    const glow = rgb("#9cff5a");
    const count = Math.round((px.w * px.h) / 300);
    for (let i = 0; i < count; i++) {
      const m = 1 + (i % 2);
      const x =
        hash(i * 3.3) * px.w +
        (2 + 3 * hash(i * 8.8)) * Math.sin(TAU * (phase * m + hash(i * 1.1)));
      const y =
        px.h * (0.12 + 0.8 * hash(i * 5.7)) +
        (1.5 + 2 * hash(i * 9.9)) *
          Math.cos(TAU * (phase * (3 - m) + hash(i * 2.4)));
      const b =
        (0.5 + 0.5 * Math.sin(TAU * (phase * (1 + (i % 3)) + hash(i * 6.3)))) **
        2;
      const a = calm(px, feet, x, y);
      put(px, x, y, core, (0.2 + 0.8 * b) * a);
      if (b > 0.5)
        for (const [dx, dy] of PLUS)
          put(px, x + dx, y + dy, glow, (b - 0.3) * 0.6 * a);
    }
    ring(px, feet, 24, 7, rgb("#d8ff8a"), 0.55);
  },
};

const underwater: Effect = {
  id: "underwater",
  name: "ใต้น้ำ",
  plate: "#0f3f63",
  paint(px, feet, phase) {
    phase = wrap(phase);
    verticalGradient(px, [rgb("#1c7aa8"), rgb("#0f4f7a"), rgb("#0b2a4a")]);
    const ray = rgb("#a8e4ff");
    const reach = px.h * 0.72;
    const sway = px.w * 0.04 * Math.sin(TAU * phase);
    for (let y = 0; y < reach; y++) {
      const fade = 1 - y / reach;
      for (let x = 0; x < px.w; x++) {
        const r = (x + (reach - y) * 0.45 + sway) / px.w;
        const v =
          (Math.max(0, Math.sin(TAU * r * 2.3)) ** 6 * 0.8 +
            Math.max(0, Math.sin(TAU * (r * 3.7 + 0.3))) ** 8 * 0.6) *
          fade;
        const q = quantize(v * 0.6, 3, x, y);
        if (q > 0) put(px, x, y, ray, q * 0.5);
      }
    }
    const sand = rgb("#1f5466");
    const deep = rgb("#173f52");
    const caustic = rgb("#4a9db3");
    for (let x = 0; x < px.w; x++) {
      const u = x / px.w;
      const top = px.h * (0.6 + 0.025 * Math.sin(TAU * (u * 2 + 0.3)));
      for (let y = Math.floor(top); y < px.h; y++) {
        const v = (y - top) / (px.h - top + 1);
        put(px, x, y, mix(sand, deep, quantize(v, 3, x, y)));
        const c1 = Math.sin(
          TAU * (u * 2.5 + v * 0.8 + phase) +
            1.2 * Math.sin(TAU * (v * 1.2 - u * 1.5 + phase)),
        );
        const c2 = Math.sin(
          TAU * (u * 1.5 - v * 1.2 - phase) +
            1.2 * Math.sin(TAU * (u * 2 + v + phase)),
        );
        if (Math.min(Math.abs(c1), Math.abs(c2)) < 0.14)
          put(px, x, y, caustic, (1 - v) * 0.55);
      }
    }
    const weed = [rgb("#2f8a4a"), rgb("#3fa65a")];
    for (let i = 0; i < Math.max(4, Math.round(px.w / 12)); i++) {
      const x0 = px.w * ((i % 2 ? 0.72 : 0.02) + 0.26 * hash(i * 3.1));
      const tall = px.h * (0.22 + 0.2 * hash(i * 5.9));
      for (let j = 0; j < tall; j++) {
        const t = j / tall;
        const x =
          x0 +
          (1 + px.w * 0.02) *
            t *
            Math.sin(TAU * (phase + hash(i * 7.7) - t * 0.6));
        const c = weed[Math.floor(j / 2) % 2];
        put(px, x, px.h - 1 - j, c);
        if (t < 0.55) put(px, x + 1, px.h - 1 - j, c);
      }
    }
    const foam = rgb("#cfefff");
    const count = Math.round((px.w * px.h) / 260);
    for (let i = 0; i < count; i++) {
      const p = wrap(phase * (1 + (i % 2)) + hash(i * 2.1));
      const x =
        hash(i * 8.3) * px.w +
        1.2 * Math.sin(TAU * (phase * 3 + hash(i * 4.9)));
      const y = px.h * 0.96 - p * (px.h + 4);
      const a = 0.85 * calm(px, feet, x, y);
      if (hash(i * 6.7) > 0.65)
        for (const [dx, dy] of PLUS) put(px, x + dx, y + dy, foam, a);
      else put(px, x, y, foam, a * 0.8);
    }
    ring(px, feet, 24, 7, rgb("#bfeaff"), 0.55);
  },
};

const DUNES: [string, number, number, number, number][] = [
  ["#a0662e", 0.58, 0.03, 1.2, 0.1],
  ["#c98a45", 0.68, 0.05, 0.9, 0.65],
  ["#e8b36a", 0.84, 0.06, 1.4, 0.15],
];

const desert: Effect = {
  id: "desert",
  name: "ทะเลทราย",
  plate: "#7a3a2a",
  paint(px, feet, phase) {
    phase = wrap(phase);
    verticalGradient(px, [
      rgb("#3a1c3f"),
      rgb("#c0563e"),
      rgb("#f2a65a"),
      rgb("#f7c27a"),
    ]);
    const sun = { x: px.w * 0.76, y: px.h * 0.5 };
    const r = Math.max(2.5, Math.min(px.w, px.h) * 0.11);
    const hot = rgb("#fff0c0");
    const warm = rgb("#ffc56b");
    const halo = rgb("#ffcf7a");
    const shimmer = 0.45 + 0.1 * Math.sin(TAU * phase);
    for (let y = Math.floor(sun.y - r * 2); y <= sun.y + r * 2; y++) {
      for (let x = Math.floor(sun.x - r * 2); x <= sun.x + r * 2; x++) {
        const d = Math.hypot(x - sun.x, y - sun.y);
        const dy = y - sun.y;
        if (d > r) {
          const q = quantize((1 - (d - r) / r) * shimmer, 3, x, y);
          if (q > 0) put(px, x, y, halo, q * 0.6);
        } else if (dy < r * 0.25 || Math.round(dy) % 3 !== 0)
          put(px, x, y, mix(hot, warm, quantize((dy / r + 1) / 2, 3, x, y)));
      }
    }
    const shadow = rgb("#5a2430");
    const ridge = rgb("#ffd9a0");
    const sands = DUNES.map(([hex]) => rgb(hex));
    const crest = [0, 0, 0];
    for (let x = 0; x < px.w; x++) {
      const u = x / px.w;
      DUNES.forEach(([, base, amp, f, off], l) => {
        crest[l] = px.h * (base + amp * Math.sin(TAU * (u * f + off)));
      });
      for (let y = Math.floor(crest[0]); y < px.h; y++) {
        const l = y >= crest[2] ? 2 : y >= crest[1] ? 1 : 0;
        const [, , , f, off] = DUNES[l];
        const side =
          0.5 -
          0.5 * Math.cos(TAU * ((u - ((y - crest[l]) / px.w) * 0.6) * f + off));
        const s = quantize(side, 3, x, y);
        put(
          px,
          x,
          y,
          y - crest[l] < 1 && side < 0.35
            ? ridge
            : mix(sands[l], shadow, s * 0.32),
        );
      }
    }
    const grain = rgb("#ffe6b8");
    const count = Math.round((px.w * px.h) / 160);
    for (let i = 0; i < count; i++) {
      const n = 1 + (i % 2);
      const x = wrap(hash(i * 3.1) + phase * n) * (px.w + 8) - 4;
      const y =
        px.h * (0.5 + 0.48 * hash(i * 7.3)) +
        1.5 * Math.sin(TAU * (phase * n * 2 + hash(i * 2.2)));
      const a = 0.55 * calm(px, feet, x, y);
      for (let j = 0; j < 2 + n; j++)
        put(px, x - j, y, grain, a * (1 - j / (2 + n)));
    }
    ring(px, feet, 24, 7, rgb("#ffe2a0"), 0.6);
  },
};

const PILLARS: [number, number, number, boolean][] = [
  [0.05, 0.1, 0.2, true],
  [0.2, 0.075, 0.46, false],
  [0.81, 0.08, 0.36, false],
  [0.96, 0.1, 0.12, true],
];

const moonlit: Effect = {
  id: "moonlit",
  name: "คืนจันทร์",
  plate: "#141c40",
  paint(px, feet, phase) {
    phase = wrap(phase);
    verticalGradient(px, [rgb("#070b1e"), rgb("#121a3d"), rgb("#26305e")]);
    stars(
      px,
      phase,
      Math.round((px.w * px.h) / 190),
      47,
      [rgb("#ffffff"), rgb("#c8d4ff"), rgb("#fff0b8")],
      0.62,
    );
    const moon = { x: px.w * 0.78, y: px.h * 0.22 };
    const r = Math.max(3, Math.min(px.w, px.h) * 0.12);
    const pale = rgb("#fff6d8");
    const dark = rgb("#1d2652");
    const reach = r * 2.4;
    for (let y = Math.floor(moon.y - reach); y <= moon.y + reach; y++) {
      for (let x = Math.floor(moon.x - reach); x <= moon.x + reach; x++) {
        const d = Math.hypot(x - moon.x, y - moon.y);
        if (d <= r) {
          const shade =
            Math.hypot(x - moon.x + r * 0.5, y - moon.y + r * 0.25) <= r * 0.9;
          put(px, x, y, shade ? dark : pale);
        } else {
          const q = quantize((1 - (d - r) / (reach - r)) ** 2 * 0.5, 3, x, y);
          if (q > 0) put(px, x, y, pale, q * 0.3);
        }
      }
    }
    const wisp = rgb("#3a4678");
    const silver = rgb("#a9b0d8");
    const length = px.w * 0.45;
    const thick = Math.max(1, px.h * 0.025);
    for (let k = 0; k < 3; k++) {
      const x0 = wrap(hash(k * 9.7) + phase) * (px.w + length) - length;
      const yc = moon.y + (k - 1) * r * 0.9 + 0.5;
      for (let y = Math.floor(yc - thick); y <= yc + thick; y++) {
        const dy = (y - yc) / (thick + 0.5);
        for (
          let x = Math.max(0, Math.floor(x0));
          x < Math.min(px.w, x0 + length);
          x++
        ) {
          const t = (x - x0) / length;
          const v =
            Math.sin(Math.PI * t) *
            (1 - dy * dy) *
            (0.75 + 0.25 * Math.sin(TAU * t * 3));
          const q = quantize(v * 0.8, 3, x, y);
          if (q <= 0) continue;
          const near = Math.max(
            0,
            1 - Math.hypot(x - moon.x, y - moon.y) / (r * 2.5),
          );
          put(px, x, y, mix(wisp, silver, near), q * 0.85);
        }
      }
    }
    const stone = rgb("#0a0e22");
    const flute = rgb("#0f1430");
    const rim = rgb("#1a2250");
    const edge = rgb("#2a3466");
    const lawn = rgb("#161d44");
    const floor = px.h * 0.6;
    for (let y = Math.floor(floor); y < px.h; y++)
      for (let x = 0; x < px.w; x++)
        put(
          px,
          x,
          y,
          mix(lawn, stone, quantize((y - floor) / (px.h * 0.25), 3, x, y)),
        );
    PILLARS.forEach(([cx, cw, top, whole], k) => {
      const x0 = Math.round(px.w * (cx - cw / 2));
      const x1 = Math.round(px.w * (cx + cw / 2));
      for (let x = x0; x <= x1; x++) {
        const y0 = Math.floor(
          px.h * (top + (whole ? 0 : 0.1 * hash(k * 13 + Math.floor(x / 2)))),
        );
        for (let y = y0; y < floor + 1; y++)
          put(
            px,
            x,
            y,
            y === y0 && !whole
              ? edge
              : x === x1
                ? rim
                : (x - x0) % 3 === 1
                  ? flute
                  : stone,
          );
      }
      if (whole)
        for (let y = Math.floor(px.h * top) - 2; y < px.h * top; y++)
          for (let x = x0 - 1; x <= x1 + 1; x++)
            put(px, x, y, y === Math.floor(px.h * top) - 2 ? edge : stone);
    });
    for (let k = 0; k < 4; k++) {
      const rw = Math.max(2, Math.round(px.w * (0.03 + 0.02 * hash(k * 5.1))));
      const rh = Math.max(1, Math.round(rw * 0.6));
      const rx = Math.round(px.w * [0.1, 0.24, 0.74, 0.88][k]);
      const ry = Math.round(floor + px.h * (0.03 + 0.05 * hash(k * 7.7)));
      for (let y = ry; y < ry + rh; y++)
        for (let x = rx; x < rx + rw; x++)
          put(px, x, y, y === ry ? edge : flute);
    }
    ring(px, feet, 24, 7, rgb("#fff0b8"), 0.6);
  },
};

const PUFFS = [
  [-1.2, 0.1, 0.8],
  [0, -0.2, 1.1],
  [1.2, 0.1, 0.85],
  [0.5, -0.6, 0.7],
];

const HILLS: [string, number, number, number, number][] = [
  ["#5fae4a", 0.56, 0.04, 1.1, 0.2],
  ["#3f8a36", 0.66, 0.05, 0.8, 0.6],
  ["#2f6d2b", 0.85, 0.05, 1.3, 0.05],
];

const meadow: Effect = {
  id: "meadow",
  name: "ทุ่งหญ้า",
  plate: "#3f7a3a",
  paint(px, feet, phase) {
    phase = wrap(phase);
    verticalGradient(px, [rgb("#5aa8e6"), rgb("#9fd3f5"), rgb("#d8f0ff")]);
    const shade = rgb("#dbeaf5");
    for (let k = 0; k < 3; k++) {
      const s = px.w * (0.045 + 0.02 * hash(k * 3.3));
      const cx = wrap(hash(k * 5.1) + phase) * (px.w + s * 6) - s * 3;
      const cy = px.h * (0.1 + 0.1 * k);
      for (let y = Math.floor(cy - s * 1.4); y <= cy + s * 0.6; y++) {
        for (let x = Math.floor(cx - s * 2.2); x <= cx + s * 2.2; x++) {
          const inside = PUFFS.some(
            ([dx, dy, pr]) =>
              (x - cx - dx * s) ** 2 + (y - cy - dy * s) ** 2 <= (pr * s) ** 2,
          );
          if (inside) put(px, x, y, y > cy + s * 0.1 ? shade : WHITE);
        }
      }
    }
    const hill = (l: number, x: number) => {
      const [, base, amp, f, off] = HILLS[l];
      return px.h * (base + amp * Math.sin(TAU * ((x / px.w) * f + off)));
    };
    const greens = HILLS.map(([hex]) => rgb(hex));
    const sunlit = rgb("#a8dc6a");
    const crest = [0, 0, 0];
    for (let x = 0; x < px.w; x++) {
      for (let l = 0; l < 3; l++) crest[l] = hill(l, x);
      for (let y = Math.floor(crest[0]); y < px.h; y++) {
        const l = y >= crest[2] ? 2 : y >= crest[1] ? 1 : 0;
        const rim = quantize(1 - (y - crest[l]) / 3, 2, x, y);
        put(px, x, y, mix(greens[l], sunlit, rim * 0.4));
      }
    }
    const blade = rgb("#6fbf4f");
    for (let x = 0; x < px.w; x += 2) {
      const lean = Math.round(
        0.8 * Math.sin(TAU * (phase * 2 + (x / px.w) * 1.5)),
      );
      for (const l of [1, 2]) {
        const y = Math.round(hill(l, x));
        const tall = 2 + Math.floor(hash(x * 1.3 + l) * 2);
        for (let j = 1; j < tall; j++) put(px, x, y - j, blade);
        put(px, x + lean, y - tall, blade);
      }
    }
    const petals = [
      rgb("#fff3b0"),
      rgb("#ff9fb8"),
      rgb("#ffffff"),
      rgb("#c9a0ff"),
    ];
    for (let i = 0; i < Math.round((px.w * px.h) / 450); i++) {
      const x = Math.floor(hash(i * 2.7) * px.w);
      const top = hill(1, x) + 2;
      put(px, x, top + hash(i * 5.3) * (px.h - top), petals[i % 4]);
    }
    const wings = [rgb("#ffb3e0"), rgb("#fff27a")];
    const body = rgb("#4a3020");
    for (let k = 0; k < 2; k++) {
      const x =
        px.w * (k ? 0.86 : 0.14) +
        px.w * 0.07 * Math.sin(TAU * (phase + k * 0.3));
      const y =
        px.h * (k ? 0.42 : 0.5) +
        px.h * 0.05 * Math.sin(TAU * (phase * 2 + k * 0.5));
      put(px, x, y, body);
      if (Math.sin(TAU * (phase * 6 + k * 0.25)) > 0)
        for (const [dx, dy] of [
          [-1, -1],
          [1, -1],
          [-1, 0],
          [1, 0],
        ])
          put(px, x + dx, y + dy, wings[k]);
      else put(px, x, y - 1, wings[k]);
    }
    ring(px, feet, 24, 7, rgb("#fff3b0"), 0.6);
  },
};

const heaven: Effect = {
  id: "heaven",
  name: "สวรรค์",
  plate: "#c79ab8",
  paint(px, feet, phase) {
    phase = wrap(phase);
    verticalGradient(px, [rgb("#f6d9a8"), rgb("#f3b9c8"), rgb("#b9b4f0")]);
    const reach = px.h * 0.72;
    const sy = -px.h * 0.6;
    const beat = 0.35 * Math.sin(TAU * phase);
    for (let y = 0; y < reach; y++) {
      const fade = 1 - y / reach;
      for (let x = 0; x < px.w; x++) {
        const a = Math.cos(TAU * ((x - px.w / 2) / (y - sy)) * 2.5);
        const v = a ** 4 * (a > 0 ? 0.65 + beat : 0.65 - beat);
        const q = quantize(v * fade * 1.1, 3, x, y);
        if (q > 0) put(px, x, y, WHITE, q * 0.7);
      }
    }
    const backTop = rgb("#f2e6ff");
    const backLow = rgb("#e4d4f5");
    for (let x = 0; x < px.w; x++) {
      const u = x / px.w;
      const back =
        px.h *
        (0.64 -
          0.07 *
            (0.75 + 0.25 * Math.sin(TAU * u)) *
            Math.abs(Math.sin(Math.PI * (u * 5 + phase))));
      const front =
        px.h *
        (0.86 -
          0.08 *
            (0.75 + 0.25 * Math.cos(TAU * u)) *
            Math.abs(Math.sin(Math.PI * (u * 3.5 + phase * 2))));
      for (let y = Math.floor(back); y < px.h; y++) {
        if (y >= front)
          put(
            px,
            x,
            y,
            mix(WHITE, backTop, quantize((y - front) / (px.h * 0.1), 2, x, y)),
          );
        else
          put(
            px,
            x,
            y,
            mix(backTop, backLow, quantize((y - back) / (px.h * 0.1), 2, x, y)),
          );
      }
    }
    const gold = rgb("#ffe58a");
    const deep = rgb("#f0b84a");
    const count = Math.round((px.w * px.h) / 220);
    for (let i = 0; i < count; i++) {
      const p = wrap(phase + hash(i * 3.9));
      const x =
        hash(i * 7.1) * px.w + 2 * Math.sin(TAU * (phase * 2 + hash(i * 1.3)));
      const y = px.h * 0.92 - p * px.h * 0.95;
      const a = Math.sin(Math.PI * p) * calm(px, feet, x, y);
      put(px, x, y, gold, a);
      if (hash(i * 5.1) > 0.6)
        for (const [dx, dy] of PLUS) put(px, x + dx, y + dy, deep, a * 0.5);
    }
    ring(px, feet, 24, 7, GOLD, 0.6);
  },
};

export const EFFECTS: Effect[] = [
  aurora,
  starfield,
  magic,
  embers,
  sakura,
  snowfall,
  lava,
  crystal,
  storm,
  fireflies,
  underwater,
  desert,
  moonlit,
  meadow,
  heaven,
];
