// The game mirrors its Phaser name tag into a DOM label: 12px bold on a world
// drawn at 2x, top-centred 7 world px below the feet, outlined by four 1px
// text shadows.
const GAME_WORLD_ZOOM = 2;
const BELOW_FEET = 7;
const LINE_HEIGHT = 1.2;
const OUTLINE = "#18201d";
export const NAME_FONT =
  '"Google Sans", "Noto Sans Thai", Tahoma, Arial, sans-serif';
const NAME_LINE = { px: 12, color: "#b9eab5" };
// The class goes under the name, smaller and gold, the way MMO nameplates show a title.
const CLASS_LINE = { px: 10, color: "#f0d58c" };

const OUTLINE_OFFSETS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

export type NameplateLine = { text: string; px: number; color: string };

export const nameplate = (name: string, className: string): NameplateLine[] => [
  ...(name ? [{ text: name, ...NAME_LINE }] : []),
  ...(className ? [{ text: `‹${className}›`, ...CLASS_LINE }] : []),
];

/** Positions `plate` over a canvas that shows world pixels at `scale` CSS px each. */
export function styleNameplate(
  plate: HTMLElement,
  feet: { x: number; y: number },
  scale: number,
): void {
  const k = scale / GAME_WORLD_ZOOM;
  Object.assign(plate.style, {
    left: `${feet.x * scale}px`,
    top: `${(feet.y + BELOW_FEET) * scale}px`,
    textShadow: OUTLINE_OFFSETS.map(
      ([dx, dy]) => `${dx * k}px ${dy * k}px 0 ${OUTLINE}`,
    ).join(","),
  });
}

export function fillNameplate(
  plate: HTMLElement,
  lines: NameplateLine[],
  scale: number,
): void {
  const k = scale / GAME_WORLD_ZOOM;
  plate.replaceChildren(
    ...lines.map((line) => {
      const span = document.createElement("span");
      span.textContent = line.text;
      Object.assign(span.style, {
        display: "block",
        font: `700 ${line.px * k}px/${LINE_HEIGHT} ${NAME_FONT}`,
        color: line.color,
      });
      return span;
    }),
  );
  plate.hidden = !lines.length;
}

export async function loadNameFont(lines: NameplateLine[]): Promise<void> {
  try {
    await document.fonts.load(
      `700 ${NAME_LINE.px}px ${NAME_FONT}`,
      lines.map((l) => l.text).join(""),
    );
  } catch {
    // Offline: the fallback fonts in NAME_FONT still draw the plate.
  }
}

export function drawNameplate(
  ctx: CanvasRenderingContext2D,
  lines: NameplateLine[],
  feet: { x: number; y: number },
  scale: number,
): void {
  const k = scale / GAME_WORLD_ZOOM;
  const x = feet.x * scale;
  let top = (feet.y + BELOW_FEET) * scale;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const line of lines) {
    const size = line.px * k;
    const y = top + (size * LINE_HEIGHT) / 2;
    ctx.font = `700 ${size}px ${NAME_FONT}`;
    ctx.fillStyle = OUTLINE;
    for (const [dx, dy] of OUTLINE_OFFSETS)
      ctx.fillText(line.text, x + dx * k, y + dy * k);
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, x, y);
    top += size * LINE_HEIGHT;
  }
  ctx.restore();
}
