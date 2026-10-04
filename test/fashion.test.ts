import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildCards, CARD, FRAME, frameAnimation } from "../src/card";
import { isCosmetics, layoutSheet, LUMIVARA, planCatalog, type AtlasJson, type Cosmetics } from "../src/game/catalog";
import { createWingKit } from "../src/game/wings.js";
import { cleanName, NAME_MAX } from "../src/name";
import { EFFECTS } from "../src/art/effects";
import { FRAME_GRID, FRAME_STYLES, paintFrame } from "../src/art/frames";
import { pixels } from "../src/art/pixels";

const maxKeyframes = 32;
const idleFrames = 15;
const walkFrames = 8;
const phaserBlendModes = { BlendModes: { NORMAL: 0, ADD: 1 } };
const neutralFarTint = 0xb8b8b8;
const cosmetics: Cosmetics = JSON.parse(readFileSync(new URL("./fixtures/cosmetics.json", import.meta.url), "utf8"));
const codeStyles = createWingKit(phaserBlendModes).config;

test("cosmetics.json turns every class and every outfit into a look with its game atlas", () => {
  const plan = planCatalog(cosmetics, codeStyles);
  const outfits = cosmetics.skins.filter((s) => s.slot === "outfit");
  assert.equal(plan.looks.length, cosmetics.classes.length + outfits.length);
  const ranger = plan.looks.find((l) => l.id === "outfit:silverwind_ranger");
  assert.ok(ranger, "Silverwind Ranger is in the catalog");
  assert.equal(ranger.classId, "archer");
  assert.equal(ranger.className, "Archer");
  assert.equal(ranger.source, "/jobs/silverwind-ranger-v1/player");
  for (const look of plan.looks) {
    if (look.kind === "outfit") assert.ok(plan.looks.some((l) => l.id === `class:${look.classId}`), `${look.id} has its class`);
  }
});

test("wings take placement from cosmetics.json and their effect from the game's wing code", () => {
  const plan = planCatalog(cosmetics, codeStyles);
  const demon = plan.wings.find((w) => w.info.id === "demon_wings")!;
  assert.equal(demon.style.aura, codeStyles.demon_wings.aura);
  assert.equal(demon.style.far, codeStyles.demon_wings.far);
  assert.equal(demon.style.rootX, cosmetics.skins.find((s) => s.id === "demon_wings")!.wings!.rootX);
  assert.equal(demon.textures[demon.style.texture], `${LUMIVARA}/wings/demon-wings.png`);
  assert.equal(demon.textures[demon.style.rim!], `${LUMIVARA}/wings/demon-wings-rim.png`);
  assert.equal(demon.info.icon, `${LUMIVARA}/items/demon_wings.png`);
  assert.deepEqual(plan.wingsWithoutEffect, []);
});

test("a wing the game's wing code does not know is listed and drawn with a neutral far tint", () => {
  const unknown = { id: "aurora_wings", slot: "wings", name: "Aurora Wings", wings: { url: "/wings/aurora.png", rootX: 0.01, rootY: 0.6, scale: 0.5 } };
  const plan = planCatalog({ ...cosmetics, skins: [...cosmetics.skins, unknown] }, codeStyles);
  const aurora = plan.wings.find((w) => w.info.id === "aurora_wings")!;
  assert.deepEqual(plan.wingsWithoutEffect, ["aurora_wings"]);
  assert.equal(aurora.style.far, neutralFarTint);
  assert.equal(aurora.style.aura, undefined);
});

test("cosmetics.json in a format the panel does not know is refused", () => {
  assert.ok(isCosmetics(cosmetics));
  assert.equal(isCosmetics({ ...cosmetics, format: 2 }), false);
  assert.equal(isCosmetics(null), false);
});

test("a game atlas is laid out with one row per animation and direction, trimmed frames at their offsets", () => {
  const directions = createWingKit(phaserBlendModes).directions;
  const cell = { w: 64, h: 72 };
  const counts = { idle: 3, walk: 2 };
  const frames: AtlasJson["frames"] = {};
  let x = 0;
  for (const [anim, count] of Object.entries(counts)) {
    for (const dir of directions) {
      for (let i = 0; i < count; i++) {
        frames[`${anim}/${dir}/${i}`] = { frame: { x, y: 0, w: 20, h: 30 }, trimmed: true, spriteSourceSize: { x: 5, y: 7 }, sourceSize: cell };
        x += 20;
      }
    }
  }
  const layout = layoutSheet({ frames }, directions);
  assert.deepEqual(layout.cell, cell);
  assert.equal(layout.baseline, cell.h - 16);
  assert.equal(layout.rows.length, directions.length * 2);
  assert.deepEqual(layout.size, { w: counts.idle * cell.w, h: directions.length * 2 * cell.h });
  const walkSecond = layout.rows.findIndex((r) => r.anim === "walk" && r.dir === directions[1]);
  assert.ok(layout.blits.some((b) => b.dx === cell.w + 5 && b.dy === walkSecond * cell.h + 7));
});

test("the game's own wing code runs outside the game and places every wing part in every direction", () => {
  function createSceneWithFakeCanvasesAndTrackParts() {
    const parts: Record<string, any>[] = [];
    const part = () => {
      const p: Record<string, any> = { visible: true, dead: false };
      for (const m of [
        "setOrigin",
        "setTintFill",
        "setTint",
        "setBlendMode",
        "setScale",
        "setRotation",
        "setDepth",
        "setAlpha",
      ]) {
        p[m] = () => p;
      }
      p.setVisible = (v: boolean) => ((p.visible = v), p);
      p.setPosition = (x: number, y: number) => ((p.x = x), (p.y = y), p);
      p.destroy = () => (p.dead = true);
      parts.push(p);
      return p;
    };
    const textures = new Set<string>(plan.wings.flatMap((w) => Object.keys(w.textures)));
    const scene = {
      add: { sprite: part, rectangle: part },
      textures: {
        exists: (key: string) => textures.has(key),
        createCanvas: (key: string, w: number, h: number) => {
          textures.add(key);
          const context = {
            createImageData: () => ({ data: new Uint8ClampedArray(w * h * 4) }),
            putImageData: () => {},
          };
          return { getContext: () => context, refresh: () => {} };
        },
      },
      time: { now: 0 },
    };
    return { scene, parts };
  }

  const plan = planCatalog(cosmetics, codeStyles);
  const kit = createWingKit(phaserBlendModes);
  for (const id of Object.keys(kit.config)) delete kit.config[id];
  Object.assign(kit.config, Object.fromEntries(plan.wings.map((w) => [w.info.id, w.style])));
  for (const wing of plan.wings.map((w) => w.info)) {
    const { scene, parts } = createSceneWithFakeCanvasesAndTrackParts();
    const entity: Record<string, any> = Object.assign(
      {
        x: 0,
        y: 0,
        dead: false,
        sitting: false,
        wasWalking: true,
        direction: "south",
        sprite: { scene, visible: true, alpha: 1, x: 50, y: 60 },
      },
      kit.methods,
    );
    entity.setWings(wing.id);
    assert.ok(parts.length > 0, wing.id);
    for (const direction of kit.directions) {
      entity.direction = direction;
      scene.time.now += 100;
      entity.drawWings({ visible: true, y: 51 });
      const placed = parts.filter((p) => p.visible && !p.dead);
      assert.ok(placed.length > 0, `${wing.id} ${direction}`);
      assert.ok(
        placed.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
        `${wing.id} ${direction}`,
      );
    }
  }
});

test("each frame of a card's animation is opaque only during its own two steps", () => {
  for (const frames of [walkFrames, idleFrames]) {
    for (let frame = 0; frame < frames; frame++) {
      const opacity = frameAnimation(frame, frames, 1000).animation.transform
        .opacity!;
      assert.ok(opacity.length <= maxKeyframes);
      assert.deepEqual(
        opacity.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0),
        [frame * 2 + 1],
      );
    }
  }
});

test("a typed character name is trimmed, single-spaced and capped at the game's 20 characters", () => {
  assert.equal(cleanName("  Diny\u200b  the\tViking \n"), "Diny the Viking");
  assert.equal(cleanName("สายฟ้าแลบ"), "สายฟ้าแลบ");
  assert.equal(cleanName("a".repeat(NAME_MAX + 5)).length, NAME_MAX);
  assert.equal(cleanName("   "), "");
});

test("a card shows its class name, its frame overlay and a Lumivara × Drawdy footer with both logos inside the plate", () => {
  let seq = 0;
  const generateIdInSequence = () => String(seq++);
  const overlay = new ArrayBuffer(1);
  const { elements } = buildCards([{ title: "Merchant", frames: [new ArrayBuffer(1)], loopMs: 1, frame: overlay }], { x: 0, y: 0 }, generateIdInSequence);
  type Box = { type: string; x: number; y: number; width: number; height: number; text?: string };
  const boxes = elements as unknown as Box[];
  const labels = boxes.filter((e) => e.text);
  assert.deepEqual(
    labels.map((l) => l.text),
    ["Merchant", "Lumivara × Drawdy"],
  );
  assert.ok(boxes.some((e) => e.type === "image" && e.x === 0 && e.y === 0 && e.width === CARD.w && e.height === CARD.h), "frame overlay covers the card");
  const footer = labels[1];
  const logos = boxes.filter((e) => e.type === "image" && e.y >= footer.y && e.y < footer.y + footer.height);
  assert.equal(logos.length, 2);
  for (const box of [...labels, ...logos]) {
    assert.ok(box.y >= CARD.pad + FRAME.h, `${box.text ?? "logo"} overlaps the picture`);
    assert.ok(box.y + box.height <= CARD.h - CARD.pad, `${box.text ?? "logo"} leaves the plate`);
    assert.ok(box.x >= CARD.pad && box.x + box.width <= CARD.w - CARD.pad, `${box.text ?? "logo"} leaves the plate sideways`);
  }
});

test("every animated background loops without a seam and paints every pixel", () => {
  for (const effect of EFFECTS) {
    for (const [w, h, feet] of [
      [118, 88, { x: 59, y: 71 }],
      [84, 80, { x: 42, y: 65 }],
    ] as const) {
      const start = pixels(w, h);
      const end = pixels(w, h);
      effect.paint(start, feet, 0);
      effect.paint(end, feet, 1);
      assert.deepEqual(end.data, start.data, `${effect.id} ${w}x${h} seam`);
      for (let i = 3; i < start.data.length; i += 4) assert.equal(start.data[i], 255, `${effect.id} leaves a hole`);
    }
  }
});

test("every card frame keeps the picture clear, closes its border and rounds its outer corners", () => {
  const { w, h, picture } = FRAME_GRID;
  const alpha = (px: { data: Uint8ClampedArray }, x: number, y: number) => px.data[(y * w + x) * 4 + 3];
  for (const style of FRAME_STYLES) {
    const px = paintFrame(style);
    for (let y = picture.y + 2; y < picture.y + picture.h - 2; y++) {
      for (let x = picture.x + 2; x < picture.x + picture.w - 2; x++) assert.equal(alpha(px, x, y), 0, `${style.id} paints over the picture at ${x},${y}`);
    }
    for (const [x, y] of [
      [Math.floor(w / 2), h - 1],
      [0, Math.floor(h / 2)],
      [w - 1, Math.floor(h / 2)],
    ]) {
      assert.equal(alpha(px, x, y), 255, `${style.id} border is open at ${x},${y}`);
    }
    if (style.corner !== "plate") assert.equal(alpha(px, 0, h - 1), 0, `${style.id} has a square corner`);
  }
});
