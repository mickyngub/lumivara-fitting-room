import { hslToRgb, mainColour } from "../src/art/dye";
import { pixels, type Pixels } from "../src/art/pixels";
import {
  clearBackground,
  fitInside,
  hardenAlpha,
  mirror,
  opaqueBox,
} from "../src/art/upload-wing";
import { DRAWN_WINGS } from "../src/art/wings";
import type { WingInfo, WingStyle } from "../src/game/types";
import type { SavedWing, WingAura, WingSize } from "../src/messages";

/** A wing of the fitting room's own: its id in the game's wing code, its tile, its style and textures. */
export type OwnWing = {
  id: string;
  info: WingInfo;
  style: WingStyle;
  textures: Record<string, string>;
};

const UPLOAD_PREFIX = "own-upload-";
export const isUploadId = (id: string | null): id is string => !!id && id.startsWith(UPLOAD_PREFIX);
export const newUploadId = () => `${UPLOAD_PREFIX}${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
// The longest side an upload is read at, which bounds the work of cutting it out.
const READ_MAX = 512;
// An upload is kept at the largest size offered, about as big as the game's biggest wings.
const STORED = { w: 56, h: 46 };
export const WING_SIZES: { id: WingSize; name: string; h: number }[] = [
  { id: "s", name: "เล็ก", h: 30 },
  { id: "m", name: "กลาง", h: 38 },
  { id: "l", name: "ใหญ่", h: STORED.h },
];
export const WING_AURAS: { id: WingAura; name: string }[] = [
  { id: "gold", name: "ประกายทอง" },
  { id: "demon", name: "ควันปีศาจ" },
  { id: "storm", name: "สายฟ้า" },
];
// An uploaded wing meets the back at its inner edge, this far down, like the game's Divine Wings.
const UPLOAD_ROOT_Y = 0.72;

function canvasOf(px: Pixels): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = px.w;
  canvas.height = px.h;
  canvas
    .getContext("2d")!
    .putImageData(new ImageData(px.data, px.w, px.h), 0, 0);
  return canvas;
}

const pngOf = (px: Pixels) => canvasOf(px).toDataURL("image/png");

/** The source region drawn smoothly at the given size, as pixels. */
function resample(
  source: CanvasImageSource,
  from: { x: number; y: number; w: number; h: number },
  size: { w: number; h: number },
): Pixels {
  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, from.x, from.y, from.w, from.h, 0, 0, size.w, size.h);
  const image = ctx.getImageData(0, 0, size.w, size.h);
  return { w: size.w, h: size.h, data: image.data };
}

/** Both wings spread from the middle, the way the picker shows a wing. */
function pairIcon(px: Pixels): string {
  const pair = pixels(px.w * 2, px.h);
  for (let y = 0; y < px.h; y++) {
    for (let x = 0; x < px.w; x++) {
      const from = (y * px.w + x) * 4;
      for (const to of [px.w + x, px.w - 1 - x])
        pair.data.set(px.data.subarray(from, from + 4), (y * pair.w + to) * 4);
    }
  }
  return pngOf(pair);
}

// The far wing's tint: the wing's main colour, darker and greyer, as the game tints its own.
function farTint(px: Pixels): number {
  const c = mainColour(px.data);
  const [r, g, b] = hslToRgb({ h: c.h, s: c.s * 0.7, l: c.l * 0.75 });
  return (r << 16) | (g << 8) | b;
}

const textureOf = (style: WingStyle) => ({ [style.texture]: style.url });

export function drawnWings(): OwnWing[] {
  return DRAWN_WINGS.map((wing) => {
    const px = pixels(wing.w, wing.h);
    wing.paint(px);
    const style: WingStyle = {
      texture: `wing:${wing.id}`,
      url: pngOf(px),
      rootX: (wing.root.x + 0.5) / wing.w,
      rootY: wing.root.y / wing.h,
      scale: 1,
      drop: wing.drop,
      far: wing.far,
      aura: wing.aura,
    };
    return {
      id: wing.id,
      info: {
        id: wing.id,
        name: wing.name,
        description: wing.description,
        icon: pairIcon(px),
      },
      style,
      textures: textureOf(style),
    };
  });
}

const decode = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("อ่านรูปนี้ไม่ได้ ลองใช้ไฟล์ PNG หรือ JPG"));
    image.src = src;
  });

/** Reads a player's image as a wing: cut out of a flat background, cropped and brought to game size. */
export async function readWing(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await decode(url);
    const whole = { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };
    const read =
      Math.max(whole.w, whole.h) > READ_MAX
        ? fitInside(whole.w, whole.h, { w: READ_MAX, h: READ_MAX })
        : whole;
    const px = resample(image, whole, read);
    clearBackground(px);
    const box = opaqueBox(px);
    if (!box) throw new Error("ไม่พบปีกในรูปนี้");
    const wing = resample(canvasOf(px), box, fitInside(box.w, box.h, STORED));
    hardenAlpha(wing);
    return pngOf(wing);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The player's wing at its chosen size and facing, as a new wing for the game's wing code. */
export async function uploadedWing(
  saved: SavedWing,
  version: number,
): Promise<OwnWing> {
  const image = await decode(saved.png);
  const size = WING_SIZES.find((s) => s.id === saved.size) ?? WING_SIZES[1];
  const whole = { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };
  const px = resample(
    image,
    whole,
    fitInside(whole.w, whole.h, { w: STORED.w, h: size.h }),
  );
  hardenAlpha(px);
  if (saved.flip) mirror(px);
  const id = `${saved.id}:${version}`;
  const style: WingStyle = {
    texture: `wing:${id}`,
    url: pngOf(px),
    rootX: 0.5 / px.w,
    rootY: UPLOAD_ROOT_Y,
    scale: 1,
    drop: 0,
    far: farTint(px),
    aura: saved.aura,
  };
  return {
    id,
    info: {
      id: saved.id,
      name: "ปีกของคุณ",
      description: "ปีกจากรูปของคุณเอง",
      icon: pairIcon(px),
    },
    style,
    textures: textureOf(style),
  };
}
