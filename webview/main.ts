import { CARD, FRAME, LOGO, PLATE } from "../src/card";
import { apng } from "./apng";
import { DRAWDY_SYMBOL_PNG } from "../src/brand-icons";
import type { Look, Mount, NameFrame, WingInfo } from "../src/game/types";
import { MAX_OWN_WINGS, type DriverToWebview, type SavedWing, type WebviewToDriver } from "../src/messages";
import { drawnMounts } from "./own-mounts";
import { drawnWings, isUploadId, newUploadId, readWing, uploadedWing, WING_AURAS, WING_SIZES, type OwnWing } from "./own-wings";
import { cleanName, NAME_MAX } from "../src/name";
import { drawNameplate, loadNameFont, nameplate, type NameFrameArt, type Rect } from "./nametag";
import { loadCatalog, loadImage, type Catalog } from "./live";
import { CODE_WING_STYLES, DIRECTIONS, Stage, useWingStyles, type Backdrop, type BackdropTime, type Scene } from "./stage";
import { FLAP_PERIOD_MS, poseAt, poseById, posesFor, type PoseDef } from "../src/game/poses";
import { EFFECTS, type Effect } from "../src/art/effects";
import { ACCESSORIES, ACCESSORY_ART, type Accessory } from "../src/art/accessories";
import { FRAME_GRID, FRAME_STYLES, frameById, paintFrame } from "../src/art/frames";
import { pixels, type Pixels } from "../src/art/pixels";
import { dyePixels, dyeShades, hexToHsl, hslToRgb, mainColour, type Hsl } from "../src/art/dye";
import { THEMES, type Theme } from "./themes";

// Native game pixels; CSS scales the canvas up the way the game scales its own.
const EXPORT_SCALE = 4;
const EXPORT_NATIVE = { w: FRAME.w / EXPORT_SCALE, h: FRAME.h / EXPORT_SCALE, feet: { x: FRAME.w / EXPORT_SCALE / 2, y: 70 } };
// The preview takes at most this share of the panel's height, so the options under it keep room.
const STAGE_SHARE = 0.5;
const POSES_H = 36;
const MIN_STAGE_W = 118;
const STAGE_H = 102;
const panelWidth = () => document.getElementById("root")!.clientWidth;
// Whole and half steps keep every game pixel the same size on a 2x screen.
const fitStageScale = (stageW: number) =>
  Math.max(1, Math.floor(Math.min(panelWidth() / stageW, (innerHeight * STAGE_SHARE - POSES_H) / STAGE_H) * 2) / 2);
let stageScale = fitStageScale(MIN_STAGE_W);
// Room under the feet for a name frame and the class, like the card's, and as wide as the
// panel holds at the preview's scale, so the picture fills it.
const STAGE_W = Math.floor(panelWidth() / stageScale / 2) * 2;
const STAGE_NATIVE = { w: STAGE_W, h: STAGE_H, feet: { x: STAGE_W / 2, y: 67 } };
const DRAG_STEP_PX = 26;
// The preview's engine has this long to start once the catalog is in, and placing a card
// this long to get its own engine ready, before the panel says so and offers a retry.
const STAGE_BOOT_MS = 20000;
const CARD_STAGE_MS = 20000;
// An error while the engine boots fails the boot only if the engine is still not up this much later.
const BOOT_ERROR_GRACE_MS = 2000;
const THUMB_ROW = { anim: "idle", dir: "south" };
const SAVE_NAME_MS = 400;
// The nameplate shrinks to stay this far inside the picture: the stage's
// thickest card frame, or the card's picture edge.
const PLATE_MARGIN = 1;
const insetRoom = (w: number, h: number, inset: number): Rect => ({ x: inset, y: inset, w: w - 2 * inset, h: h - 2 * inset });
const STAGE_PLATE_ROOM = insetRoom(STAGE_NATIVE.w, STAGE_NATIVE.h, Math.max(...FRAME_STYLES.map((f) => f.band)) + 1 + PLATE_MARGIN);
const CARD_PLATE_ROOM = insetRoom(EXPORT_NATIVE.w, EXPORT_NATIVE.h, PLATE_MARGIN);

const api = acquireDrawdyApi();
const send = (message: WebviewToDriver, transfer?: Transferable[]) =>
  api.postMessage(message, transfer);
let exporter: Stage | null = null;
let live: Stage | null = null;
const root = document.getElementById("root")!;

let catalog: Catalog;
let CLASS_LOOKS: Look[] = [];
let OUTFITS: Look[] = [];
let WINGS: WingInfo[] = [];
let NAME_FRAMES: NameFrame[] = [];
let MOUNTS: Mount[] = [];
const outfitsOf = (classId: string) => OUTFITS.filter((o) => o.classIds.includes(classId));

let classId = "";
let outfitId: string | null = null;
let wingsId: string | null = null;
// Each wing keeps the colour it was given.
const wingDyes = new Map<string, string>();
const wingDye = () => (wingsId ? (wingDyes.get(wingsId) ?? null) : null);
// The player's own wings, in the order they were added, and the wings the game's wing code wears for them.
let savedWings: SavedWing[] = [];
const ownWings = new Map<string, OwnWing>();
const latestBuild = new Map<string, number>();
let wingVersion = 0;
let pendingWings: SavedWing[] | null = null;
// A new image replaces this wing's, or adds a wing when it is null.
let replacing: string | null = null;
const savedWingOf = (id: string | null) => savedWings.find((w) => w.id === id);
const ownWingName = (id: string) => (savedWings.length > 1 ? `ปีกของคุณ ${savedWings.findIndex((w) => w.id === id) + 1}` : "ปีกของคุณ");
const wingName = (id: string) => (isUploadId(id) ? ownWingName(id) : (WINGS.find((w) => w.id === id)?.name ?? "ปีก"));
const DYES = [
  { hex: "#e5484d", name: "แดง" },
  { hex: "#3fbf6a", name: "เขียว" },
  { hex: "#38b6f2", name: "ฟ้า" },
  { hex: "#9b5cf6", name: "ม่วง" },
  { hex: "#f472b6", name: "ชมพู" },
  { hex: "#f2f2f2", name: "ขาว" },
  { hex: "#2b2b36", name: "ดำ" },
];
const CUSTOM_DYE = "#7ec8ff";
let accessoryId: string | null = null;
// Each accessory keeps the colour it was given.
const accessoryDyes = new Map<string, string>();
const accessoryDye = () => (accessoryId ? (accessoryDyes.get(accessoryId) ?? null) : null);
// The mount ridden, set once its sheet is in the preview, and the one last picked.
let mountId: string | null = null;
let mountPicked: string | null = null;
const mountSheets = new Map<string, Promise<HTMLImageElement>>();
let nameFrameId: string | null = null;
const nameFrame = () => NAME_FRAMES.find((f) => f.id === nameFrameId);
type Background = { id: string; name: string; plate: string; theme?: Theme; effect?: Effect };
const BACKGROUNDS: Background[] = [
  ...THEMES.map((t) => ({ id: t.id, name: t.name, plate: t.plate, theme: t })),
  ...EFFECTS.map((e) => ({ id: e.id, name: e.name, plate: e.plate, effect: e })),
];
let backgroundId = BACKGROUNDS[0].id;
const background = () => BACKGROUNDS.find((b) => b.id === backgroundId) ?? BACKGROUNDS[0];
let frameId = FRAME_STYLES[0].id;
let dirIndex = Math.max(0, DIRECTIONS.indexOf("south"));
let poseId = "idle";
let busy = false;
let playerName = "";
let saveTimer: ReturnType<typeof setTimeout> | undefined;

type Child = Node | string | null | false | undefined;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false || value === null) continue;
    if (key.startsWith("on"))
      node.addEventListener(key.slice(2), value as EventListener);
    else if (key === "class") node.className = String(value);
    else if (key === "style") node.setAttribute("style", String(value));
    else if (key in node)
      (node as unknown as Record<string, unknown>)[key] = value;
    else node.setAttribute(key, String(value));
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

const plainLook = (): Look => CLASS_LOOKS.find((l) => l.classId === classId) ?? CLASS_LOOKS[0];
const look = (): Look => OUTFITS.find((o) => o.id === outfitId) ?? plainLook();
// Each look keeps the colours its clothes' parts were given.
const lookDyes = new Map<string, (string | null)[]>();
const lookDyesOf = (id: string) => lookDyes.get(id) ?? [];
const PART_NAMES = ["สีหลัก", "สีรอง", "สีที่ 3"];
const lookParts = (): Hsl[] => (catalog && live ? live.partsOf(look()) : []);
const png = (b64: string) => `data:image/png;base64,${b64}`;
// A look without the chosen pose (cast is the Mage's), or a rider, stands instead, and gets the pose back when it is chosen again.
const poseOf = (l: Look): PoseDef => {
  const poses = posesFor(l, !!mountId);
  return poses.find((p) => p.id === poseId) ?? poses.find((p) => p.id === "idle") ?? poseById("idle");
};

function sceneAt(l: Look, direction: string, t: number): Scene {
  const pose = poseOf(l);
  const f = poseAt(pose, l, direction, t, !!mountId);
  return {
    look: l,
    wings: isUploadId(wingsId) ? (ownWings.get(wingsId)?.id ?? null) : wingsId,
    dye: wingDye(),
    lookDyes: lookDyesOf(l.id),
    accessory: accessoryId,
    accessoryDye: accessoryDye(),
    mount: mountId && f.ride ? { id: mountId, ...f.ride } : null,
    pose: { direction, anim: f.anim, frame: f.frame, walking: pose.walking },
    wingMs: f.wingMs,
    loop: f.loop,
  };
}

function thumb(l: Look, size: number): HTMLElement {
  const { cell, rows } = l.sheet;
  const row = Math.max(
    0,
    rows.findIndex((r) => r.anim === THUMB_ROW.anim && r.dir === THUMB_ROW.dir),
  );
  const cols = Math.max(...rows.map((r) => r.count));
  const s = size / cell.w;
  return h("span", {
    class: "thumb",
    style: [
      `width:${size}px`,
      `height:${Math.round(cell.h * s)}px`,
      `background-image:url(${png(l.sheet.png)})`,
      `background-size:${cols * cell.w * s}px ${rows.length * cell.h * s}px`,
      `background-position:0 ${-row * cell.h * s}px`,
    ].join(";"),
  });
}

function drawFloor(ctx: CanvasRenderingContext2D, feet: { x: number; y: number }): void {
  const glow = ctx.createRadialGradient(feet.x, feet.y, 2, feet.x, feet.y, 30);
  glow.addColorStop(0, "rgba(255, 233, 166, 0.22)");
  glow.addColorStop(1, "rgba(255, 233, 166, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(feet.x, feet.y, 30, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(201, 164, 92, 0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(feet.x, feet.y, 24, 7, 0, 0, Math.PI * 2);
  ctx.stroke();
}

const effectPixels = new Map<string, Pixels>();
const phaseOf = (t: BackdropTime) => ((t.ms % t.loopMs) + t.loopMs) % t.loopMs / t.loopMs;

function paintEffect(ctx: CanvasRenderingContext2D, effect: Effect, width: number, height: number, feet: { x: number; y: number }, phase: number): void {
  const key = `${width}x${height}`;
  let px = effectPixels.get(key);
  if (!px) effectPixels.set(key, (px = pixels(width, height)));
  effect.paint(px, feet, phase);
  ctx.putImageData(new ImageData(px.data, width, height), 0, 0);
}

const stageBackdrop = (b: Background): Backdrop => (ctx, width, height, feet, time) => {
  if (b.effect) return paintEffect(ctx, b.effect, width, height, feet, phaseOf(time));
  const t = b.theme!;
  const sky = ctx.createRadialGradient(width / 2, height * 0.75, 4, width / 2, height * 0.75, width * 0.8);
  sky.addColorStop(0, t.glow);
  sky.addColorStop(0.55, t.plate);
  sky.addColorStop(1, t.edge);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255, 233, 166, 0.5)";
  for (const [x, y] of [[0.18, 0.2], [0.82, 0.14], [0.7, 0.38], [0.3, 0.44], [0.9, 0.55]]) {
    ctx.fillRect(Math.round(x * width), Math.round(y * height), 1, 1);
  }
  drawFloor(ctx, feet);
};

// The card's background is baked into every frame so a frame fully covers
// the ones beneath it whenever the board draws without animation.
const cardBackdrop = (b: Background): Backdrop => (ctx, width, height, feet, time) => {
  if (b.effect) return paintEffect(ctx, b.effect, width, height, feet, phaseOf(time));
  ctx.fillStyle = b.plate;
  ctx.fillRect(0, 0, width, height);
  drawFloor(ctx, feet);
};

function pick(tile: Look, label: string, pressed: boolean, onclick: () => void, badge?: string) {
  return h(
    "button",
    { type: "button", class: "look", title: tile.name, "aria-pressed": String(pressed), onclick },
    thumb(tile, 56),
    h("span", { class: "look-name" }, label),
    badge && h("em", {}, badge),
  );
}

function renderClasses(): void {
  document.getElementById("classes")!.replaceChildren(
    ...CLASS_LOOKS.map((c) =>
      pick(
        c,
        c.className,
        c.classId === classId,
        () => {
          classId = c.classId;
          outfitId = null;
          renderPickers();
        },
        outfitsOf(c.classId).length ? "มีชุด" : undefined,
      ),
    ),
  );
}

// A tile whose look can be dyed carries the colour its clothes were given.
function dyeable(tile: HTMLElement, l: Look): HTMLElement {
  tile.dataset.look = l.id;
  tile.append(h("i", { class: "dye-chip", "aria-hidden": "true", hidden: true }));
  return tile;
}

function renderFashion(): void {
  const plain = plainLook();
  const outfits = outfitsOf(classId);
  const withOutfits = CLASS_LOOKS.filter((c) => outfitsOf(c.classId).length).map((c) => c.className).join(", ");
  document.getElementById("fashion")!.replaceChildren(
    dyeable(
      pick(plain, "ชุดปกติ", outfitId === null, () => {
        outfitId = null;
        renderPickers();
      }),
      plain,
    ),
    ...outfits.map((o) =>
      dyeable(
        pick(
          o,
          o.name,
          outfitId === o.id,
          () => {
            outfitId = o.id;
            renderPickers();
          },
          "แฟชั่น",
        ),
        o,
      ),
    ),
    ...(outfits.length
      ? []
      : [
          h(
            "p",
            { class: "empty" },
            `${plain.className} ยังไม่มีชุดแฟชั่นในเกม`,
            h("br"),
            `ตอนนี้มีให้ ${withOutfits}`,
          ),
        ]),
  );
}

function renderPickers(): void {
  renderClasses();
  renderFashion();
  renderChoices();
  renderName();
}

function renderChoices(): void {
  if (!catalog) return;
  document
    .querySelectorAll<HTMLElement>("[data-wings]")
    .forEach((n) => n.setAttribute("aria-pressed", String((n.dataset.wings || null) === wingsId)));
  document
    .querySelectorAll<HTMLElement>("[data-name-frame]")
    .forEach((n) => n.setAttribute("aria-pressed", String((n.dataset.nameFrame || null) === nameFrameId)));
  document.querySelectorAll<HTMLElement>("[data-mount]").forEach((n) => {
    const id = n.dataset.mount || null;
    n.setAttribute("aria-pressed", String(id === mountId));
    n.setAttribute("aria-busy", String(!!id && id === mountPicked && id !== mountId));
  });
  syncWingDyes();
  syncLookDyes();
  const current = poseOf(look()).id;
  document.getElementById("poses")!.replaceChildren(
    ...posesFor(look(), !!mountId).map((p) =>
      h(
        "button",
        {
          type: "button",
          class: "pose",
          role: "radio",
          "aria-checked": String(p.id === current),
          onclick: () => {
            poseId = p.id;
            renderChoices();
          },
        },
        p.name,
      ),
    ),
  );
}

const frameArt = new Map<string, Promise<NameFrameArt>>();

function nameFrameArt(frame: NameFrame): Promise<NameFrameArt> {
  let art = frameArt.get(frame.id);
  if (!art) {
    art = Promise.all([loadImage(frame.url), frame.gemUrl ? loadImage(frame.gemUrl) : undefined]).then(([image, gem]) => ({
      frame,
      image,
      ...(gem ? { gem } : {}),
    }));
    art.catch(() => frameArt.delete(frame.id));
    frameArt.set(frame.id, art);
  }
  return art;
}

let plateDraw = 0;

// The stage's plate is drawn the way the card's is, at the screen's resolution.
function renderName(): void {
  const canvas = document.getElementById("nameplate") as HTMLCanvasElement | null;
  if (!canvas) return;
  const lines = nameplate(playerName, catalog ? plainLook().className : "");
  const frame = nameFrame();
  const draw = ++plateDraw;
  void Promise.all([loadNameFont(lines), frame && nameFrameArt(frame).catch(() => undefined)]).then(([, art]) => {
    if (draw !== plateDraw) return;
    const scale = stageScale * devicePixelRatio;
    canvas.width = Math.round(STAGE_NATIVE.w * scale);
    canvas.height = Math.round(STAGE_NATIVE.h * scale);
    drawNameplate(canvas.getContext("2d")!, lines, STAGE_NATIVE.feet, scale, STAGE_PLATE_ROOM, art);
  });
}

function onNameInput(event: Event): void {
  playerName = cleanName((event.target as HTMLInputElement).value);
  renderName();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(
    () => send({ type: "save-name", name: playerName }),
    SAVE_NAME_MS,
  );
}

const FX_THUMB = { w: 27, h: 18 };
let fxThumbs: { canvas: HTMLCanvasElement; effect: Effect }[] = [];

// A row scrolled sideways keeps its place when its tiles are drawn again.
function refill(id: string, tiles: HTMLElement[]): void {
  const row = document.getElementById(id);
  if (!row) return;
  const { scrollLeft } = row;
  row.replaceChildren(...tiles);
  row.scrollLeft = scrollLeft;
}

function renderBackgrounds(): void {
  const colours = THEMES.map((t) =>
    h(
      "button",
      { type: "button", class: "fx", title: t.name, "aria-pressed": String(t.id === backgroundId), onclick: () => setBackground(t.id, true) },
      h("span", { class: "fx-thumb", style: `background:radial-gradient(circle at 50% 70%, ${t.glow}, ${t.plate} 60%, ${t.edge})` }),
      h("span", {}, t.name),
    ),
  );
  fxThumbs = [];
  const animated = EFFECTS.map((e) => {
    const canvas = h("canvas", { width: FX_THUMB.w, height: FX_THUMB.h, class: "fx-thumb" });
    fxThumbs.push({ canvas, effect: e });
    return h(
      "button",
      { type: "button", class: "fx", title: e.name, "aria-pressed": String(e.id === backgroundId), onclick: () => setBackground(e.id, true) },
      canvas,
      h("span", {}, e.name),
    );
  });
  refill("backgrounds", [...animated, ...colours]);
}

function animateFxThumbs(now: number): void {
  const phase = (now % FLAP_PERIOD_MS.idle) / FLAP_PERIOD_MS.idle;
  for (const { canvas, effect } of fxThumbs) {
    const ctx = canvas.getContext("2d");
    if (ctx) paintEffect(ctx, effect, FX_THUMB.w, FX_THUMB.h, { x: FX_THUMB.w / 2, y: FX_THUMB.h - 3 }, phase);
  }
  requestAnimationFrame(animateFxThumbs);
}

function setBackground(id: string, save: boolean): void {
  backgroundId = (BACKGROUNDS.find((b) => b.id === id) ?? BACKGROUNDS[0]).id;
  live?.setBackdrop(stageBackdrop(background()), !!background().effect);
  renderBackgrounds();
  renderFrames();
  if (save) send({ type: "save-style", background: backgroundId });
}

function frameCanvas(scale: number): HTMLCanvasElement {
  const px = paintFrame(frameById(frameId));
  const small = h("canvas", { width: FRAME_GRID.w, height: FRAME_GRID.h });
  small.getContext("2d")!.putImageData(new ImageData(px.data, FRAME_GRID.w, FRAME_GRID.h), 0, 0);
  if (scale === 1) return small;
  const big = h("canvas", { width: FRAME_GRID.w * scale, height: FRAME_GRID.h * scale });
  const ctx = big.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, big.width, big.height);
  return big;
}

const FRAME_THUMB = { w: 48, h: 32 };

function renderFrames(): void {
  const tiles = FRAME_STYLES.map((f) => {
    const inset = f.band + 1;
    const px = paintFrame(f, { ...FRAME_THUMB, scale: 1, picture: { x: inset, y: inset, w: FRAME_THUMB.w - inset * 2, h: FRAME_THUMB.h - inset * 2 } });
    const art = h("canvas", { width: FRAME_THUMB.w, height: FRAME_THUMB.h });
    art.getContext("2d")!.putImageData(new ImageData(px.data, FRAME_THUMB.w, FRAME_THUMB.h), 0, 0);
    const thumb = h("canvas", { width: FRAME_THUMB.w, height: FRAME_THUMB.h, class: "fx-thumb" });
    const ctx = thumb.getContext("2d")!;
    ctx.fillStyle = background().plate;
    ctx.fillRect(0, 0, FRAME_THUMB.w, FRAME_THUMB.h);
    ctx.drawImage(art, 0, 0);
    return h(
      "button",
      { type: "button", class: "fx", title: f.name, "aria-pressed": String(f.id === frameId), onclick: () => setFrame(f.id, true) },
      thumb,
      h("span", {}, f.name),
    );
  });
  refill("frames", tiles);
  const style = frameById(frameId);
  const stage = document.querySelector<HTMLElement>(".stage");
  if (stage) stage.style.boxShadow = `0 10px 30px rgba(0,0,0,0.45), 0 0 18px ${style.colours.mid}40`;
  drawStageFrame();
}

function setFrame(id: string, save: boolean): void {
  frameId = frameById(id).id;
  renderFrames();
  if (save) send({ type: "save-style", frame: frameId });
}

// The chosen card frame, fitted to the preview's own pixel grid.
function drawStageFrame(): void {
  const canvas = document.getElementById("stage-frame-art") as HTMLCanvasElement | null;
  if (!canvas) return;
  const style = frameById(frameId);
  const inset = style.band + 1;
  const { w, h } = STAGE_NATIVE;
  const px = paintFrame(style, { w, h, scale: 1, picture: { x: inset, y: inset, w: w - inset * 2, h: h - inset * 2 } });
  canvas.getContext("2d")!.putImageData(new ImageData(px.data, w, h), 0, 0);
}

const PLACE_LABEL = "✦ วางลงบอร์ด";
const PLACED_MS = 1600;
let placedTimer: ReturnType<typeof setTimeout> | undefined;

// The button shows the whole placing state inside its own box, so nothing around it moves.
function setPlacing(state: "idle" | "busy" | "placed"): void {
  busy = state === "busy";
  const button = document.querySelector<HTMLButtonElement>(".primary")!;
  button.disabled = busy;
  button.classList.toggle("busy", busy);
  button.classList.toggle("placed", state === "placed");
  button.querySelector(".primary-label")!.textContent = busy ? "กำลังวางลงบอร์ด…" : state === "placed" ? "✓ วางแล้ว" : PLACE_LABEL;
  clearTimeout(placedTimer);
  if (state === "placed") placedTimer = setTimeout(() => setPlacing("idle"), PLACED_MS);
}

function showPlaceError(message: string | null): void {
  const node = document.getElementById("place-error")!;
  node.textContent = message ?? "";
  node.hidden = !message;
}

let logoImage: Promise<HTMLImageElement> | null = null;
const drawdyLogo = () =>
  (logoImage ??= (async () => {
    const image = new Image();
    image.src = png(DRAWDY_SYMBOL_PNG);
    await image.decode();
    return image;
  })());

const dataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/** Every frame of the pose as the whole card, plate, frame and picture, in one animated PNG. */
async function exportCard(l: Look): Promise<string> {
  exporter ??= new Stage({
    parent: document.getElementById("exporter")!,
    width: EXPORT_NATIVE.w,
    height: EXPORT_NATIVE.h,
    feet: EXPORT_NATIVE.feet,
    looks: catalog.looks,
    wingTextures: catalog.wingTextures,
    backdrop: cardBackdrop(background()),
  });
  await withTimeout(exporter.ready, CARD_STAGE_MS, "ทำภาพการ์ดไม่ทัน ลองวางอีกครั้ง");
  exporter.setBackdrop(cardBackdrop(background()), !!background().effect);
  const own = isUploadId(wingsId) ? ownWings.get(wingsId) : undefined;
  if (own) await exporter.useWing(own.id, own.style);
  const mount = MOUNTS.find((m) => m.id === mountId);
  if (mount) await exporter.useMount(mount, await mountSheet(mount));
  const direction = DIRECTIONS[dirIndex];
  const { cardFrames, loopMs } = poseOf(l);
  const lines = nameplate(playerName, plainLook().className);
  await loadNameFont(lines);
  const frame = nameFrame();
  const art = frame ? await nameFrameArt(frame) : undefined;
  const logo = await drawdyLogo();
  const overlay = frameCanvas(FRAME_GRID.scale);
  const frames: Uint8ClampedArray[] = [];
  for (let k = 0; k < cardFrames; k++) {
    const shot = await exporter.capture(sceneAt(l, direction, (k * loopMs) / cardFrames));
    const card = h("canvas", { width: CARD.w, height: CARD.h });
    const ctx = card.getContext("2d")!;
    ctx.fillStyle = background().plate;
    ctx.beginPath();
    ctx.roundRect(PLATE.inset, PLATE.inset, CARD.w - PLATE.inset * 2, CARD.h - PLATE.inset * 2, PLATE.radius);
    ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(overlay, 0, 0);
    ctx.translate(CARD.pad, CARD.pad);
    ctx.drawImage(shot, 0, 0, FRAME.w, FRAME.h);
    drawNameplate(ctx, lines, EXPORT_NATIVE.feet, EXPORT_SCALE, CARD_PLATE_ROOM, art);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(logo, LOGO.x, LOGO.y, LOGO.w, LOGO.h);
    frames.push(ctx.getImageData(0, 0, CARD.w, CARD.h).data);
  }
  const image = apng(frames, { w: CARD.w, h: CARD.h }, { num: Math.round(loopMs), den: cardFrames * 1000 });
  return dataUrl(new Blob([image], { type: "image/png" }));
}

async function placeLook(): Promise<void> {
  if (busy) return;
  setPlacing("busy");
  showPlaceError(null);
  try {
    send({ type: "place", cards: [{ image: await exportCard(look()) }] });
  } catch (err) {
    // A card engine that failed is built again on the next try.
    exporter?.destroy();
    exporter = null;
    setPlacing("idle");
    showPlaceError(errorText(err));
  }
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
// The engine's own words, after a hint a player can act on when the browser would not give it graphics.
const bootErrorText = (err: unknown) => {
  const text = errorText(err);
  return /webgl/i.test(text) ? `เบราว์เซอร์เปิดกราฟิกให้ไม่ได้ ลองปิดบอร์ดหรือแท็บอื่นที่เปิดค้างไว้ แล้วกดลองอีกครั้ง (${text})` : text;
};

const withTimeout = <T>(work: Promise<T>, ms: number, message: string): Promise<T> =>
  Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);

let loadingBox: HTMLElement | null = null;
let loadingArtFrame = 0;

function stageControls(turn: (delta: number) => void): HTMLElement[] {
  return [
    h("button", { type: "button", class: "turn left", "aria-label": "หมุนซ้าย", onclick: () => turn(1) }, "‹"),
    h("button", { type: "button", class: "turn right", "aria-label": "หมุนขวา", onclick: () => turn(-1) }, "›"),
  ];
}

const skeletons = (n: number, className: string) => Array.from({ length: n }, () => h("div", { class: `${className} skeleton`, "aria-hidden": "true" }));

function fitStage(): void {
  stageScale = fitStageScale(STAGE_NATIVE.w);
  const size = { width: `${STAGE_NATIVE.w * stageScale}px`, height: `${STAGE_NATIVE.h * stageScale}px` };
  const frame = document.getElementById("stage-frame");
  if (frame) Object.assign(frame.style, size);
  if (live?.canvas) Object.assign(live.canvas.style, size);
  renderName();
}

/** The whole panel at its final size, before the game's catalog arrives, so nothing moves when it does. */
function buildLayout(): void {
  const plate = h("canvas", { id: "nameplate", class: "nameplate", "aria-hidden": "true" });
  const frameArt = h("canvas", { id: "stage-frame-art", class: "stage-frame-art", width: STAGE_NATIVE.w, height: STAGE_NATIVE.h, "aria-hidden": "true" });
  loadingBox = h("div", { id: "stage-loading", class: "stage-loading" });
  const canvasFrame = h(
    "div",
    { id: "stage-frame", class: "stage-frame", style: `width:${STAGE_NATIVE.w * stageScale}px;height:${STAGE_NATIVE.h * stageScale}px` },
    loadingBox,
    plate,
    frameArt,
    // In the picture's corner at any size of the preview.
    h("span", { class: "drag-hint", "aria-hidden": "true" }, "ลากเพื่อหมุน"),
  );
  const host = h("div", { id: "stage-host", role: "img", "aria-label": "ตัวอย่างตัวละคร ลากซ้ายขวาเพื่อหมุน" }, canvasFrame);
  const turn = (delta: number) => {
    dirIndex = (dirIndex + delta + DIRECTIONS.length) % DIRECTIONS.length;
  };
  root.replaceChildren(
    h(
      "div",
      { class: "stage-dock" },
      h(
        "div",
        { class: "stage loading" },
        h("div", { class: "stage-view" }, host, ...stageControls(turn)),
        h("div", { id: "poses", class: "poses", role: "radiogroup", "aria-label": "ท่าทาง" }),
      ),
    ),
    h(
      "label",
      { class: "name-field" },
      h("span", {}, "ชื่อตัวละคร"),
      h("input", {
        id: "name-input",
        type: "text",
        maxLength: NAME_MAX,
        autocomplete: "off",
        placeholder: "พิมพ์ชื่อในเกมของคุณ",
        value: playerName,
        oninput: onNameInput,
      }),
    ),
    h("h2", {}, "กรอบชื่อ"),
    h("div", { id: "name-frames", class: "frames item-row", role: "radiogroup", "aria-label": "กรอบชื่อ" }, ...skeletons(6, "fx")),
    h("h2", {}, "พื้นหลัง"),
    h("div", { id: "backgrounds", class: "frames", role: "radiogroup", "aria-label": "พื้นหลัง" }),
    h("h2", {}, "กรอบการ์ด"),
    h("div", { id: "frames", class: "frames", role: "radiogroup", "aria-label": "กรอบการ์ด" }),
    h("h2", {}, "อาชีพ"),
    h("div", { id: "classes", class: "looks", role: "radiogroup", "aria-label": "อาชีพ" }, ...skeletons(5, "look")),
    h("h2", {}, "ชุดแฟชั่น"),
    h("div", { id: "fashion", class: "fashion", role: "radiogroup", "aria-label": "ชุดแฟชั่น" }, ...skeletons(2, "look")),
    dyeTray(LOOK_TRAY),
    h("h2", {}, "ปีก"),
    h("div", { id: "wings", class: "frames wings", role: "radiogroup", "aria-label": "ปีก", onscroll: () => syncDyes(WING_TRAY) }, ...skeletons(4, "wing")),
    dyeTray(WING_TRAY),
    h("p", { id: "wing-error", class: "wing-error", role: "alert", hidden: true }),
    h("input", { id: "wing-file", type: "file", accept: "image/png,image/webp,image/gif,image/jpeg", hidden: true, onchange: onWingFile }),
    h("h2", {}, "สัตว์ขี่"),
    h("div", { id: "mounts", class: "frames wings", role: "radiogroup", "aria-label": "สัตว์ขี่" }, ...skeletons(4, "wing")),
    h("p", { id: "mount-error", class: "wing-error", role: "alert", hidden: true }),
    h("h2", {}, "เครื่องประดับ"),
    h("div", { id: "accessories", class: "frames item-row", role: "radiogroup", "aria-label": "เครื่องประดับ", onscroll: () => syncDyes(ACCESSORY_TRAY) }),
    dyeTray(ACCESSORY_TRAY),
    h(
      "div",
      { class: "actions" },
      h("p", { id: "place-error", class: "place-error", role: "alert", hidden: true }),
      h("button", { type: "button", class: "primary", disabled: true, onclick: () => void placeLook() }, h("span", { class: "primary-label", role: "status" }, PLACE_LABEL)),
    ),
    h("div", { id: "exporter", class: "exporter", "aria-hidden": "true" }),
  );

  let dragX: number | null = null;
  host.addEventListener("pointerdown", (e) => {
    if (!live) return;
    dragX = e.clientX;
    host.setPointerCapture(e.pointerId);
  });
  host.addEventListener("pointermove", (e) => {
    if (dragX === null) return;
    const dx = e.clientX - dragX;
    if (Math.abs(dx) >= DRAG_STEP_PX) {
      turn(dx > 0 ? -1 : 1);
      dragX = e.clientX;
    }
  });
  const endDrag = () => (dragX = null);
  host.addEventListener("pointerup", endDrag);
  host.addEventListener("pointercancel", endDrag);

  renderName();
  renderBackgrounds();
  renderFrames();
  renderDyes(WING_TRAY);
  document.querySelector("#wing-tray .dye-rows")!.before(wingTools());
  renderDyes(LOOK_TRAY);
  renderAccessories();
  renderDyes(ACCESSORY_TRAY);
  requestAnimationFrame(animateFxThumbs);
}

/** While the catalog loads, the preview shows the chosen background at its real size with progress over it. */
function showLoading(progress: { done: number; total: number } | { error: string; title?: string }): void {
  if (!loadingBox) return;
  let art = loadingBox.querySelector<HTMLCanvasElement>("canvas");
  if (!art) {
    art = h("canvas", { class: "stage-loading-art", width: STAGE_NATIVE.w, height: STAGE_NATIVE.h });
    const paint = (now: number) => {
      if (!loadingBox?.isConnected) return;
      stageBackdrop(background())(art!.getContext("2d")!, STAGE_NATIVE.w, STAGE_NATIVE.h, STAGE_NATIVE.feet, { ms: now, loopMs: FLAP_PERIOD_MS.idle });
      loadingArtFrame = requestAnimationFrame(paint);
    };
    loadingArtFrame = requestAnimationFrame(paint);
  }
  const panel =
    "error" in progress
      ? h(
          "div",
          { class: "stage-loading-panel" },
          h("p", { class: "stage-loading-title" }, progress.title ?? "โหลดข้อมูลชุดจาก Lumivara ไม่ได้"),
          h("p", { class: "stage-loading-detail" }, progress.error),
          h("button", { type: "button", class: "retry", onclick: () => void load() }, "ลองอีกครั้ง"),
        )
      : h(
          "div",
          { class: "stage-loading-panel" },
          h("p", { class: "stage-loading-title" }, "กำลังโหลดชุดจาก Lumivara…"),
          h("div", { class: "boot-bar" }, h("span", { class: "boot-fill", style: `width:${progress.total ? (progress.done / progress.total) * 100 : 0}%` })),
          h("p", { class: "stage-loading-detail" }, progress.total ? `${progress.done}/${progress.total}` : " "),
        );
  loadingBox.replaceChildren(art, panel);
}

function startStage(): void {
  const canvasFrame = document.getElementById("stage-frame")!;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const liveStage = new Stage({
    parent: canvasFrame,
    width: STAGE_NATIVE.w,
    height: STAGE_NATIVE.h,
    feet: STAGE_NATIVE.feet,
    looks: catalog.looks,
    wingTextures: catalog.wingTextures,
    backdrop: stageBackdrop(background()),
    frame: (now) => sceneAt(look(), DIRECTIONS[dirIndex], reduced ? 0 : now),
  });
  live = liveStage;
  liveStage.setBackdrop(stageBackdrop(background()), !!background().effect);
  let up = false;
  const fail = (reason: unknown) => {
    if (up || live !== liveStage) return;
    stopWatching();
    showLoading({ error: bootErrorText(reason), title: "เปิดตัวอย่างตัวละครไม่ได้" });
  };
  const onError = (e: ErrorEvent) => setTimeout(() => fail(e.error ?? e.message), BOOT_ERROR_GRACE_MS);
  const onRejection = (e: PromiseRejectionEvent) => setTimeout(() => fail(e.reason), BOOT_ERROR_GRACE_MS);
  const watchdog = setTimeout(() => fail(`ตัวอย่างไม่ขึ้นภายใน ${STAGE_BOOT_MS / 1000} วินาที ลองปิดบอร์ดหรือแท็บอื่นที่เปิดค้างไว้ แล้วลองอีกครั้ง`), STAGE_BOOT_MS);
  function stopWatching(): void {
    clearTimeout(watchdog);
    removeEventListener("error", onError);
    removeEventListener("unhandledrejection", onRejection);
  }
  addEventListener("error", onError);
  addEventListener("unhandledrejection", onRejection);
  void liveStage.ready.then(() => {
    if (live !== liveStage) return;
    up = true;
    stopWatching();
    // Neither may keep the cover down: the preview works without them.
    try {
      fitStage();
      syncLookDyes();
    } catch (err) {
      console.error(err);
    }
    // One more frame so the character is drawn before the loading cover lifts.
    requestAnimationFrame(() => {
      document.querySelector(".stage")?.classList.remove("loading");
      loadingBox?.classList.add("done");
      setTimeout(() => {
        cancelAnimationFrame(loadingArtFrame);
        loadingBox?.remove();
        loadingBox = null;
      }, 300);
    });
  });
}

function renderWings(): void {
  document.getElementById("wings")!.replaceChildren(
    h(
      "button",
      {
        type: "button",
        class: "wing",
        "data-wings": "",
        onclick: () => setWings(null),
      },
      h("span", { class: "none" }, "ไม่ใส่"),
    ),
    ...WINGS.map((w) =>
      h(
        "button",
        {
          type: "button",
          class: "wing",
          "data-wings": w.id,
          title: w.description,
          onclick: () => setWings(w.id),
        },
        w.icon && h("img", { src: w.icon, alt: "", width: 36, height: 36, "data-icon": w.icon }),
        h("span", {}, w.name),
        h("i", { class: "dye-chip", "aria-hidden": "true", hidden: true }),
      ),
    ),
    ...savedWings.map((saved) => {
      const icon = ownWings.get(saved.id)?.info.icon;
      return h(
        "button",
        {
          type: "button",
          class: "wing",
          "data-wings": saved.id,
          title: "ปีกจากรูปของคุณ: ลากรูปใหม่มาวางเพื่อเปลี่ยนรูป",
          onclick: () => setWings(saved.id),
          ondragover: (e: DragEvent) => e.preventDefault(),
          ondrop: (e: DragEvent) => dropWing(e, saved.id),
        },
        icon ? h("img", { src: icon, alt: "", width: 36, height: 36, "data-icon": icon }) : h("span", { class: "wing-plus", "aria-hidden": "true" }, "…"),
        h("span", {}, ownWingName(saved.id)),
        h("i", { class: "dye-chip", "aria-hidden": "true", hidden: true }),
      );
    }),
    h(
      "button",
      {
        type: "button",
        class: "wing",
        title: "เพิ่มปีกจากรูปของคุณ: กดเพื่อเลือกรูป หรือลากรูปมาวางตรงนี้",
        onclick: () => pickWingFile(null),
        ondragover: (e: DragEvent) => e.preventDefault(),
        ondrop: (e: DragEvent) => dropWing(e, null),
      },
      h("span", { class: "wing-plus", "aria-hidden": "true" }, "+"),
      h("span", {}, "เพิ่มปีก"),
    ),
  );
}

function setWings(id: string | null): void {
  wingsId = id;
  renderChoices();
}

function renderMounts(): void {
  document.getElementById("mounts")!.replaceChildren(
    h("button", { type: "button", class: "wing", "data-mount": "", onclick: () => void setMount(null) }, h("span", { class: "none" }, "ไม่ขี่")),
    ...MOUNTS.map((m) =>
      h(
        "button",
        { type: "button", class: "wing", "data-mount": m.id, title: m.description, onclick: () => void setMount(m.id) },
        // A drawn mount's tile is its whole first frame, smoothed down to the tile.
        m.icon && h("img", { src: m.icon, alt: "", width: 36, height: 36, class: m.icon.startsWith("data:") ? "smooth" : undefined }),
        h("span", {}, m.name),
      ),
    ),
  );
}

function showMountError(message: string | null): void {
  const node = document.getElementById("mount-error")!;
  node.textContent = message ?? "";
  node.hidden = !message;
}

function mountSheet(mount: Mount): Promise<HTMLImageElement> {
  let sheet = mountSheets.get(mount.id);
  if (!sheet) {
    sheet = loadImage(mount.sheet);
    sheet.catch(() => mountSheets.delete(mount.id));
    mountSheets.set(mount.id, sheet);
  }
  return sheet;
}

/** Puts the character on a mount once its sheet is in the preview; the latest pick wins. */
async function setMount(id: string | null): Promise<void> {
  const mount = MOUNTS.find((m) => m.id === id);
  mountPicked = mount ? mount.id : null;
  showMountError(null);
  if (!mount || !live) {
    mountId = null;
    renderChoices();
    return;
  }
  renderChoices();
  try {
    await live.useMount(mount, await mountSheet(mount));
    if (mountPicked !== mount.id) return;
    mountId = mount.id;
  } catch (err) {
    if (mountPicked !== mount.id) return;
    mountPicked = mountId;
    showMountError(`โหลด ${mount.name} จาก Lumivara ไม่ได้ (${errorText(err)})`);
  }
  renderChoices();
}

function showWingError(message: string | null): void {
  const node = document.getElementById("wing-error")!;
  node.textContent = message ?? "";
  node.hidden = !message;
}

function pickWingFile(id: string | null): void {
  replacing = id;
  (document.getElementById("wing-file") as HTMLInputElement).click();
}

function onWingFile(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  void takeWingFile(file, replacing);
}

function dropWing(event: DragEvent, id: string | null): void {
  event.preventDefault();
  void takeWingFile(event.dataTransfer?.files[0], id);
}


async function takeWingFile(file: File | undefined, id: string | null): Promise<void> {
  if (!file || !live) return;
  if (!file.type.startsWith("image/")) return showWingError("ใช้ไฟล์รูปภาพ เช่น PNG หรือ JPG");
  const old = savedWingOf(id);
  if (!old && savedWings.length >= MAX_OWN_WINGS) return showWingError(`เก็บปีกของคุณได้ ${MAX_OWN_WINGS} แบบ เอาปีกที่ไม่ใช้ออกก่อน`);
  try {
    const png = await readWing(file);
    await wearWing(old ? { ...old, png, flip: false } : { id: newUploadId(), png, aura: "gold", size: "m", flip: false }, { wear: true, save: true });
  } catch (err) {
    showWingError(errorText(err));
  }
}

const sendWings = () => send({ type: "save-wings", wings: savedWings });

/** Builds one of the player's wings and gives it to the game's wing code; only its latest change is kept. */
async function wearWing(saved: SavedWing, then: { wear: boolean; save: boolean }): Promise<void> {
  const version = ++wingVersion;
  latestBuild.set(saved.id, version);
  showWingError(null);
  const wing = await uploadedWing(saved, version);
  await live!.useWing(wing.id, wing.style);
  if (latestBuild.get(saved.id) !== version) return;
  const at = savedWings.findIndex((w) => w.id === saved.id);
  if (at >= 0) savedWings[at] = saved;
  else if (then.save) savedWings.push(saved);
  else return;
  ownWings.set(saved.id, wing);
  if (then.wear) wingsId = saved.id;
  renderWings();
  renderChoices();
  if (then.save) sendWings();
}

function changeWing(change: Partial<SavedWing>): void {
  const saved = savedWingOf(wingsId);
  if (saved) wearWing({ ...saved, ...change }, { wear: true, save: true }).catch((err) => showWingError(errorText(err)));
}

function removeWing(): void {
  const id = wingsId;
  if (!isUploadId(id)) return;
  latestBuild.delete(id);
  savedWings = savedWings.filter((w) => w.id !== id);
  ownWings.delete(id);
  wingDyes.delete(id);
  wingsId = null;
  sendWings();
  renderWings();
  renderChoices();
}

/** Puts back the wings saved in this browser, as tiles first and then each with its art. */
function restoreWings(wings: SavedWing[]): void {
  savedWings = wings.slice(0, MAX_OWN_WINGS);
  renderWings();
  for (const saved of savedWings) wearWing(saved, { wear: false, save: false }).catch(() => {});
}

// Built once, inside the wing tray, for the player's own wing.
function wingTools(): HTMLElement {
  const tool = (label: string, attrs: Record<string, unknown>, onclick: () => void) => h("button", { type: "button", class: "pose", ...attrs, onclick }, label);
  return h(
    "div",
    { id: "wing-tools", class: "wing-tools", hidden: true },
    h(
      "div",
      { class: "wing-tool-row" },
      tool("เปลี่ยนรูป", {}, () => pickWingFile(wingsId)),
      tool("กลับด้าน", { role: "switch", "data-wing-flip": "" }, () => changeWing({ flip: !savedWingOf(wingsId)?.flip })),
      tool("เอาออก", {}, removeWing),
    ),
    h("div", { class: "wing-tool-row", role: "radiogroup", "aria-label": "ขนาดปีก" }, ...WING_SIZES.map((s) => tool(s.name, { role: "radio", "data-wing-size": s.id }, () => changeWing({ size: s.id })))),
    h("div", { class: "wing-tool-row", role: "radiogroup", "aria-label": "แสงของปีก" }, ...WING_AURAS.map((a) => tool(a.name, { role: "radio", "data-wing-aura": a.id }, () => changeWing({ aura: a.id })))),
    h("p", { class: "wing-tool-hint" }, "ใช้รูปปีกข้างเดียวที่กางไปทางขวา โคนปีกอยู่ซ้าย พื้นหลังโปร่งใสหรือสีเรียบ"),
  );
}

function syncWingTools(): void {
  const tools = document.getElementById("wing-tools");
  if (!tools) return;
  const saved = savedWingOf(wingsId);
  tools.hidden = !saved;
  tools.querySelectorAll<HTMLElement>("[data-wing-size]").forEach((n) => n.setAttribute("aria-checked", String(n.dataset.wingSize === saved?.size)));
  tools.querySelectorAll<HTMLElement>("[data-wing-aura]").forEach((n) => n.setAttribute("aria-checked", String(n.dataset.wingAura === saved?.aura)));
  tools.querySelector("[data-wing-flip]")?.setAttribute("aria-checked", String(!!saved?.flip));
}

const iconDyes = new Map<string, Promise<string>>();

function dyedIcon(url: string, hex: string): Promise<string> {
  const key = `${url}~${hex}`;
  let made = iconDyes.get(key);
  if (!made) {
    made = loadImage(url).then((image) => {
      const canvas = h("canvas", { width: image.naturalWidth, height: image.naturalHeight });
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      dyePixels(data.data, mainColour(data.data), hexToHsl(hex));
      ctx.putImageData(data, 0, 0);
      return canvas.toDataURL();
    });
    made.catch(() => iconDyes.delete(key));
    iconDyes.set(key, made);
  }
  return made;
}

function paintWingTile(tile: HTMLElement): void {
  const id = tile.dataset.wings;
  const dye = id ? wingDyes.get(id) : undefined;
  const chip = tile.querySelector<HTMLElement>(".dye-chip");
  if (chip) {
    chip.hidden = !dye;
    chip.style.background = dye ?? "";
  }
  const img = tile.querySelector<HTMLImageElement>("img[data-icon]");
  if (!img) return;
  const icon = img.dataset.icon!;
  if (!dye) {
    img.src = icon;
    return;
  }
  void dyedIcon(icon, dye).then(
    (src) => {
      if (wingDyes.get(id!) === dye) img.src = src;
    },
    () => {},
  );
}

/** One row of colour swatches; a look's parts each get one, named after the part. */
type Swatches = {
  id: string;
  label: string;
  current: () => string | null;
  set: (hex: string | null) => void;
  part?: string;
};

/** Rows of swatches in a tray pointing at the tile they colour. */
type DyeTray = {
  tray: string;
  rows: () => Swatches[];
  tile: () => HTMLElement | null;
  /** The tray's heading, or null while there is nothing to colour. */
  title: () => string | null;
};

const WING_TRAY: DyeTray = {
  tray: "wing-tray",
  rows: () => [{ id: "wing-dyes", label: "สีปีก", current: wingDye, set: setWingDye }],
  tile: () => (wingsId ? document.querySelector<HTMLElement>(`[data-wings="${wingsId}"]`) : null),
  title: () => (wingsId ? `สีของ ${wingName(wingsId)}` : null),
};

const hexOf = (c: Hsl) => `#${hslToRgb(c).map((v) => v.toString(16).padStart(2, "0")).join("")}`;

const LOOK_TRAY: DyeTray = {
  tray: "look-tray",
  rows: () =>
    lookParts().map((part, k) => ({
      id: `look-dyes-${k}`,
      label: PART_NAMES[k],
      part: hexOf(part),
      current: () => lookDyesOf(look().id)[k] ?? null,
      set: (hex) => setLookDye(k, hex),
    })),
  tile: () => (catalog ? document.querySelector<HTMLElement>(`[data-look="${look().id}"]`) : null),
  title: () => (lookParts().length ? `สีของ ${outfitId ? look().name : "ชุดปกติ"}` : null),
};

const ACCESSORY_TRAY: DyeTray = {
  tray: "accessory-tray",
  rows: () => [{ id: "accessory-dyes", label: "สีเครื่องประดับ", current: accessoryDye, set: setAccessoryDye }],
  tile: () => (accessoryId ? document.querySelector<HTMLElement>(`[data-accessory="${accessoryId}"]`) : null),
  title: () => (accessoryId ? `สีของ ${ACCESSORIES.find((a) => a.id === accessoryId)?.name ?? "เครื่องประดับ"}` : null),
};

// The caret stays this far inside the tray when its tile is scrolled out of view.
const CARET_INSET = 14;

const dyeTray = (t: DyeTray) =>
  h(
    "div",
    { id: t.tray, class: "dye-tray", hidden: true },
    h("p", { class: "dye-tray-head" }, h("span", { class: "dye-tray-title" })),
    h("div", { class: "dye-rows" }),
  );

const swatchRow = (row: Swatches) =>
  h(
    "div",
    { class: "dye-part" },
    row.part && h("p", { class: "dye-part-name" }, h("i", { class: "dye-part-chip", style: `background:${row.part}`, "aria-hidden": "true" }), row.label),
    h(
      "div",
      { id: row.id, class: "swatches", role: "radiogroup", "aria-label": row.label },
      h("button", { type: "button", class: "swatch swatch-none", title: "สีเดิม", "aria-label": "สีเดิม", "data-dye": "", onclick: () => row.set(null) }),
      ...DYES.map((d) =>
        h("button", { type: "button", class: "swatch", title: d.name, "aria-label": d.name, "data-dye": d.hex, style: `background:${d.hex}`, onclick: () => row.set(d.hex) }),
      ),
      h(
        "label",
        { class: "swatch swatch-custom", title: "เลือกสีเอง", "data-dye": "custom" },
        h("input", { type: "color", value: CUSTOM_DYE, "aria-label": "เลือกสีเอง", oninput: (e: Event) => row.set((e.target as HTMLInputElement).value) }),
      ),
    ),
  );

// Built only when its rows change: re-rendering would close the colour picker while it is being dragged.
function renderDyes(t: DyeTray): void {
  document.querySelector(`#${t.tray} .dye-rows`)?.replaceChildren(...t.rows().map(swatchRow));
  syncDyes(t);
}

/** Marks the chosen colours on the tray's swatches and points the tray at the tile it colours. */
function syncDyes(t: DyeTray): void {
  for (const row of t.rows()) {
    const dye = row.current();
    const custom = dye !== null && !DYES.some((d) => d.hex === dye);
    document.querySelectorAll<HTMLElement>(`#${row.id} [data-dye]`).forEach((n) => {
      const pressed = n.dataset.dye === "custom" ? custom : (n.dataset.dye || null) === dye;
      n.setAttribute("aria-pressed", String(pressed));
      if (n.dataset.dye === "custom") n.style.background = custom ? dye! : "";
    });
  }
  const tray = document.getElementById(t.tray);
  if (!tray) return;
  const title = t.title();
  tray.hidden = !title;
  const tile = t.tile();
  if (!title || !tile) return;
  const box = tray.getBoundingClientRect();
  const at = tile.getBoundingClientRect();
  tray.style.setProperty("--caret-x", `${Math.min(box.width - CARET_INSET, Math.max(CARET_INSET, at.left + at.width / 2 - box.left))}px`);
  tray.querySelector(".dye-tray-title")!.textContent = title;
}

function syncWingDyes(): void {
  syncWingTools();
  syncDyes(WING_TRAY);
  document.querySelectorAll<HTMLElement>("[data-wings]").forEach(paintWingTile);
}

let lookRows = "";

function syncLookDyes(): void {
  const rows = catalog ? `${look().id}:${lookParts().length}` : "";
  if (rows !== lookRows) {
    lookRows = rows;
    renderDyes(LOOK_TRAY);
  } else syncDyes(LOOK_TRAY);
  document.querySelectorAll<HTMLElement>("[data-look]").forEach((tile) => {
    const chip = tile.querySelector<HTMLElement>(".dye-chip");
    const dye = lookDyesOf(tile.dataset.look!).find(Boolean);
    if (!chip) return;
    chip.hidden = !dye;
    chip.style.background = dye ?? "";
  });
}

function setLookDye(part: number, hex: string | null): void {
  if (!catalog) return;
  const dyes = [...lookDyesOf(look().id)];
  dyes[part] = hex;
  if (dyes.some(Boolean)) lookDyes.set(look().id, Array.from(dyes, (d) => d ?? null));
  else lookDyes.delete(look().id);
  syncLookDyes();
}

function setWingDye(hex: string | null): void {
  if (!wingsId) return;
  if (hex) wingDyes.set(wingsId, hex);
  else wingDyes.delete(wingsId);
  syncWingDyes();
}


const ACCESSORY_THUMB = { size: 36, headW: 16 };

// The accessory alone, cropped to its pixels and scaled up by whole pixels.
function accessoryThumb(accessory: Accessory, dye: string | null = null): HTMLCanvasElement {
  const px = pixels(ACCESSORY_ART.w, ACCESSORY_ART.h);
  accessory.paint(px, ACCESSORY_THUMB.headW, 1);
  if (dye) dyeShades(px.data, accessory.body, hexToHsl(dye));
  let [left, top, right, bottom] = [px.w, px.h, -1, -1];
  for (let y = 0; y < px.h; y++) {
    for (let x = 0; x < px.w; x++) {
      if (!px.data[(y * px.w + x) * 4 + 3]) continue;
      [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x), Math.max(bottom, y)];
    }
  }
  const art = h("canvas", { width: px.w, height: px.h });
  art.getContext("2d")!.putImageData(new ImageData(px.data, px.w, px.h), 0, 0);
  const [cw, ch] = [right - left + 1, bottom - top + 1];
  const scale = Math.max(1, Math.floor(ACCESSORY_THUMB.size / Math.max(cw, ch)));
  const thumb = h("canvas", { width: ACCESSORY_THUMB.size, height: ACCESSORY_THUMB.size, class: "acc-thumb" });
  const ctx = thumb.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(art, left, top, cw, ch, Math.floor((ACCESSORY_THUMB.size - cw * scale) / 2), Math.floor((ACCESSORY_THUMB.size - ch * scale) / 2), cw * scale, ch * scale);
  return thumb;
}

function renderAccessories(): void {
  document.getElementById("accessories")!.replaceChildren(
    h(
      "button",
      { type: "button", class: "fx", "data-accessory": "", onclick: () => setAccessory(null) },
      h("span", { class: "fx-none", "aria-hidden": "true" }),
      h("span", {}, "ไม่ใส่"),
    ),
    ...ACCESSORIES.map((a) =>
      h(
        "button",
        { type: "button", class: "fx", "data-accessory": a.id, "data-dyed": "", onclick: () => setAccessory(a.id) },
        accessoryThumb(a),
        h("span", {}, a.name),
        h("i", { class: "dye-chip", "aria-hidden": "true", hidden: true }),
      ),
    ),
  );
  syncAccessories();
}

/** Marks the chosen accessory and shows each in the colour it was given. */
function syncAccessories(): void {
  document.querySelectorAll<HTMLElement>("[data-accessory]").forEach((n) => {
    n.setAttribute("aria-pressed", String((n.dataset.accessory || null) === accessoryId));
    const accessory = ACCESSORIES.find((a) => a.id === n.dataset.accessory);
    const dye = accessory ? (accessoryDyes.get(accessory.id) ?? "") : "";
    if (!accessory || n.dataset.dyed === dye) return;
    n.dataset.dyed = dye;
    n.querySelector(".acc-thumb")?.replaceWith(accessoryThumb(accessory, dye || null));
    const chip = n.querySelector<HTMLElement>(".dye-chip")!;
    chip.hidden = !dye;
    chip.style.background = dye;
  });
  syncDyes(ACCESSORY_TRAY);
}

function setAccessoryDye(hex: string | null): void {
  if (!accessoryId) return;
  if (hex) accessoryDyes.set(accessoryId, hex);
  else accessoryDyes.delete(accessoryId);
  syncAccessories();
}

function setAccessory(id: string | null): void {
  accessoryId = id;
  syncAccessories();
}

function setNameFrame(id: string | null): void {
  nameFrameId = id;
  renderChoices();
  renderName();
}

function renderNameFrames(): void {
  document.getElementById("name-frames")!.replaceChildren(
    h(
      "button",
      { type: "button", class: "fx", "data-name-frame": "", onclick: () => setNameFrame(null) },
      h("span", { class: "fx-none", "aria-hidden": "true" }),
      h("span", {}, "ไม่ใส่"),
    ),
    ...NAME_FRAMES.map((f) =>
      h(
        "button",
        { type: "button", class: "fx", "data-name-frame": f.id, title: f.description, onclick: () => setNameFrame(f.id) },
        f.icon ? h("img", { src: f.icon, alt: "", width: 36, height: 36 }) : h("span", { class: "fx-none", "aria-hidden": "true" }),
        h("span", {}, f.name),
      ),
    ),
  );
}

/** Clears a preview that failed to start, so a retry begins from a clean stage. */
function resetStages(): void {
  live?.destroy();
  exporter?.destroy();
  live = null;
  exporter = null;
}

async function load(): Promise<void> {
  resetStages();
  showLoading({ done: 0, total: 0 });
  try {
    catalog = await loadCatalog(CODE_WING_STYLES, DIRECTIONS, (done, total) => showLoading({ done, total }));
  } catch (err) {
    showLoading({ error: errorText(err) });
    return;
  }
  try {
    openRoom();
  } catch (err) {
    showLoading({ error: bootErrorText(err), title: "เปิดห้องแต่งตัวไม่ได้" });
  }
}

function openRoom(): void {
  const own = drawnWings();
  useWingStyles({ ...catalog.styles, ...Object.fromEntries(own.map((w) => [w.id, w.style])) });
  Object.assign(catalog.wingTextures, ...own.map((w) => w.textures));
  CLASS_LOOKS = catalog.looks.filter((l) => l.kind === "class");
  OUTFITS = catalog.looks.filter((l) => l.kind === "outfit");
  WINGS = [...catalog.wings, ...own.map((w) => w.info)];
  NAME_FRAMES = catalog.nameFrames;
  MOUNTS = [...catalog.mounts, ...drawnMounts()];
  mountId = mountPicked = null;
  classId = OUTFITS[0]?.classId ?? CLASS_LOOKS[0].classId;
  outfitId = OUTFITS[0]?.id ?? null;
  wingsId = WINGS[0]?.id ?? null;
  startStage();
  const wings = pendingWings ?? (savedWings.length ? savedWings : null);
  pendingWings = null;
  if (wings) restoreWings(wings);
  renderWings();
  renderMounts();
  renderNameFrames();
  renderPickers();
  document.querySelector<HTMLButtonElement>(".primary")!.disabled = false;
}

api.onMessage((raw) => {
  const message = raw as DriverToWebview;
  if (message.type === "profile") {
    if (message.background) setBackground(message.background, false);
    if (message.frame) setFrame(message.frame, false);
    if (message.wings?.length && !savedWings.length) {
      if (live) restoreWings(message.wings);
      else pendingWings = message.wings;
    }
    const input = document.getElementById("name-input") as HTMLInputElement | null;
    if (!message.name || (input ? input.value : playerName)) return;
    playerName = cleanName(message.name);
    if (input) {
      input.value = playerName;
      renderName();
    }
  } else if (message.type === "placed") {
    setPlacing("placed");
  } else if (message.type === "error") {
    setPlacing("idle");
    showPlaceError(message.message);
  }
});

buildLayout();
addEventListener("resize", () => {
  fitStage();
  syncWingDyes();
  syncLookDyes();
  syncDyes(ACCESSORY_TRAY);
});
send({ type: "ready" });
void load();
