import { FRAME, LOGO } from "../src/card";
import { DRAWDY_SYMBOL_PNG } from "../src/brand-icons";
import type { Look, NameFrame, WingInfo } from "../src/game/types";
import type {
  CardPayload,
  DriverToWebview,
  WebviewToDriver,
} from "../src/messages";
import { cleanName, NAME_MAX } from "../src/name";
import { drawNameplate, loadNameFont, nameplate, type NameFrameArt, type Rect } from "./nametag";
import { loadCatalog, loadImage, type Catalog } from "./live";
import { CODE_WING_STYLES, DIRECTIONS, Stage, useWingStyles, type Backdrop, type BackdropTime, type Scene } from "./stage";
import { FLAP_PERIOD_MS, poseAt, poseById, posesFor, type PoseDef } from "../src/game/poses";
import { EFFECTS, type Effect } from "../src/art/effects";
import { FRAME_GRID, FRAME_STYLES, frameById, paintFrame } from "../src/art/frames";
import { pixels, type Pixels } from "../src/art/pixels";
import { THEMES, type Theme } from "./themes";

// Native game pixels; CSS scales the canvas up the way the game scales its own.
const EXPORT_SCALE = 4;
const EXPORT_NATIVE = { w: FRAME.w / EXPORT_SCALE, h: FRAME.h / EXPORT_SCALE, feet: { x: FRAME.w / EXPORT_SCALE / 2, y: 67 } };
// As tall as the card's picture, with the feet at the same height, so a name frame has the card's room under them.
const STAGE_NATIVE = { w: 118, h: EXPORT_NATIVE.h, feet: { x: 59, y: EXPORT_NATIVE.feet.y } };
const STAGE_SCALE_CSS = 2.5;
const AUTO_TURN_MS = 1400;
const DRAG_STEP_PX = 26;
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
const outfitsOf = (classId: string) => OUTFITS.filter((o) => o.classIds.includes(classId));

let classId = "";
let outfitId: string | null = null;
let wingsId: string | null = null;
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
let autoTurn = true;
let lastTurn = 0;
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
const png = (b64: string) => `data:image/png;base64,${b64}`;
// A look without the chosen pose (cast is the Mage's) stands instead, and gets the pose back when it is chosen again.
const poseOf = (l: Look): PoseDef => posesFor(l).find((p) => p.id === poseId) ?? poseById("idle");

function sceneAt(l: Look, direction: string, t: number): Scene {
  const pose = poseOf(l);
  const f = poseAt(pose, l, direction, t);
  return {
    look: l,
    wings: wingsId,
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

function renderFashion(): void {
  const plain = plainLook();
  const outfits = outfitsOf(classId);
  const withOutfits = CLASS_LOOKS.filter((c) => outfitsOf(c.classId).length).map((c) => c.className).join(", ");
  document.getElementById("fashion")!.replaceChildren(
    pick(plain, "ชุดปกติ", outfitId === null, () => {
      outfitId = null;
      renderPickers();
    }),
    ...outfits.map((o) =>
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
  const current = poseOf(look()).id;
  document.getElementById("poses")!.replaceChildren(
    ...posesFor(look()).map((p) =>
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
    const scale = STAGE_SCALE_CSS * devicePixelRatio;
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

function renderBackgrounds(): void {
  const colours = THEMES.map((t) =>
    h("button", {
      type: "button",
      class: "swatch",
      title: t.name,
      "aria-label": t.name,
      "aria-pressed": String(t.id === backgroundId),
      style: `background:radial-gradient(circle at 50% 70%, ${t.glow}, ${t.plate} 60%, ${t.edge})`,
      onclick: () => setBackground(t.id, true),
    }),
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
  document.getElementById("backgrounds")?.replaceChildren(
    h("div", { class: "swatches", role: "radiogroup", "aria-label": "สีพื้นหลัง" }, ...colours),
    h("div", { class: "fx-row", role: "radiogroup", "aria-label": "พื้นหลังเคลื่อนไหว" }, ...animated),
  );
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
  document.getElementById("frames")?.replaceChildren(...tiles);
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

async function frameOverlay(): Promise<ArrayBuffer | undefined> {
  const blob = await new Promise<Blob | null>((resolve) => frameCanvas(FRAME_GRID.scale).toBlob(resolve, "image/png"));
  return blob ? blob.arrayBuffer() : undefined;
}

function setStatus(text: string, error = false): void {
  const node = document.getElementById("status")!;
  node.textContent = text;
  node.className = `status${error ? " error" : ""}`;
}

function setBusy(next: boolean): void {
  busy = next;
  document
    .querySelectorAll<HTMLButtonElement>(".actions button")
    .forEach((b) => (b.disabled = next));
}

let logoImage: Promise<HTMLImageElement> | null = null;
const drawdyLogo = () =>
  (logoImage ??= (async () => {
    const image = new Image();
    image.src = png(DRAWDY_SYMBOL_PNG);
    await image.decode();
    return image;
  })());

async function exportFrames(l: Look): Promise<{ frames: ArrayBuffer[]; loopMs: number }> {
  exporter ??= new Stage({
    parent: document.getElementById("exporter")!,
    width: EXPORT_NATIVE.w,
    height: EXPORT_NATIVE.h,
    feet: EXPORT_NATIVE.feet,
    looks: catalog.looks,
    wingTextures: catalog.wingTextures,
    backdrop: cardBackdrop(background()),
  });
  exporter.setBackdrop(cardBackdrop(background()), !!background().effect);
  const direction = autoTurn ? "south" : DIRECTIONS[dirIndex];
  const { cardFrames, loopMs } = poseOf(l);
  const lines = nameplate(playerName, plainLook().className);
  await loadNameFont(lines);
  const frame = nameFrame();
  const art = frame ? await nameFrameArt(frame) : undefined;
  const logo = await drawdyLogo();
  const frames: ArrayBuffer[] = [];
  for (let k = 0; k < cardFrames; k++) {
    const shot = await exporter.capture(sceneAt(l, direction, (k * loopMs) / cardFrames));
    const canvas = document.createElement("canvas");
    canvas.width = FRAME.w;
    canvas.height = FRAME.h;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(shot, 0, 0, FRAME.w, FRAME.h);
    drawNameplate(ctx, lines, EXPORT_NATIVE.feet, EXPORT_SCALE, CARD_PLATE_ROOM, art);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(logo, LOGO.x, LOGO.y, LOGO.w, LOGO.h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob) frames.push(await blob.arrayBuffer());
  }
  return { frames, loopMs };
}

async function placeLook(): Promise<void> {
  if (busy) return;
  setBusy(true);
  setStatus("กำลังวางลงบอร์ด…");
  try {
    const l = look();
    const { frames, loopMs } = await exportFrames(l);
    const frame = await frameOverlay();
    const card: CardPayload = { plate: background().plate, frames, loopMs, ...(frame ? { frame } : {}) };
    send({ type: "place", cards: [card] }, [...frames, ...(frame ? [frame] : [])]);
  } catch (err) {
    setBusy(false);
    setStatus(err instanceof Error ? err.message : String(err), true);
  }
}

let loadingBox: HTMLElement | null = null;
let loadingArtFrame = 0;

function stageControls(turn: (delta: number) => void): HTMLElement[] {
  return [
    h("button", { type: "button", class: "turn left", "aria-label": "หมุนซ้าย", onclick: () => turn(1) }, "‹"),
    h("button", { type: "button", class: "turn right", "aria-label": "หมุนขวา", onclick: () => turn(-1) }, "›"),
    h("span", { class: "drag-hint", "aria-hidden": "true" }, "ลากเพื่อหมุน"),
  ];
}

const skeletons = (n: number, className: string) => Array.from({ length: n }, () => h("div", { class: `${className} skeleton`, "aria-hidden": "true" }));

/** The whole panel at its final size, before the game's catalog arrives, so nothing moves when it does. */
function buildLayout(): void {
  const plate = h("canvas", { id: "nameplate", class: "nameplate", "aria-hidden": "true" });
  const frameArt = h("canvas", { id: "stage-frame-art", class: "stage-frame-art", width: STAGE_NATIVE.w, height: STAGE_NATIVE.h, "aria-hidden": "true" });
  loadingBox = h("div", { id: "stage-loading", class: "stage-loading" });
  const canvasFrame = h(
    "div",
    { id: "stage-frame", class: "stage-frame", style: `width:${STAGE_NATIVE.w * STAGE_SCALE_CSS}px;height:${STAGE_NATIVE.h * STAGE_SCALE_CSS}px` },
    loadingBox,
    plate,
    frameArt,
  );
  const host = h("div", { id: "stage-host", role: "img", "aria-label": "ตัวอย่างตัวละคร ลากซ้ายขวาเพื่อหมุน" }, canvasFrame);
  const turn = (delta: number) => {
    autoTurn = false;
    dirIndex = (dirIndex + delta + DIRECTIONS.length) % DIRECTIONS.length;
  };
  root.replaceChildren(
    brand(),
    h(
      "div",
      { class: "stage loading" },
      h("div", { class: "stage-view" }, host, ...stageControls(turn)),
      h("div", { id: "poses", class: "poses", role: "radiogroup", "aria-label": "ท่าทาง" }),
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
    h("div", { id: "name-frames", class: "frames name-frames", role: "radiogroup", "aria-label": "กรอบชื่อ" }, ...skeletons(6, "fx")),
    h("h2", {}, "พื้นหลัง"),
    h("div", { id: "backgrounds", class: "backgrounds" }),
    h("h2", {}, "กรอบการ์ด"),
    h("div", { id: "frames", class: "frames", role: "radiogroup", "aria-label": "กรอบการ์ด" }),
    h("h2", {}, "อาชีพ"),
    h("div", { id: "classes", class: "looks", role: "radiogroup", "aria-label": "อาชีพ" }, ...skeletons(5, "look")),
    h("h2", {}, "ชุดแฟชั่น"),
    h("div", { id: "fashion", class: "fashion", role: "radiogroup", "aria-label": "ชุดแฟชั่น" }, ...skeletons(2, "look")),
    h("h2", {}, "ปีก"),
    h("div", { id: "wings", class: "wings", role: "radiogroup", "aria-label": "ปีก" }, ...skeletons(4, "wing")),
    h(
      "div",
      { class: "actions" },
      h("button", { type: "button", class: "primary", disabled: true, onclick: () => void placeLook() }, "✦ วางลงบอร์ด"),
      h("p", { id: "status", class: "status", role: "status" }),
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
  requestAnimationFrame(animateFxThumbs);
}

/** While the catalog loads, the preview shows the chosen background at its real size with progress over it. */
function showLoading(progress: { done: number; total: number } | { error: string }): void {
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
          h("p", { class: "stage-loading-title" }, "โหลดข้อมูลชุดจาก Lumivara ไม่ได้"),
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
    frame: (now) => {
      if (autoTurn && !reduced && now - lastTurn > AUTO_TURN_MS) {
        dirIndex = (dirIndex + DIRECTIONS.length - 1) % DIRECTIONS.length;
        lastTurn = now;
      }
      return sceneAt(look(), DIRECTIONS[dirIndex], reduced ? 0 : now);
    },
  });
  live = liveStage;
  liveStage.setBackdrop(stageBackdrop(background()), !!background().effect);
  void liveStage.ready.then(() => {
    liveStage.canvas.style.width = `${STAGE_NATIVE.w * STAGE_SCALE_CSS}px`;
    liveStage.canvas.style.height = `${STAGE_NATIVE.h * STAGE_SCALE_CSS}px`;
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
        onclick: () => {
          wingsId = null;
          renderChoices();
        },
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
          onclick: () => {
            wingsId = w.id;
            renderChoices();
          },
        },
        w.icon && h("img", { src: w.icon, alt: "", width: 36, height: 36 }),
        h("span", {}, w.name),
      ),
    ),
  );
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

const brand = () => h("header", { class: "brand" }, h("span", {}, "LUMIVARA"), h("h1", {}, "ห้องแต่งตัว"));

async function load(): Promise<void> {
  showLoading({ done: 0, total: 0 });
  try {
    catalog = await loadCatalog(CODE_WING_STYLES, DIRECTIONS, (done, total) => showLoading({ done, total }));
  } catch (err) {
    showLoading({ error: err instanceof Error ? err.message : String(err) });
    return;
  }
  useWingStyles(catalog.styles);
  CLASS_LOOKS = catalog.looks.filter((l) => l.kind === "class");
  OUTFITS = catalog.looks.filter((l) => l.kind === "outfit");
  WINGS = catalog.wings;
  NAME_FRAMES = catalog.nameFrames;
  classId = OUTFITS[0]?.classId ?? CLASS_LOOKS[0].classId;
  outfitId = OUTFITS[0]?.id ?? null;
  wingsId = WINGS[0]?.id ?? null;
  startStage();
  renderWings();
  renderNameFrames();
  renderPickers();
  document.querySelector<HTMLButtonElement>(".primary")!.disabled = false;
}

api.onMessage((raw) => {
  const message = raw as DriverToWebview;
  if (message.type === "profile") {
    if (message.background) setBackground(message.background, false);
    if (message.frame) setFrame(message.frame, false);
    const input = document.getElementById("name-input") as HTMLInputElement | null;
    if (!message.name || (input ? input.value : playerName)) return;
    playerName = cleanName(message.name);
    if (input) {
      input.value = playerName;
      renderName();
    }
  } else if (message.type === "placed") {
    setBusy(false);
    setStatus("");
  } else if (message.type === "error") {
    setBusy(false);
    setStatus(message.message, true);
  }
});

buildLayout();
send({ type: "ready" });
void load();
