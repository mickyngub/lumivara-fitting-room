import {
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

export const EFFECTS: Effect[] = [aurora, starfield, magic, embers, sakura];
