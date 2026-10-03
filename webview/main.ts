import { FRAME, PLATE_COLOR } from "../src/card";
import { ITEM_ICONS, LOOKS, WING_TEXTURES, WINGS } from "../src/game/looks";
import type { Look } from "../src/game/types";
import type {
  CardPayload,
  DriverToWebview,
  WebviewToDriver,
} from "../src/messages";
import { DIRECTIONS, FLAP_PERIOD_MS, Stage } from "./stage";

const STAGE_CSS = { w: 296, h: 206 };
const STAGE_SCALE_CSS = 2.5;
const STAGE_FEET_FROM_BOTTOM_CSS = 28;
const EXPORT_SCALE = 4;
const EXPORT_FEET = { x: FRAME.w / EXPORT_SCALE / 2, y: 66 };
const WALK_FRAMES = 8;
const IDLE_FRAMES = 15;
const AUTO_TURN_MS = 1400;
const DRAG_STEP_PX = 26;
const THUMB_ROW = { anim: "idle", dir: "south" };

const api = acquireDrawdyApi();
const send = (message: WebviewToDriver, transfer?: Transferable[]) =>
  api.postMessage(message, transfer);
const stage = new Stage();
const root = document.getElementById("root")!;

let lookId = LOOKS[0].id;
let wingsId: string | null = WINGS[0]?.id ?? null;
let dirIndex = Math.max(0, DIRECTIONS.indexOf("south"));
let walking = false;
let autoTurn = true;
let lastTurn = 0;
let busy = false;

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

const look = (): Look => LOOKS.find((l) => l.id === lookId) ?? LOOKS[0];
const wing = () => WINGS.find((w) => w.id === wingsId) ?? null;
const png = (b64: string) => `data:image/png;base64,${b64}`;

function subtitleFor(l: Look): string {
  const base =
    l.kind === "outfit" ? `ชุดแฟชั่น ${l.className}` : `ชุดปกติ ${l.className}`;
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

function drawFloor(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const glow = ctx.createRadialGradient(x, y, 2, x, y, 30);
  glow.addColorStop(0, "rgba(255, 233, 166, 0.22)");
  glow.addColorStop(1, "rgba(255, 233, 166, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(x, y, 30, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(201, 164, 92, 0.6)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(x, y, 24, 7, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function renderLabels(): void {
  const l = look();
  document.getElementById("look-name")!.textContent = l.name;
  document.getElementById("look-sub")!.textContent = subtitleFor(l);
  document.getElementById("look-desc")!.textContent =
    l.description || wing()?.description || "";
  document
    .querySelectorAll<HTMLElement>("[data-look]")
    .forEach((n) =>
      n.setAttribute("aria-pressed", String(n.dataset.look === lookId)),
    );
  document
    .querySelectorAll<HTMLElement>("[data-wings]")
    .forEach((n) =>
      n.setAttribute(
        "aria-pressed",
        String((n.dataset.wings || null) === wingsId),
      ),
    );
  const pose = document.getElementById("pose")!;
  pose.textContent = walking ? "ยืนนิ่ง" : "ลองเดิน";
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

async function exportFrames(
  l: Look,
): Promise<{ frames: ArrayBuffer[]; loopMs: number }> {
  const direction = autoTurn ? "south" : DIRECTIONS[dirIndex];
  const count = walking ? WALK_FRAMES : IDLE_FRAMES;
  const loopMs = walking ? FLAP_PERIOD_MS.walk : FLAP_PERIOD_MS.idle;
  const frames: ArrayBuffer[] = [];
  for (let k = 0; k < count; k++) {
    const canvas = document.createElement("canvas");
    canvas.width = FRAME.w;
    canvas.height = FRAME.h;
    const ctx = canvas.getContext("2d")!;
    // The card plate's colour is baked in so a frame fully covers the ones
    // beneath it whenever the board draws without animation.
    ctx.fillStyle = PLATE_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(EXPORT_SCALE, 0, 0, EXPORT_SCALE, 0, 0);
    drawFloor(ctx, EXPORT_FEET.x, EXPORT_FEET.y);
    stage.draw(
      ctx,
      {
        look: l,
        wings: wingsId,
        pose: { direction, walking },
        timeMs: (k * loopMs) / count,
      },
      EXPORT_FEET.x,
      EXPORT_FEET.y,
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (blob) frames.push(await blob.arrayBuffer());
  }
  return { frames, loopMs };
}

async function placeLooks(looks: Look[]): Promise<void> {
  if (busy) return;
  setBusy(true);
  setStatus(
    looks.length > 1 ? `กำลังวาง ${looks.length} ชุด…` : "กำลังวางลงบอร์ด…",
  );
  try {
    const cards: CardPayload[] = [];
    for (const l of looks) {
      const { frames, loopMs } = await exportFrames(l);
      cards.push({ title: l.name, subtitle: subtitleFor(l), frames, loopMs });
    }
    send(
      { type: "place", cards },
      cards.flatMap((c) => c.frames),
    );
  } catch (err) {
    setBusy(false);
    setStatus(err instanceof Error ? err.message : String(err), true);
  }
}

function build(): void {
  const canvas = h("canvas", {
    id: "stage-canvas",
    "aria-label": "ตัวอย่างตัวละคร ลากซ้ายขวาเพื่อหมุน",
  });
  const turn = (delta: number) => {
    autoTurn = false;
    dirIndex = (dirIndex + delta + DIRECTIONS.length) % DIRECTIONS.length;
  };
  const outfits = LOOKS.filter((l) => l.kind === "outfit");
  const classes = LOOKS.filter((l) => l.kind === "class");
  const lookTile = (l: Look) =>
    h(
      "button",
      {
        type: "button",
        class: `look${l.kind === "outfit" ? " fashion" : ""}`,
        "data-look": l.id,
        title: l.name,
        onclick: () => {
          lookId = l.id;
          renderLabels();
        },
      },
      thumb(l, 56),
      h(
        "span",
        { class: "look-name" },
        l.kind === "outfit" ? l.name : l.className,
      ),
      l.kind === "outfit" && h("em", {}, "แฟชั่น"),
    );

  root.replaceChildren(
    h(
      "header",
      { class: "brand" },
      h("span", {}, "LUMIVARA"),
      h("h1", {}, "ห้องแต่งตัว"),
    ),
    h(
      "div",
      { class: "stage" },
      canvas,
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
    h(
      "div",
      { class: "caption" },
      h("b", { id: "look-name" }),
      h("span", { id: "look-sub" }),
      h("p", { id: "look-desc" }),
    ),
    h("h2", {}, "ชุด"),
    h(
      "div",
      { class: "looks", role: "radiogroup", "aria-label": "ชุด" },
      ...outfits.map(lookTile),
      h("span", { class: "divider" }),
      ...classes.map(lookTile),
    ),
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
          ITEM_ICONS[w.id] &&
            h("img", {
              src: png(ITEM_ICONS[w.id]),
              alt: "",
              width: 36,
              height: 36,
            }),
          h("span", {}, w.name),
        ),
      ),
    ),
    h(
      "div",
      { class: "actions" },
      h(
        "button",
        {
          type: "button",
          class: "primary",
          onclick: () => placeLooks([look()]),
        },
        "✦ วางลงบอร์ด",
      ),
      h(
        "button",
        { type: "button", class: "link", onclick: () => placeLooks(outfits) },
        `วางชุดแฟชั่นครบ ${outfits.length} ชุดเรียงกัน`,
      ),
      h("p", { id: "status", class: "status", role: "status" }),
    ),
  );

  let dragX: number | null = null;
  canvas.addEventListener("pointerdown", (e) => {
    dragX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (dragX === null) return;
    const dx = e.clientX - dragX;
    if (Math.abs(dx) >= DRAG_STEP_PX) {
      turn(dx > 0 ? -1 : 1);
      dragX = e.clientX;
    }
  });
  const endDrag = () => (dragX = null);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  renderLabels();
  startStage(canvas);
}

function startStage(canvas: HTMLCanvasElement): void {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(STAGE_CSS.w * dpr);
  canvas.height = Math.round(STAGE_CSS.h * dpr);
  canvas.style.width = `${STAGE_CSS.w}px`;
  canvas.style.height = `${STAGE_CSS.h}px`;
  const scale = Math.max(2, Math.round(STAGE_SCALE_CSS * dpr));
  const ctx = canvas.getContext("2d")!;
  const feet = {
    x: canvas.width / scale / 2,
    y: (canvas.height - STAGE_FEET_FROM_BOTTOM_CSS * dpr) / scale,
  };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tick = (now: number) => {
    if (autoTurn && !reduced && now - lastTurn > AUTO_TURN_MS) {
      dirIndex = (dirIndex + DIRECTIONS.length - 1) % DIRECTIONS.length;
      lastTurn = now;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawFloor(ctx, feet.x, feet.y);
    stage.draw(
      ctx,
      {
        look: look(),
        wings: wingsId,
        pose: { direction: DIRECTIONS[dirIndex], walking },
        timeMs: reduced ? 0 : now,
      },
      feet.x,
      feet.y,
    );
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

api.onMessage((raw) => {
  const message = raw as DriverToWebview;
  if (message.type === "placed") {
    setBusy(false);
    setStatus(
      message.count > 1 ? `วางครบ ${message.count} ชุดแล้ว` : "วางลงบอร์ดแล้ว",
    );
  } else if (message.type === "error") {
    setBusy(false);
    setStatus(message.message, true);
  }
});

root.replaceChildren(h("p", { class: "boot" }, "กำลังเปิดห้องแต่งตัว…"));
stage.load(LOOKS, WING_TEXTURES).then(build, (err) => {
  root.replaceChildren(h("p", { class: "boot" }, `โหลดไม่สำเร็จ: ${err}`));
});
