export type Hsl = { h: number; s: number; l: number };

const OPAQUE = 128;
// Pixel art is held together by its dark outlines, so a dye leaves pixels
// this dark alone and eases in above them.
const OUTLINE = { from: 0.12, to: 0.32 };
const MIN_SATURATION = 0.05;

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === R
      ? ((G - B) / d + 6) % 6
      : max === G
        ? (B - R) / d + 2
        : (R - G) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [r, g, b].map((v) =>
    Math.round(Math.min(1, Math.max(0, v + m)) * 255),
  ) as [number, number, number];
}

export const hexToHsl = (hex: string): Hsl => {
  const n = parseInt(hex.replace(/^#/, ""), 16);
  return rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
};

/** An image's main colour: the alpha-weighted mean, its hue weighted by saturation. */
export function mainColour(data: Uint8ClampedArray): Hsl {
  let x = 0;
  let y = 0;
  let s = 0;
  let l = 0;
  let weight = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < OPAQUE) continue;
    const c = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const angle = (c.h * Math.PI) / 180;
    x += Math.cos(angle) * c.s * a;
    y += Math.sin(angle) * c.s * a;
    s += c.s * a;
    l += c.l * a;
    weight += a;
  }
  if (!weight) return { h: 0, s: 0, l: 0.5 };
  return {
    h: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360,
    s: s / weight,
    l: l / weight,
  };
}

/**
 * Moves a colour the way the dye moves the item's main colour onto the target:
 * the same hue turn, saturation scaled by the same ratio, and lightness pulled
 * towards the target without crossing black or white.
 */
export function dyeHsl(
  c: Hsl,
  main: Hsl,
  target: Hsl,
  keepLightness = false,
): Hsl {
  const h = (((c.h + target.h - main.h) % 360) + 360) % 360;
  const s = Math.min(1, (c.s * target.s) / Math.max(main.s, MIN_SATURATION));
  if (keepLightness) return { h, s, l: c.l };
  const lit =
    target.l <= main.l
      ? (c.l * target.l) / Math.max(main.l, 1e-6)
      : 1 - ((1 - c.l) * (1 - target.l)) / Math.max(1 - main.l, 1e-6);
  const t = Math.min(
    1,
    Math.max(0, (c.l - OUTLINE.from) / (OUTLINE.to - OUTLINE.from)),
  );
  return { h, s, l: c.l + (lit - c.l) * t * t * (3 - 2 * t) };
}

export function dyeRgb(
  rgb: number,
  main: Hsl,
  target: Hsl,
  keepLightness = false,
): number {
  const c = dyeHsl(
    rgbToHsl((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255),
    main,
    target,
    keepLightness,
  );
  const [r, g, b] = hslToRgb(c);
  return (r << 16) | (g << 8) | b;
}

export function dyePixels(
  data: Uint8ClampedArray,
  main: Hsl,
  target: Hsl,
): void {
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const [r, g, b] = hslToRgb(
      dyeHsl(rgbToHsl(data[i], data[i + 1], data[i + 2]), main, target),
    );
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}
