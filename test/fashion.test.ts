import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildCards, CARD, FRAME, frameAnimation, LOGO_BOX } from "../src/card";
import { DRAWDY_SYMBOL } from "../src/brand-icons";
import { POSES, poseAt, poseById, posesFor } from "../src/game/poses";
import type { Look } from "../src/game/types";
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
const directions = createWingKit(phaserBlendModes).directions;

const lookWithFrames = (counts: Record<string, number>): Look => ({
  id: "class:test",
  kind: "class",
  classId: "test",
  className: "Test",
  name: "Test",
  description: "",
  sheet: {
    png: "",
    cell: { w: 64, h: 72 },
    baseline: 56,
    rows: Object.entries(counts).flatMap(([anim, count]) => directions.map((dir) => ({ anim, dir, count }))),
  },
});

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
  const cell = { w: 64, h: 72 };
  const counts = { idle: 3, walk: 2, attack: 4 };
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
  frames["cast/south/0"] = { frame: { x, y: 0, w: 20, h: 30 }, spriteSourceSize: { x: 0, y: 0 }, sourceSize: cell };
  const layout = layoutSheet({ frames }, directions);
  assert.deepEqual(layout.cell, cell);
  assert.equal(layout.baseline, cell.h - 16);
  assert.deepEqual([...new Set(layout.rows.map((r) => r.anim))], ["idle", "walk", "attack"], "a pose missing from some directions is left out");
  assert.equal(layout.rows.length, directions.length * 3);
  assert.deepEqual(layout.size, { w: counts.attack * cell.w, h: directions.length * 3 * cell.h });
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

test("a card shows its class name under the picture and the Drawdy symbol in its bottom-right corner, clear of every frame", () => {
  let seq = 0;
  const generateIdInSequence = () => String(seq++);
  const overlay = new ArrayBuffer(1);
  const { elements } = buildCards([{ title: "Merchant", frames: [new ArrayBuffer(1)], loopMs: 1, frame: overlay }], { x: 0, y: 0 }, generateIdInSequence);
  type Box = { type: string; x: number; y: number; width: number; height: number; text?: string };
  const boxes = elements as unknown as Box[];
  const labels = boxes.filter((e) => e.text);
  assert.deepEqual(
    labels.map((l) => l.text),
    ["Merchant"],
  );
  assert.ok(labels[0].y >= CARD.pad + FRAME.h, "the title overlaps the picture");
  assert.ok(boxes.some((e) => e.type === "image" && e.x === 0 && e.y === 0 && e.width === CARD.w && e.height === CARD.h), "frame overlay covers the card");
  const logos = boxes.filter((e) => e.type === "image" && e.y >= CARD.pad + FRAME.h);
  assert.equal(logos.length, 1);
  const [logo] = logos;
  assert.ok(logo.x > CARD.w / 2 && logo.y > labels[0].y, "the symbol sits bottom right");
  assert.ok(logo.height >= 16, "the symbol is under the logo pack's 16 px minimum");
  const clear = DRAWDY_SYMBOL.clear;
  const { scale, w } = FRAME_GRID;
  for (const style of FRAME_STYLES) {
    const px = paintFrame(style);
    for (let y = Math.floor((LOGO_BOX.y - clear) / scale); y < Math.ceil((LOGO_BOX.y + LOGO_BOX.h + clear) / scale); y++) {
      for (let x = Math.floor((LOGO_BOX.x - clear) / scale); x < Math.ceil((LOGO_BOX.x + LOGO_BOX.w + clear) / scale); x++) {
        assert.equal(px.data[(y * w + x) * 4 + 3], 0, `${style.id} frame is inside the symbol's clear space at ${x},${y}`);
      }
    }
  }
});

test("an action pose plays every frame of the move once per card loop, then stands until the loop closes", () => {
  const look = lookWithFrames({ idle: 8, walk: 8, attack: 9 });
  const attack = poseById("attack");
  const shots = Array.from({ length: attack.cardFrames }, (_, k) => poseAt(attack, look, "south", (k * attack.loopMs) / attack.cardFrames));
  assert.deepEqual(
    shots.map((f) => `${f.anim}/${f.frame}`),
    [...Array.from({ length: 9 }, (_, i) => `attack/${i}`), ...Array.from({ length: attack.cardFrames - 9 }, () => "idle/0")],
  );
  const next = poseAt(attack, look, "south", attack.loopMs);
  assert.deepEqual([next.anim, next.frame, next.wingMs], [shots[0].anim, shots[0].frame, shots[0].wingMs], "the loop has a seam");
  for (const pose of POSES) assert.ok(pose.cardFrames * 2 + 1 <= maxKeyframes, `${pose.id} card needs more keyframes than Drawdy allows`);
});

test("cast is offered only to sprites that have it, and sitting holds the last sit frame", () => {
  const mage = lookWithFrames({ idle: 8, walk: 8, attack: 9, "attack-alt": 9, cast: 9, sit: 9 });
  const outfit = lookWithFrames({ idle: 8, walk: 8, attack: 9, "attack-alt": 9, sit: 6 });
  assert.deepEqual(posesFor(mage).map((p) => p.id), ["idle", "walk", "attack", "attack-alt", "cast", "sit"]);
  assert.deepEqual(posesFor(outfit).map((p) => p.id), ["idle", "walk", "attack", "attack-alt", "sit"]);
  assert.deepEqual(posesFor(lookWithFrames({ idle: 8, walk: 8 })).map((p) => p.id), ["idle", "walk"]);
  for (const t of [0, 400, 2000]) assert.equal(poseAt(poseById("sit"), outfit, "west", t).frame, 5);
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
