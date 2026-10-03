import { createWingKit } from "../src/game/wings.js";
import type { Look } from "../src/game/types";

// The game hands these ids to setBlendMode; the canvas needs composite ops.
const PHASER = { BlendModes: { NORMAL: 0, ADD: 1 } };
const COMPOSITE: GlobalCompositeOperation[] = ["source-over", "lighter"];
const WALK_FRAME_MS = 90;
const IDLE_FRAME_MS = 180;
const FEET_OFFSET = 9;
const BODY_DEPTH = 10;
// The game's flap is sin(t / 130) walking and sin(t / 420) standing.
export const FLAP_PERIOD_MS = {
  walk: 2 * Math.PI * 130,
  idle: 2 * Math.PI * 420,
};

const kit = createWingKit(PHASER);
export const DIRECTIONS: string[] = kit.directions;

type Texture = HTMLImageElement | HTMLCanvasElement;

class Part {
  x = 0;
  y = 0;
  originX = 0.5;
  originY = 0.5;
  scaleX = 1;
  scaleY = 1;
  rotation = 0;
  depth = 0;
  alpha = 1;
  visible = true;
  blend = 0;
  tint: number | null = null;
  tintFill: number | null = null;
  dead = false;

  constructor(
    readonly key: string | null,
    readonly rect?: { w: number; h: number; color: number; alpha: number },
  ) {}

  setOrigin(x: number, y = x) {
    this.originX = x;
    this.originY = y;
    return this;
  }
  setVisible(v: boolean) {
    this.visible = v;
    return this;
  }
  setTintFill(color: number) {
    this.tintFill = color;
    return this;
  }
  setTint(color: number) {
    this.tint = color;
    this.tintFill = null;
    return this;
  }
  setBlendMode(mode: number) {
    this.blend = mode;
    return this;
  }
  setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
    return this;
  }
  setScale(x: number, y = x) {
    this.scaleX = x;
    this.scaleY = y;
    return this;
  }
  setRotation(r: number) {
    this.rotation = r;
    return this;
  }
  setDepth(d: number) {
    this.depth = d;
    return this;
  }
  setAlpha(a: number) {
    this.alpha = a;
    return this;
  }
  destroy() {
    this.dead = true;
  }
}

const css = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  return img.decode().then(() => img);
}

export type Pose = { direction: string; walking: boolean };

export type Scene = {
  look: Look;
  wings: string | null;
  pose: Pose;
  timeMs: number;
};

export class Stage {
  private readonly textures = new Map<string, Texture>();
  private readonly sheets = new Map<string, HTMLImageElement>();
  private readonly tinted = new Map<string, HTMLCanvasElement>();
  private readonly parts: Part[] = [];
  private readonly sceneShim = {
    add: {
      sprite: (_x: number, _y: number, key: string) =>
        this.track(new Part(key)),
      rectangle: (
        _x: number,
        _y: number,
        w: number,
        h: number,
        color: number,
        alpha = 1,
      ) => this.track(new Part(null, { w, h, color, alpha })),
    },
    textures: {
      exists: (key: string) => this.textures.has(key),
      createCanvas: (key: string, w: number, h: number) => {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        this.textures.set(key, canvas);
        return { getContext: () => canvas.getContext("2d")!, refresh() {} };
      },
    },
    time: { now: 0 },
  };
  private readonly entity: Record<string, any>;
  private wingsId: string | null = null;

  constructor() {
    this.entity = Object.assign(
      {
        x: 0,
        y: 0,
        dead: false,
        sitting: false,
        wasWalking: false,
        direction: "south",
        wings: undefined,
        sprite: { scene: this.sceneShim, visible: true, alpha: 1, x: 0, y: 0 },
      },
      kit.methods,
    );
  }

  async load(
    looks: Look[],
    wingTextures: Record<string, string>,
  ): Promise<void> {
    await Promise.all([
      ...looks.map(async (look) =>
        this.sheets.set(
          look.id,
          await loadImage(`data:image/png;base64,${look.sheet.png}`),
        ),
      ),
      ...Object.entries(wingTextures).map(async ([key, png]) =>
        this.textures.set(key, await loadImage(`data:image/png;base64,${png}`)),
      ),
    ]);
  }

  private track(part: Part): Part {
    this.parts.push(part);
    return part;
  }

  private setWings(id: string | null): void {
    if (id === this.wingsId) return;
    this.wingsId = id;
    this.entity.setWings(id ?? undefined);
    for (let i = this.parts.length - 1; i >= 0; i--)
      if (this.parts[i].dead) this.parts.splice(i, 1);
  }

  private tintedTexture(key: string, part: Part): Texture | undefined {
    const base = this.textures.get(key);
    if (!base) return undefined;
    const mode =
      part.tintFill !== null
        ? "fill"
        : part.tint !== null && part.tint !== 0xffffff
          ? "mul"
          : null;
    if (!mode) return base;
    const color = (mode === "fill" ? part.tintFill : part.tint)!;
    const cacheKey = `${key}|${mode}|${color}`;
    let canvas = this.tinted.get(cacheKey);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = base.width;
      canvas.height = base.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(base, 0, 0);
      ctx.globalCompositeOperation = mode === "fill" ? "source-in" : "multiply";
      ctx.fillStyle = css(color);
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (mode === "mul") {
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(base, 0, 0);
      }
      this.tinted.set(cacheKey, canvas);
    }
    return canvas;
  }

  /** Draws one moment of the scene with the feet at (feetX, feetY) in world units. */
  draw(
    ctx: CanvasRenderingContext2D,
    scene: Scene,
    feetX: number,
    feetY: number,
  ): void {
    const { look, pose, timeMs } = scene;
    this.setWings(scene.wings);
    const groundY = feetY - FEET_OFFSET;
    this.sceneShim.time.now = timeMs;
    Object.assign(this.entity, {
      wasWalking: pose.walking,
      direction: pose.direction,
      x: feetX,
      y: groundY,
    });
    Object.assign(this.entity.sprite, { x: feetX, y: feetY });
    this.entity.drawWings({ visible: true, y: groundY });

    const anim = pose.walking ? "walk" : "idle";
    const rowIndex = look.sheet.rows.findIndex(
      (r) => r.anim === anim && r.dir === pose.direction,
    );
    const row = look.sheet.rows[rowIndex];
    const frame =
      Math.floor(timeMs / (pose.walking ? WALK_FRAME_MS : IDLE_FRAME_MS)) %
      row.count;
    const { w, h } = look.sheet.cell;
    const sheet = this.sheets.get(look.id)!;

    type Item = { depth: number; paint: () => void };
    const items: Item[] = [
      {
        depth: groundY - 1,
        paint: () => {
          ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
          ctx.beginPath();
          ctx.ellipse(feetX, feetY, 12, 4, 0, 0, Math.PI * 2);
          ctx.fill();
        },
      },
      {
        depth: groundY + BODY_DEPTH,
        paint: () =>
          ctx.drawImage(
            sheet,
            frame * w,
            rowIndex * h,
            w,
            h,
            Math.round(feetX - w / 2),
            Math.round(feetY - look.sheet.baseline),
            w,
            h,
          ),
      },
      ...this.parts
        .filter((p) => p.visible && !p.dead && p.alpha > 0)
        .map((p) => ({ depth: p.depth, paint: () => this.paintPart(ctx, p) })),
    ];
    items.sort((a, b) => a.depth - b.depth);
    for (const item of items) {
      ctx.save();
      item.paint();
      ctx.restore();
    }
  }

  private paintPart(ctx: CanvasRenderingContext2D, part: Part): void {
    ctx.globalAlpha = Math.max(
      0,
      Math.min(1, part.alpha * (part.rect?.alpha ?? 1)),
    );
    ctx.globalCompositeOperation = COMPOSITE[part.blend] ?? "source-over";
    ctx.translate(part.x, part.y);
    ctx.rotate(part.rotation);
    ctx.scale(part.scaleX, part.scaleY);
    if (part.rect) {
      ctx.fillStyle = css(part.rect.color);
      ctx.fillRect(
        -part.rect.w / 2,
        -part.rect.h / 2,
        part.rect.w,
        part.rect.h,
      );
      return;
    }
    const texture = part.key ? this.tintedTexture(part.key, part) : undefined;
    if (!texture) return;
    ctx.drawImage(
      texture,
      -part.originX * texture.width,
      -part.originY * texture.height,
    );
  }
}
