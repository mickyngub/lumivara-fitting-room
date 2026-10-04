import PhaserLib from "phaser";
import { poseAt, poseById } from "../src/game/poses";
import type { Look } from "../src/game/types";

(window as unknown as { Phaser: unknown }).Phaser = PhaserLib;
const { CODE_WING_STYLES, DIRECTIONS, Stage, useWingStyles } = await import("../webview/stage");
const { loadCatalog } = await import("../webview/live");
const { looks: LOOKS, wings: WINGS, styles, wingTextures } = await loadCatalog(CODE_WING_STYLES, DIRECTIONS, () => {});
useWingStyles(styles);

const CELL = { w: 84, h: 72 };
const FEET = { x: 42, y: 64 };
const SCALE = 3;
const LABEL_W = 220;
const GRASS = "#4f7f3a";
const IDLE_MOMENT_MS = 1000;

const novice = LOOKS.find((l) => l.id === "class:novice")!;
const outfits = LOOKS.filter((l) => l.kind === "outfit");
const rows: { look: Look; wings: string | null; label: string }[] = [
  ...WINGS.map((w) => ({ look: novice, wings: w.id, label: `Novice + ${w.name}` })),
  ...outfits.map((l) => ({ look: l, wings: null, label: l.name })),
  ...WINGS.flatMap((w) => outfits.map((l) => ({ look: l, wings: w.id, label: `${l.name} + ${w.name}` }))),
];

const host = document.createElement("div");
document.body.append(host);
const stage = new Stage({
  parent: host,
  width: CELL.w,
  height: CELL.h,
  feet: FEET,
  looks: LOOKS,
  wingTextures,
  backdrop: (ctx, width, height) => {
    ctx.fillStyle = GRASS;
    ctx.fillRect(0, 0, width, height);
  },
});
const sheet = document.createElement("canvas");
sheet.width = LABEL_W + DIRECTIONS.length * CELL.w * SCALE;
sheet.height = 30 + rows.length * CELL.h * SCALE;
const ctx = sheet.getContext("2d")!;
ctx.fillStyle = GRASS;
ctx.fillRect(0, 0, sheet.width, sheet.height);
ctx.fillStyle = "#f7f0de";
ctx.font = "14px Georgia";
DIRECTIONS.forEach((dir, i) => ctx.fillText(dir, LABEL_W + i * CELL.w * SCALE + 8, 20));
ctx.imageSmoothingEnabled = false;
for (const [r, row] of rows.entries()) {
  const y = 30 + r * CELL.h * SCALE;
  ctx.fillText(row.label, 8, y + (CELL.h * SCALE) / 2);
  for (const [i, direction] of DIRECTIONS.entries()) {
    const f = poseAt(poseById("idle"), row.look, direction, IDLE_MOMENT_MS);
    const shot = await stage.capture({
      look: row.look,
      wings: row.wings,
      pose: { direction, anim: f.anim, frame: f.frame, walking: false },
      wingMs: f.wingMs,
      loop: f.loop,
    });
    ctx.drawImage(shot, LABEL_W + i * CELL.w * SCALE, y, CELL.w * SCALE, CELL.h * SCALE);
  }
}
host.remove();
document.body.append(sheet);
document.title = "ready";
