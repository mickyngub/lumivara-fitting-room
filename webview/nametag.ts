// The game mirrors its Phaser name tag into a DOM label: 12px bold on a world
// drawn at 2x, top-centred 7 world px below the feet, outlined by four 1px
// text shadows.
const GAME_FONT_PX = 12;
const GAME_WORLD_ZOOM = 2;
const BELOW_FEET = 7;
const LINE_HEIGHT = 1.2;
const COLOR = "#b9eab5";
const OUTLINE = "#18201d";
export const NAME_FONT =
  '"Google Sans", "Noto Sans Thai", Tahoma, Arial, sans-serif';

const OUTLINE_OFFSETS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

/** Positions `tag` over a canvas that shows world pixels at `scale` CSS px each. */
export function styleNameTag(
  tag: HTMLElement,
  feet: { x: number; y: number },
  scale: number,
): void {
  const k = scale / GAME_WORLD_ZOOM;
  Object.assign(tag.style, {
    left: `${feet.x * scale}px`,
    top: `${(feet.y + BELOW_FEET) * scale}px`,
    font: `700 ${GAME_FONT_PX * k}px/${LINE_HEIGHT} ${NAME_FONT}`,
    color: COLOR,
    textShadow: OUTLINE_OFFSETS.map(
      ([dx, dy]) => `${dx * k}px ${dy * k}px 0 ${OUTLINE}`,
    ).join(","),
  });
}

export async function loadNameFont(name: string): Promise<void> {
  try {
    await document.fonts.load(`700 ${GAME_FONT_PX}px ${NAME_FONT}`, name);
  } catch {
    // Offline: the fallback fonts in NAME_FONT still draw the tag.
  }
}

export function drawNameTag(
  ctx: CanvasRenderingContext2D,
  name: string,
  feet: { x: number; y: number },
  scale: number,
): void {
  const k = scale / GAME_WORLD_ZOOM;
  const size = GAME_FONT_PX * k;
  const x = feet.x * scale;
  const y = (feet.y + BELOW_FEET) * scale + (size * LINE_HEIGHT) / 2;
  ctx.save();
  ctx.font = `700 ${size}px ${NAME_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = OUTLINE;
  for (const [dx, dy] of OUTLINE_OFFSETS)
    ctx.fillText(name, x + dx * k, y + dy * k);
  ctx.fillStyle = COLOR;
  ctx.fillText(name, x, y);
  ctx.restore();
}
