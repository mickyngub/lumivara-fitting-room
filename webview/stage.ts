/// <reference types="phaser" />
import { createWingKit } from "../src/game/wings.js";
import { FLAP_PERIOD_MS } from "../src/game/poses";
import { clothParts, dyeCloth, dyePixels, dyeRgb, dyeShades, hexToHsl, mainColour, type Cloth, type Hsl } from "../src/art/dye";
import { ACCESSORIES, ACCESSORY_ART, type Accessory } from "../src/art/accessories";
import { pixels } from "../src/art/pixels";
import { findHeads, type Head } from "../src/game/head";
import { RIDING, ridePlacement } from "../src/game/riding";
import type { Look, Mount, WingStyle } from "../src/game/types";

const FEET_OFFSET = 9;
const BODY_DEPTH = 10;
// Over the body and over the wings, which the wing code draws in front of the body seen from behind.
const ACCESSORY_DEPTH = BODY_DEPTH + 2;
// The game's player shadow: add.ellipse(x, feet, 25, 9, 0x122018, 0.4).
const SHADOW = { w: 25, h: 9, color: 0x122018, alpha: 0.4 };
const BACKDROP_DEPTH = -1e6;
// Rows above the baseline (the feet) that the wings attach to.
const TORSO_BAND = { top: 26, bottom: 16 };
// A dyed sheet is as big as the look's, so only the latest few are kept.
const DYED_LOOKS_KEPT = 3;
// A rider on a mount stands about twice as tall, so a mounted scene is drawn at
// the game's size over twice the picture and shown at half the zoom, its feet,
// backdrop and name tag where they were.
const MOUNTED_ZOOM_OUT = 2;
const mountKey = (id: string) => `mount:${id}`;

const kit = createWingKit(Phaser);
export const DIRECTIONS: string[] = kit.directions;
export const CODE_WING_STYLES: Record<string, WingStyle> = { ...kit.config };

/** Points the game's wing code at the wings the live catalog lists. */
export function useWingStyles(styles: Record<string, WingStyle>): void {
  for (const id of Object.keys(kit.config)) delete kit.config[id];
  Object.assign(kit.config, styles);
}

export type BackdropTime = { ms: number; loopMs: number };

/** One moment of a pose: which sprite frame, where the wings are, and the backdrop's place in the loop. */
export type Pose = { direction: string; anim: string; frame: number; walking: boolean };

export type Scene = {
  look: Look;
  wings: string | null;
  /** A colour to dye the wings, or none for the game's own. */
  dye?: string | null;
  /** A colour for each of the look's colour parts, or none for the game's own. */
  lookDyes?: (string | null)[];
  accessory?: string | null;
  /** A colour for the accessory's body, or none for its own. */
  accessoryDye?: string | null;
  /** The mount ridden, the step of its frames and its bob, or none. */
  mount?: { id: string; step: number; bob: number } | null;
  pose: Pose;
  wingMs: number;
  loop: BackdropTime;
};
export type Backdrop = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  feet: { x: number; y: number },
  time: BackdropTime,
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

function webGLAvailable(): boolean {
  const gl = document.createElement("canvas").getContext("webgl") as WebGLRenderingContext | null;
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
  return !!gl;
}

// Phaser checks for WebGL once, when it loads, so a check that failed then would fail every
// retry; the game looks again just before it boots.
class StageGame extends Phaser.Game {
  boot(): void {
    if (!this.device.features.webGL) this.device.features.webGL = webGLAvailable();
    super.boot();
  }
}

/**
 * Draws characters with the game's own engine (Phaser 3.90, as the game ships)
 * at native game resolution, with the game's pixelArt and roundPixels
 * settings, so wings come out pixel for pixel as they do in the game.
 */
export class Stage {
  readonly ready: Promise<void>;
  private body!: Phaser.GameObjects.Sprite;
  private accessory!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Ellipse;
  private mountSprite!: Phaser.GameObjects.Sprite;
  private backdropImage!: Phaser.GameObjects.Image;
  private readonly mounts = new Map<string, Mount>();
  private zoomOut = 1;
  private readonly heads = new Map<string, Head[][]>();
  private textures!: Phaser.Textures.TextureManager;
  private readonly torsoOffsets = new Map<string, Map<string, number>>();
  private backdropTexture: Phaser.Textures.CanvasTexture | null = null;
  private animatedBackdrop = false;
  private backdropTime: BackdropTime = { ms: 0, loopMs: FLAP_PERIOD_MS.idle };
  private entity!: Record<string, any>;
  private readonly clock = { now: 0 };
  private wingsId: string | null = null;
  private dye: string | null = null;
  private readonly mainColours = new Map<string, Hsl>();
  private readonly cloth = new Map<string, Cloth | null>();
  private readonly dyedLooks: string[] = [];
  private override: Scene | null = null;
  private readonly game: Phaser.Game;

  constructor(private readonly options: StageOptions) {
    let markReady: () => void = () => {};
    this.ready = new Promise((resolve) => (markReady = resolve));
    const stage = this;
    const { width, height, feet, looks, wingTextures } = options;

    class StageScene extends Phaser.Scene {
      preload() {
        for (const look of looks) {
          this.load.spritesheet(look.id, png(look.sheet.png), {
            frameWidth: look.sheet.cell.w,
            frameHeight: look.sheet.cell.h,
          });
        }
        this.load.setCORS("anonymous");
        for (const [key, url] of Object.entries(wingTextures))
          this.load.image(key, url);
      }

      create() {
        const texture = this.textures.createCanvas("backdrop", width, height)!;
        stage.backdropTexture = texture;
        stage.paintBackdrop();
        stage.backdropImage = this.add.image(0, 0, "backdrop").setOrigin(0).setDepth(BACKDROP_DEPTH);
        stage.textures = this.textures;
        stage.shadow = this.add.ellipse(
          feet.x,
          feet.y,
          SHADOW.w,
          SHADOW.h,
          SHADOW.color,
          SHADOW.alpha,
        );
        stage.mountSprite = this.add.sprite(0, 0, "__DEFAULT").setOrigin(0.5, 1).setVisible(false);
        stage.body = this.add.sprite(feet.x, feet.y, looks[0].id, 0);
        stage.accessory = this.add
          .image(0, 0, "__DEFAULT")
          .setOrigin(0)
          .setVisible(false);
        stage.entity = Object.assign(
          {
            x: feet.x,
            y: feet.y - FEET_OFFSET,
            dead: false,
            sitting: false,
            riding: false,
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
        stage.placeGround();
        markReady();
      }

      update(time: number) {
        const scene = stage.override ?? stage.options.frame?.(time) ?? null;
        if (scene) stage.apply(scene);
      }
    }

    this.game = new StageGame({
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

  /**
   * Repaints the scenery behind the character, now or as soon as the stage
   * boots. An animated backdrop is repainted every frame at the scene's time,
   * looping with the card (the wing flap's period).
   */
  setBackdrop(backdrop: Backdrop, animated = false): void {
    this.options.backdrop = backdrop;
    this.animatedBackdrop = animated;
    this.paintBackdrop();
  }

  private paintBackdrop(): void {
    const texture = this.backdropTexture;
    if (!texture) return;
    const { width, height, feet } = this.options;
    const ctx = texture.getContext();
    ctx.clearRect(0, 0, width, height);
    this.options.backdrop(ctx, width, height, feet, this.backdropTime);
    texture.refresh();
  }

  /** Adds a wing made after the stage booted, such as the player's own, to the game's wing code. */
  async useWing(id: string, style: WingStyle): Promise<void> {
    await this.ready;
    if (!this.textures.exists(style.texture)) {
      const image = new Image();
      image.src = style.url;
      await image.decode();
      if (!this.textures.exists(style.texture)) this.textures.addImage(style.texture, image);
    }
    kit.config[id] = style;
  }

  /** Gives the stage a mount's sheet, cut into the frames the game cuts it into. */
  async useMount(mount: Mount, sheet: HTMLImageElement): Promise<void> {
    await this.ready;
    const key = mountKey(mount.id);
    if (!this.textures.exists(key)) this.textures.addSpriteSheet(key, sheet, { frameWidth: mount.cell.w, frameHeight: mount.cell.h });
    this.mounts.set(mount.id, mount);
  }

  /** Where the feet are in the view the scene is drawn in. */
  private feet(): { x: number; y: number } {
    const { x, y } = this.options.feet;
    return { x: x * this.zoomOut, y: y * this.zoomOut };
  }

  /** Sets the shadow and the depths the game gives everything on the ground under the feet. */
  private placeGround(): void {
    const feet = this.feet();
    const groundY = feet.y - FEET_OFFSET;
    this.shadow.setPosition(feet.x, feet.y).setDepth(groundY - 1);
    this.mountSprite.setDepth(groundY + RIDING.depth);
    this.body.setDepth(groundY + BODY_DEPTH);
    this.accessory.setDepth(groundY + ACCESSORY_DEPTH);
    this.entity.x = feet.x;
    this.entity.y = groundY;
  }

  private setZoomOut(zoomOut: number): void {
    if (zoomOut === this.zoomOut) return;
    this.zoomOut = zoomOut;
    this.game.scale.resize(this.options.width * zoomOut, this.options.height * zoomOut);
    this.backdropImage.setScale(zoomOut);
    this.placeGround();
  }

  /** Stops the engine and removes its canvas, so a stage that failed to start can be built again. */
  destroy(): void {
    this.game.destroy(true);
  }

  /** Phaser creates its canvas while booting, so this is set once ready resolves. */
  get canvas(): HTMLCanvasElement {
    return this.game.canvas;
  }

  // The game hangs wings, shadow and name off the frame centre, but many sprites
  // draw the torso off-centre in the frame. Unlike the game, the preview shifts
  // the body so its torso band sits on that anchor (see the wing-anchor note).
  private torsoOffset(look: Look, direction: string): number {
    let byDirection = this.torsoOffsets.get(look.id);
    if (!byDirection) {
      byDirection = new Map();
      const { cell, rows, baseline } = look.sheet;
      const { data, width } = this.sourcePixels(look.id).image;
      rows.forEach((row, r) => {
        if (row.anim !== "idle") return;
        let min = cell.w;
        let max = -1;
        for (
          let y = baseline - TORSO_BAND.top;
          y <= baseline - TORSO_BAND.bottom;
          y++
        ) {
          for (let x = 0; x < cell.w; x++) {
            if (data[((r * cell.h + y) * width + x) * 4 + 3]) {
              min = Math.min(min, x);
              max = Math.max(max, x);
            }
          }
        }
        byDirection!.set(
          row.dir,
          max < 0 ? 0 : Math.round((min + max + 1) / 2 - cell.w / 2),
        );
      });
      this.torsoOffsets.set(look.id, byDirection);
    }
    return byDirection.get(direction) ?? 0;
  }

  private sourcePixels(key: string): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; image: ImageData } {
    const source = this.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(source, 0, 0);
    return { canvas, ctx, image: ctx.getImageData(0, 0, source.width, source.height) };
  }

  private mainColourOf(key: string): Hsl {
    let colour = this.mainColours.get(key);
    if (!colour) this.mainColours.set(key, (colour = mainColour(this.sourcePixels(key).image.data)));
    return colour;
  }

  private dyedTexture(key: string, dye: string, main: Hsl): string {
    const dyed = `${key}~${dye}`;
    if (!this.textures.exists(dyed)) {
      const { canvas, ctx, image } = this.sourcePixels(key);
      dyePixels(image.data, main, hexToHsl(dye));
      ctx.putImageData(image, 0, 0);
      this.textures.addCanvas(dyed, canvas);
    }
    return dyed;
  }

  /** Registers a dyed copy of a wing style with the game's wing code: recoloured textures and far-wing tint. */
  private dyedWings(id: string, dye: string): string {
    const style = kit.config[id];
    if (!style || !this.textures.exists(style.texture)) return id;
    const main = this.mainColourOf(style.texture);
    const texture = this.dyedTexture(style.texture, dye, main);
    const rim = style.rim && this.textures.exists(style.rim) ? this.dyedTexture(style.rim, dye, main) : style.rim;
    const key = `${id}~${dye}`;
    kit.config[key] ??= {
      ...style,
      texture,
      ...(rim ? { rim } : {}),
      ...(style.far === undefined ? {} : { far: dyeRgb(style.far, main, hexToHsl(dye), true) }),
    };
    return key;
  }

  // The wing code colours its glow, motes and swirls from constants per aura,
  // so they are read back off the parts it made and turned like the textures.
  private dyeWingParts(id: string, dye: string): void {
    const parts = this.entity.wings;
    const style = kit.config[id];
    if (!parts || !style) return;
    const main = this.mainColourOf(style.texture);
    const target = hexToHsl(dye);
    for (const side of [parts.left, parts.right]) side[0].setTintFill(dyeRgb(side[0].tintTopLeft, main, target));
    for (const mote of parts.motes) mote.setFillStyle(dyeRgb(mote.fillColor, main, target), mote.fillAlpha);
    for (const swirl of parts.swirls) swirl.setTexture(this.dyedTexture(swirl.texture.key, dye, main));
  }

  private clothOf(look: Look): Cloth | null {
    let cloth = this.cloth.get(look.id);
    if (cloth === undefined) {
      const { canvas, image } = this.sourcePixels(look.id);
      this.cloth.set(look.id, (cloth = clothParts(image.data, canvas.width, look.sheet, this.headsOf(look))));
    }
    return cloth;
  }

  /** The colour parts of a look's clothes, largest first; none before the stage has booted. */
  partsOf(look: Look): Hsl[] {
    return this.textures ? (this.clothOf(look)?.parts ?? []) : [];
  }

  /** The look's sheet with its clothes' parts dyed, framed like the game's sprite sheet. */
  private lookTexture(look: Look, dyes: (string | null)[]): string {
    const cloth = dyes.some(Boolean) ? this.clothOf(look) : null;
    if (!cloth) return look.id;
    const key = `${look.id}~${dyes.join(",")}`;
    if (this.textures.exists(key)) return key;
    const { canvas, ctx, image } = this.sourcePixels(look.id);
    const targets = cloth.parts.map((_, k) => (dyes[k] ? hexToHsl(dyes[k]!) : null));
    dyeCloth(image.data, canvas.width, look.sheet, this.headsOf(look), cloth, targets);
    ctx.putImageData(image, 0, 0);
    const texture = this.textures.addCanvas(key, canvas)!;
    const { w, h } = look.sheet.cell;
    const cols = Math.floor(canvas.width / w);
    for (let i = 0; i < cols * Math.floor(canvas.height / h); i++) texture.add(i, 0, (i % cols) * w, Math.floor(i / cols) * h, w, h);
    this.dyedLooks.push(key);
    if (this.dyedLooks.length > DYED_LOOKS_KEPT) this.textures.remove(this.dyedLooks.shift()!);
    return key;
  }

  private headsOf(look: Look): Head[][] {
    let heads = this.heads.get(look.id);
    if (!heads) {
      const { data, width } = this.sourcePixels(look.id).image;
      heads = findHeads(data, width, look.sheet, (dir) => look.sheet.cell.w / 2 + this.torsoOffset(look, dir));
      this.heads.set(look.id, heads);
    }
    return heads;
  }

  private accessoryTexture(accessory: Accessory, headW: number, facing: number, dye: string | null): string {
    const key = `accessory:${accessory.id}:${headW}:${facing}:${dye ?? ""}`;
    if (!this.textures.exists(key)) {
      const px = pixels(ACCESSORY_ART.w, ACCESSORY_ART.h);
      accessory.paint(px, headW, facing);
      if (dye) dyeShades(px.data, accessory.body, hexToHsl(dye));
      const canvas = document.createElement("canvas");
      canvas.width = px.w;
      canvas.height = px.h;
      canvas.getContext("2d")!.putImageData(new ImageData(px.data, px.w, px.h), 0, 0);
      this.textures.addCanvas(key, canvas);
    }
    return key;
  }

  /** Sets the accessory on the head of the frame the body shows; it floats in step with the card's loop. */
  private placeAccessory(scene: Scene, rowIndex: number, frame: number, body: { x: number; y: number }): void {
    const accessory = ACCESSORIES.find((a) => a.id === scene.accessory);
    if (!accessory) {
      this.accessory.setVisible(false);
      return;
    }
    const { look, pose, loop } = scene;
    const { cell, baseline } = look.sheet;
    const head = this.headsOf(look)[rowIndex][frame];
    const facing = Math.round(Math.abs(Math.sin((DIRECTIONS.indexOf(pose.direction) * Math.PI) / 4)) * 100) / 100;
    const bob = accessory.float ? Math.round(Math.sin((2 * Math.PI * loop.ms) / loop.loopMs) * accessory.float) : 0;
    this.accessory
      .setTexture(this.accessoryTexture(accessory, head.w, facing, scene.accessoryDye ?? null))
      .setPosition(
        Math.round(body.x - cell.w / 2 + head.x - 0.5) - ACCESSORY_ART.x,
        body.y - baseline + head.top - ACCESSORY_ART.top + bob,
      )
      .setVisible(true);
  }

  private apply(scene: Scene): void {
    const { look, pose } = scene;
    const mount = scene.mount ? this.mounts.get(scene.mount.id) : undefined;
    this.setZoomOut(mount ? MOUNTED_ZOOM_OUT : 1);
    const feet = this.feet();
    const dye = scene.dye ?? null;
    if (scene.wings !== this.wingsId || dye !== this.dye) {
      const id = scene.wings && dye ? this.dyedWings(scene.wings, dye) : scene.wings;
      this.entity.setWings(id ?? undefined);
      if (scene.wings && dye && id !== scene.wings) this.dyeWingParts(scene.wings, dye);
      this.wingsId = scene.wings;
      this.dye = dye;
    }
    this.clock.now = scene.wingMs;
    this.entity.wasWalking = pose.walking;
    this.entity.direction = pose.direction;

    const { rows, cell, baseline } = look.sheet;
    const rowOf = (anim: string) => rows.findIndex((r) => r.anim === anim && r.dir === pose.direction);
    const rowIndex = Math.max(0, rowOf(pose.anim) >= 0 ? rowOf(pose.anim) : rowOf("idle"));
    const cols = Math.max(...rows.map((r) => r.count));
    const frame = pose.frame % rows[rowIndex].count;
    const torso = this.torsoOffset(look, pose.direction);
    let body = { x: feet.x - torso, y: feet.y };
    let wingsX = feet.x;
    if (mount && scene.mount) {
      const ride = ridePlacement(mount, pose.direction, feet, scene.mount.step, scene.mount.bob);
      this.mountSprite
        .setTexture(mountKey(mount.id), ride.frame)
        .setFlipX(ride.flip)
        .setPosition(ride.mount.x, ride.mount.y)
        .setVisible(true);
      // The game puts the sit frame's centre on the seat, but a sit frame can draw
      // the body well off-centre (the Swordman's by 8 px, its sword held out to
      // one side), so the preview puts the head over the seat and the wings on it.
      const head = this.headsOf(look)[rowIndex][frame];
      body = { x: ride.rider.x - Math.round(head.x - cell.w / 2), y: ride.rider.y };
      wingsX = ride.rider.x;
    } else this.mountSprite.setVisible(false);
    this.shadow.setScale(mount ? RIDING.shadowScale.x : 1, mount ? RIDING.shadowScale.y : 1);
    this.entity.riding = !!mount;
    this.entity.sprite.x = wingsX;
    this.entity.sprite.y = body.y;
    this.body
      .setTexture(this.lookTexture(look, scene.lookDyes ?? []), rowIndex * cols + frame)
      .setOrigin(0.5, baseline / cell.h)
      .setPosition(body.x, body.y);
    this.placeAccessory(scene, rowIndex, frame, body);
    this.entity.drawWings({ visible: true, y: feet.y - FEET_OFFSET });
    if (this.animatedBackdrop) {
      this.backdropTime = scene.loop;
      this.paintBackdrop();
    }
  }

  /** Renders one scene and resolves with the frame the game drew. */
  async capture(scene: Scene): Promise<HTMLImageElement> {
    await this.ready;
    // A snapshot keeps the canvas size it was asked at, so the view changes first.
    this.setZoomOut(scene.mount && this.mounts.has(scene.mount.id) ? MOUNTED_ZOOM_OUT : 1);
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
