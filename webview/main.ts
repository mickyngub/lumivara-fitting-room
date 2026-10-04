import { FRAME } from "../src/card";
import type { Look, WingInfo } from "../src/game/types";
import type {
  CardPayload,
  DriverToWebview,
  WebviewToDriver,
} from "../src/messages";
import { cleanName, NAME_MAX } from "../src/name";
import { drawNameTag, loadNameFont, styleNameTag } from "./nametag";
import { loadCatalog, type Catalog } from "./live";
import { CODE_WING_STYLES, DIRECTIONS, FLAP_PERIOD_MS, Stage, useWingStyles, type Backdrop, type BackdropTime } from "./stage";
import { EFFECTS, type Effect } from "../src/art/effects";
import { FRAME_GRID, FRAME_STYLES, frameById, paintFrame } from "../src/art/frames";
import { pixels, type Pixels } from "../src/art/pixels";
import { THEMES, type Theme } from "./themes";

// Native game pixels; CSS scales the canvas up the way the game scales its own.
const STAGE_NATIVE = { w: 118, h: 92, feet: { x: 59, y: 71 } };
const STAGE_SCALE_CSS = 2.5;
const EXPORT_SCALE = 4;
const EXPORT_NATIVE = { w: FRAME.w / EXPORT_SCALE, h: FRAME.h / EXPORT_SCALE, feet: { x: FRAME.w / EXPORT_SCALE / 2, y: 65 } };
const WALK_FRAMES = 8;
const IDLE_FRAMES = 15;
const AUTO_TURN_MS = 1400;
const DRAG_STEP_PX = 26;
const THUMB_ROW = { anim: "idle", dir: "south" };
const SAVE_NAME_MS = 400;

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
const outfitsOf = (classId: string) => OUTFITS.filter((o) => o.classId === classId);

let classId = "";
let outfitId: string | null = null;
let wingsId: string | null = null;
type Background = { id: string; name: string; plate: string; theme?: Theme; effect?: Effect };
const BACKGROUNDS: Background[] = [
  ...THEMES.map((t) => ({ id: t.id, name: t.name, plate: t.plate, theme: t })),
  ...EFFECTS.map((e) => ({ id: e.id, name: e.name, plate: e.plate, effect: e })),
];
let backgroundId = BACKGROUNDS[0].id;
const background = () => BACKGROUNDS.find((b) => b.id === backgroundId) ?? BACKGROUNDS[0];
let frameId = FRAME_STYLES[0].id;
let dirIndex = Math.max(0, DIRECTIONS.indexOf("south"));
let walking = false;
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
const wing = () => WINGS.find((w) => w.id === wingsId) ?? null;
const png = (b64: string) => `data:image/png;base64,${b64}`;

function subtitleFor(l: Look): string {
  const base = `${l.className} · ${l.kind === "outfit" ? "ชุดแฟชั่น" : "ชุดปกติ"}`;
  const w = wing();
  return w ? `${base} · ${w.name}` : base;
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
  const withOutfits = [...new Set(OUTFITS.map((o) => o.className))].join(", ");
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
  renderLabels();
}

function renderLabels(): void {
  const l = look();
  document.getElementById("look-name")!.textContent = l.name;
  document.getElementById("look-sub")!.textContent = subtitleFor(l);
  document.getElementById("look-desc")!.textContent = l.description || wing()?.description || "";
  document
    .querySelectorAll<HTMLElement>("[data-wings]")
    .forEach((n) => n.setAttribute("aria-pressed", String((n.dataset.wings || null) === wingsId)));
  document.getElementById("pose")!.textContent = walking ? "ยืนนิ่ง" : "ลองเดิน";
}

function renderName(): void {
  const tag = document.getElementById("name-tag")!;
  tag.textContent = playerName;
  tag.hidden = !playerName;
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

function renderFrames(): void {
  const keep = frameId;
  const tiles = FRAME_STYLES.map((f) => {
    frameId = f.id;
    const thumb = frameCanvas(1);
    thumb.className = "frame-thumb";
    thumb.style.background = background().plate;
    return h(
      "button",
      { type: "button", class: "frame", title: `${f.name} · ${f.rarity}`, "aria-pressed": String(f.id === keep), onclick: () => setFrame(f.id, true) },
      thumb,
      h("span", { class: "frame-name" }, f.name),
      h("em", { style: `color:${f.rarityColour}` }, f.rarity),
    );
  });
  frameId = keep;
  document.getElementById("frames")?.replaceChildren(...tiles);
  const style = frameById(frameId);
  const stage = document.querySelector<HTMLElement>(".stage");
  if (stage) stage.style.boxShadow = `0 10px 30px rgba(0,0,0,0.45), 0 0 18px ${style.rarityColour}40`;
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
  const count = walking ? WALK_FRAMES : IDLE_FRAMES;
  const loopMs = walking ? FLAP_PERIOD_MS.walk : FLAP_PERIOD_MS.idle;
  if (playerName) await loadNameFont(playerName);
  const frames: ArrayBuffer[] = [];
  for (let k = 0; k < count; k++) {
    const shot = await exporter.capture({
      look: l,
      wings: wingsId,
      pose: { direction, walking },
      timeMs: (k * loopMs) / count,
    });
    const canvas = document.createElement("canvas");
    canvas.width = FRAME.w;
    canvas.height = FRAME.h;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(shot, 0, 0, FRAME.w, FRAME.h);
    if (playerName) drawNameTag(ctx, playerName, EXPORT_NATIVE.feet, EXPORT_SCALE);
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
    const card: CardPayload = { title: l.className, plate: background().plate, frames, loopMs, ...(frame ? { frame } : {}) };
    send({ type: "place", cards: [card] }, [...frames, ...(frame ? [frame] : [])]);
  } catch (err) {
    setBusy(false);
    setStatus(err instanceof Error ? err.message : String(err), true);
  }
}

function build(): void {
  const nameTag = h("span", { id: "name-tag", class: "name-tag", hidden: true });
  styleNameTag(nameTag, STAGE_NATIVE.feet, STAGE_SCALE_CSS);
  const frameArt = h("canvas", { id: "stage-frame-art", class: "stage-frame-art", width: STAGE_NATIVE.w, height: STAGE_NATIVE.h, "aria-hidden": "true" });
  const canvasFrame = h("div", { class: "stage-frame" }, nameTag, frameArt);
  const host = h(
    "div",
    {
      id: "stage-host",
      role: "img",
      "aria-label": "ตัวอย่างตัวละคร ลากซ้ายขวาเพื่อหมุน",
    },
    canvasFrame,
  );
  const turn = (delta: number) => {
    autoTurn = false;
    dirIndex = (dirIndex + delta + DIRECTIONS.length) % DIRECTIONS.length;
  };
  root.replaceChildren(
    brand(),
    h(
      "div",
      { class: "stage" },
      host,
      h(
        "button",
        {
          type: "button",
          class: "turn left",
          "aria-label": "หมุนซ้าย",
          onclick: () => turn(1),
        },
        "‹",
      ),
      h(
        "button",
        {
          type: "button",
          class: "turn right",
          "aria-label": "หมุนขวา",
          onclick: () => turn(-1),
        },
        "›",
      ),
      h(
        "button",
        {
          type: "button",
          id: "pose",
          class: "pose",
          onclick: () => {
            walking = !walking;
            renderLabels();
          },
        },
        "ลองเดิน",
      ),
      h("span", { class: "drag-hint", "aria-hidden": "true" }, "ลากเพื่อหมุน"),
    ),
    h("div", { id: "backgrounds", class: "backgrounds" }),
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
    h(
      "div",
      { class: "caption" },
      h("b", { id: "look-name" }),
      h("span", { id: "look-sub" }),
      h("p", { id: "look-desc" }),
    ),
    h("h2", {}, "อาชีพ"),
    h("div", { id: "classes", class: "looks", role: "radiogroup", "aria-label": "อาชีพ" }),
    h("h2", {}, "ชุดแฟชั่น"),
    h("div", { id: "fashion", class: "fashion", role: "radiogroup", "aria-label": "ชุดแฟชั่น" }),
    h("h2", {}, "ปีก"),
    h(
      "div",
      { class: "wings", role: "radiogroup", "aria-label": "ปีก" },
      h(
        "button",
        {
          type: "button",
          class: "wing",
          "data-wings": "",
          onclick: () => {
            wingsId = null;
            renderLabels();
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
              renderLabels();
            },
          },
          w.icon &&
            h("img", {
              src: w.icon,
              alt: "",
              width: 36,
              height: 36,
            }),
          h("span", {}, w.name),
        ),
      ),
    ),
    h("h2", {}, "กรอบการ์ด"),
    h("div", { id: "frames", class: "frames", role: "radiogroup", "aria-label": "กรอบการ์ด" }),
    h(
      "div",
      { class: "actions" },
      h("button", { type: "button", class: "primary", onclick: () => void placeLook() }, "✦ วางลงบอร์ด"),
      h("p", { id: "status", class: "status", role: "status" }),
    ),
    h("div", { id: "exporter", class: "exporter", "aria-hidden": "true" }),
  );

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
      return {
        look: look(),
        wings: wingsId,
        pose: { direction: DIRECTIONS[dirIndex], walking },
        timeMs: reduced ? 0 : now,
      };
    },
  });
  live = liveStage;
  liveStage.setBackdrop(stageBackdrop(background()), !!background().effect);
  void liveStage.ready.then(() => {
    liveStage.canvas.style.width = `${STAGE_NATIVE.w * STAGE_SCALE_CSS}px`;
    liveStage.canvas.style.height = `${STAGE_NATIVE.h * STAGE_SCALE_CSS}px`;
  });

  let dragX: number | null = null;
  host.addEventListener("pointerdown", (e) => {
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

  renderPickers();
  renderName();
  renderBackgrounds();
  renderFrames();
  requestAnimationFrame(animateFxThumbs);
}

const brand = () => h("header", { class: "brand" }, h("span", {}, "LUMIVARA"), h("h1", {}, "ห้องแต่งตัว"));

async function boot(): Promise<void> {
  const fill = h("span", { class: "boot-fill" });
  const text = h("p", {}, "กำลังโหลดชุดจาก Lumivara…");
  root.replaceChildren(brand(), h("div", { class: "boot" }, text, h("div", { class: "boot-bar" }, fill)));
  try {
    catalog = await loadCatalog(CODE_WING_STYLES, DIRECTIONS, (done, total) => {
      fill.style.width = `${total ? (done / total) * 100 : 0}%`;
      text.textContent = `กำลังโหลดชุดจาก Lumivara… ${done}/${total}`;
    });
  } catch (err) {
    root.replaceChildren(
      brand(),
      h(
        "div",
        { class: "boot" },
        h("p", {}, "โหลดข้อมูลชุดจาก Lumivara ไม่ได้"),
        h("p", { class: "boot-detail" }, err instanceof Error ? err.message : String(err)),
        h("button", { type: "button", class: "primary", onclick: () => void boot() }, "ลองอีกครั้ง"),
      ),
    );
    return;
  }
  useWingStyles(catalog.styles);
  CLASS_LOOKS = catalog.looks.filter((l) => l.kind === "class");
  OUTFITS = catalog.looks.filter((l) => l.kind === "outfit");
  WINGS = catalog.wings;
  classId = OUTFITS[0]?.classId ?? CLASS_LOOKS[0].classId;
  outfitId = OUTFITS[0]?.id ?? null;
  wingsId = WINGS[0]?.id ?? null;
  build();
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
    setStatus(message.count > 1 ? `วางครบ ${message.count} ชุดแล้ว` : "วางลงบอร์ดแล้ว");
  } else if (message.type === "error") {
    setBusy(false);
    setStatus(message.message, true);
  }
});

send({ type: "ready" });
void boot();
