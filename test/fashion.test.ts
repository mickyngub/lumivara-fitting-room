import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCards, CARD, FRAME, frameAnimation } from "../src/card";
import { LOOKS, WING_TEXTURES, WINGS } from "../src/game/looks";
import { createWingKit } from "../src/game/wings.js";
import { cleanName, NAME_MAX } from "../src/name";

const directionCount = 8;
const maxKeyframes = 32;
const idleFrames = 15;
const walkFrames = 8;
const phaserBlendModes = { BlendModes: { NORMAL: 0, ADD: 1 } };

test("every look in the snapshot has idle and walk frames for all eight directions", () => {
  const kit = createWingKit(phaserBlendModes);
  assert.equal(kit.directions.length, directionCount);
  for (const look of LOOKS) {
    for (const anim of ["idle", "walk"]) {
      for (const dir of kit.directions) {
        const row = look.sheet.rows.find(
          (r) => r.anim === anim && r.dir === dir,
        );
        assert.ok(row && row.count > 0, `${look.id} has no ${anim}/${dir}`);
      }
    }
    assert.ok(
      look.sheet.baseline > 0 && look.sheet.baseline < look.sheet.cell.h,
      look.id,
    );
  }
});

test("every fashion outfit belongs to a class that also has its plain look", () => {
  const classes = new Set(
    LOOKS.filter((l) => l.kind === "class").map((l) => l.classId),
  );
  const outfits = LOOKS.filter((l) => l.kind === "outfit");
  assert.ok(outfits.length > 0);
  for (const outfit of outfits)
    assert.ok(classes.has(outfit.classId), outfit.id);
});

test("every wing on sale has the game's wing style and its textures bundled", () => {
  const kit = createWingKit(phaserBlendModes);
  assert.ok(WINGS.length > 0);
  for (const wing of WINGS) {
    const style = kit.config[wing.id];
    assert.ok(style, wing.id);
    assert.ok(WING_TEXTURES[style.texture], `${wing.id} texture`);
    if (style.rim) assert.ok(WING_TEXTURES[style.rim], `${wing.id} rim`);
  }
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
    const textures = new Set<string>(Object.keys(WING_TEXTURES));
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

  const kit = createWingKit(phaserBlendModes);
  for (const wing of WINGS) {
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

test("card labels sit below the name tag frame and inside the card plate", () => {
  let seq = 0;
  const generateIdInSequence = () => String(seq++);
  const { elements } = buildCards(
    [{ title: "Azure Kensei", subtitle: "Kensei", frames: [new ArrayBuffer(1)], loopMs: 1 }],
    { x: 0, y: 0 },
    generateIdInSequence,
  );
  type Label = { y: number; height: number; text: string };
  const labels = elements.filter((e) => "text" in e && e.text) as unknown as Label[];
  assert.equal(labels.length, 3);
  for (const label of labels) {
    assert.ok(label.y >= CARD.pad + FRAME.h, `${label.text} overlaps the frame`);
    assert.ok(label.y + label.height <= CARD.h - CARD.pad, `${label.text} leaves the card`);
  }
});
