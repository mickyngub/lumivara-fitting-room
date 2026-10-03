/// <reference types="phaser" />
import { createWingKit } from "../src/game/wings.js";
import type { Look } from "../src/game/types";

const WALK_FRAME_MS = 90;
const IDLE_FRAME_MS = 180;
const FEET_OFFSET = 9;
const BODY_DEPTH = 10;
// The game's player shadow: add.ellipse(x, feet, 25, 9, 0x122018, 0.4).
const SHADOW = { w: 25, h: 9, color: 0x122018, alpha: 0.4 };
const BACKDROP_DEPTH = -1e6;
// The game's flap is sin(t / 130) walking and sin(t / 420) standing.
export const FLAP_PERIOD_MS = {
  walk: 2 * Math.PI * 130,
  idle: 2 * Math.PI * 420,
};

const kit = createWingKit(Phaser);
export const DIRECTIONS: string[] = kit.directions;

export type Pose = { direction: string; walking: boolean };

export type Scene = {
  look: Look;
  wings: string | null;
  pose: Pose;
  timeMs: number;
};

export type Backdrop = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  feet: { x: number; y: number },
) => void;

export type StageOptions = {
  parent: HTMLElement;
  width: number;
  height: number;
  feet: { x: number; y: number };
  looks: Look[];
  wingTextures: Record<string, string>;
  backdrop: Backdrop;
  /** Called every frame for live stages; capture() overrides it for one render. */
  frame?: (timeMs: number) => Scene | null;
};

const png = (b64: string) => `data:image/png;base64,${b64}`;

/**
 * Draws characters with the game's own engine (Phaser 3.90, as the game ships)
 * at native game resolution, with the game's pixelArt and roundPixels
 * settings, so wings come out pixel for pixel as they do in the game.
 */
export class Stage {
  readonly ready: Promise<void>;
  private body!: Phaser.GameObjects.Sprite;
  private camera!: Phaser.Cameras.Scene2D.Camera;
  private textures!: Phaser.Textures.TextureManager;
  private readonly bodyCentres = new Map<string, Map<string, number>>();
  private entity!: Record<string, any>;
  private readonly clock = { now: 0 };
  private wingsId: string | null = null;
  private override: Scene | null = null;
  private readonly game: Phaser.Game;

  constructor(private readonly options: StageOptions) {
    let markReady: () => void = () => {};
    this.ready = new Promise((resolve) => (markReady = resolve));
    const stage = this;
    const { width, height, feet, looks, wingTextures, backdrop } = options;

    class StageScene extends Phaser.Scene {
      preload() {
        for (const look of looks) {
          this.load.spritesheet(look.id, png(look.sheet.png), {
            frameWidth: look.sheet.cell.w,
            frameHeight: look.sheet.cell.h,
          });
        }
        for (const [key, b64] of Object.entries(wingTextures))
          this.load.image(key, png(b64));
      }

      create() {
        const texture = this.textures.createCanvas("backdrop", width, height)!;
        backdrop(texture.getContext(), width, height, feet);
        texture.refresh();
        this.add
          .image(0, 0, "backdrop")
          .setOrigin(0)
          .setDepth(BACKDROP_DEPTH)
          .setScrollFactor(0);
        stage.camera = this.cameras.main;
        stage.textures = this.textures;
        const groundY = feet.y - FEET_OFFSET;
        this.add
          .ellipse(
            feet.x,
            feet.y,
            SHADOW.w,
            SHADOW.h,
            SHADOW.color,
            SHADOW.alpha,
          )
          .setDepth(groundY - 1);
        stage.body = this.add
          .sprite(feet.x, feet.y, looks[0].id, 0)
          .setDepth(groundY + BODY_DEPTH);
        stage.entity = Object.assign(
          {
            x: feet.x,
            y: groundY,
            dead: false,
            sitting: false,
            wasWalking: false,
            direction: "south",
            wings: undefined,
            sprite: {
              scene: {
                add: this.add,
                textures: this.textures,
                time: stage.clock,
              },
              visible: true,
              alpha: 1,
              x: feet.x,
              y: feet.y,
            },
          },
          kit.methods,
        );
        markReady();
      }

      update(time: number) {
        const scene = stage.override ?? stage.options.frame?.(time) ?? null;
        if (scene) stage.apply(scene);
      }
    }

    this.game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent: options.parent,
      width,
      height,
      pixelArt: true,
      roundPixels: true,
      antialias: false,
      banner: false,
      transparent: false,
      backgroundColor: "#000000",
      scale: { mode: Phaser.Scale.NONE },
      scene: StageScene,
    });
  }

  /** Phaser creates its canvas while booting, so this is set once ready resolves. */
  get canvas(): HTMLCanvasElement {
    return this.game.canvas;
  }

  // Sprite art is often off-centre in its cell (a sword out to one side), so
  // the camera frames the body's alpha-weighted centre instead of the anchor.
  // Wings and shadow hang off the anchor and keep the game's placement.
  private bodyCentre(look: Look, direction: string): number {
    let byDirection = this.bodyCentres.get(look.id);
    if (!byDirection) {
      byDirection = new Map();
      const { cell, rows } = look.sheet;
      const source = this.textures
        .get(look.id)
        .getSourceImage() as HTMLImageElement;
      const canvas = document.createElement("canvas");
      canvas.width = source.width;
      canvas.height = source.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(source, 0, 0);
      const { data, width } = ctx.getImageData(
        0,
        0,
        source.width,
        source.height,
      );
      const sums = new Map<string, { mass: number; moment: number }>();
      rows.forEach((row, r) => {
        if (row.anim !== "idle" && row.anim !== "walk") return;
        const sum = sums.get(row.dir) ?? { mass: 0, moment: 0 };
        for (let f = 0; f < row.count; f++) {
          for (let y = 0; y < cell.h; y++) {
            for (let x = 0; x < cell.w; x++) {
              const alpha =
                data[((r * cell.h + y) * width + f * cell.w + x) * 4 + 3];
              sum.mass += alpha;
              sum.moment += alpha * (x + 0.5);
            }
          }
        }
        sums.set(row.dir, sum);
      });
      for (const [dir, { mass, moment }] of sums) {
        byDirection.set(dir, mass ? Math.round(moment / mass - cell.w / 2) : 0);
      }
      this.bodyCentres.set(look.id, byDirection);
    }
    return byDirection.get(direction) ?? 0;
  }

  private apply(scene: Scene): void {
    const { look, pose, timeMs } = scene;
    const { feet } = this.options;
    if (scene.wings !== this.wingsId) {
      this.entity.setWings(scene.wings ?? undefined);
      this.wingsId = scene.wings;
    }
    this.clock.now = timeMs;
    this.entity.wasWalking = pose.walking;
    this.entity.direction = pose.direction;

    const { rows, cell, baseline } = look.sheet;
    const anim = pose.walking ? "walk" : "idle";
    const rowIndex = Math.max(
      0,
      rows.findIndex((r) => r.anim === anim && r.dir === pose.direction),
    );
    const cols = Math.max(...rows.map((r) => r.count));
    const frame =
      Math.floor(timeMs / (pose.walking ? WALK_FRAME_MS : IDLE_FRAME_MS)) %
      rows[rowIndex].count;
    this.body
      .setTexture(look.id, rowIndex * cols + frame)
      .setOrigin(0.5, baseline / cell.h)
      .setPosition(feet.x, feet.y);
    this.entity.drawWings({ visible: true, y: feet.y - FEET_OFFSET });
    this.camera.scrollX = this.bodyCentre(look, pose.direction);
  }

  /** Renders one scene and resolves with the frame the game drew. */
  async capture(scene: Scene): Promise<HTMLImageElement> {
    await this.ready;
    this.override = scene;
    const shot = await new Promise<HTMLImageElement>((resolve) =>
      this.game.renderer.snapshot((image) =>
        resolve(image as HTMLImageElement),
      ),
    );
    this.override = null;
    return shot;
  }
}
