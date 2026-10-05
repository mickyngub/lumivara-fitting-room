import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { test } from "node:test";
import { buildCards, CARD, FRAME, LOGO } from "../src/card";
import { apng, crc32, pngChunks } from "../src/art/apng";
import { layoutNameplate, nameplate, slicePieces, type NameplateLine, type Rect } from "../webview/nametag";
import { POSES, poseAt, poseById, posesFor } from "../src/game/poses";
import type { Look } from "../src/game/types";
import { isCosmetics, layoutSheet, LUMIVARA, planCatalog, type AtlasJson, type Cosmetics } from "../src/game/catalog";
import { createWingKit } from "../src/game/wings.js";
import { NAME_FRAME_SLICES } from "../src/game/name-frames";
import { cleanName, NAME_MAX } from "../src/name";
import { EFFECTS } from "../src/art/effects";
import { FRAME_GRID, FRAME_STYLES, paintFrame } from "../src/art/frames";
import { pixels } from "../src/art/pixels";
import { clothParts, dyeCloth, dyePixels, dyeRgb, dyeShades, hexToHsl, hslToRgb, mainColour, rgbToHsl } from "../src/art/dye";
import { ACCESSORIES, ACCESSORY_ART, type Accessory } from "../src/art/accessories";
import { findHeads } from "../src/game/head";

const phaserBlendModes = { BlendModes: { NORMAL: 0, ADD: 1 } };
const neutralFarTint = 0xb8b8b8;
const cosmetics: Cosmetics = JSON.parse(readFileSync(new URL("./fixtures/cosmetics.json", import.meta.url), "utf8"));
const codeStyles = createWingKit(phaserBlendModes).config;
const directions = createWingKit(phaserBlendModes).directions;

const nameFrames = planCatalog(cosmetics, codeStyles, NAME_FRAME_SLICES).nameFrames;
const nameFrame = (id: string) => nameFrames.find((f) => f.id === id)!;
// World px per character: wide enough for a long name to need shrinking.
const measureByLength = (line: NameplateLine) => line.text.length * 3;
const roomy: Rect = { x: -1000, y: -1000, w: 2000, h: 2000 };
const nameFontEm = 6;
const labelPx = 0.5;
const near = (actual: number, expected: number, what: string) => assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual} is not ${expected}`);
const nearRect = (actual: Rect, expected: Rect, what: string) => {
  for (const k of ["x", "y", "w", "h"] as const) near(actual[k], expected[k], `${what}.${k}`);
};

const lookWithFrames = (counts: Record<string, number>): Look => ({
  id: "class:test",
  kind: "class",
  classId: "test",
  classIds: ["test"],
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
  const plan = planCatalog(cosmetics, codeStyles, NAME_FRAME_SLICES);
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
  const plan = planCatalog(cosmetics, codeStyles, NAME_FRAME_SLICES);
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
  const plan = planCatalog({ ...cosmetics, skins: [...cosmetics.skins, unknown] }, codeStyles, NAME_FRAME_SLICES);
  const aurora = plan.wings.find((w) => w.info.id === "aurora_wings")!;
  assert.deepEqual(plan.wingsWithoutEffect, ["aurora_wings"]);
  assert.equal(aurora.style.far, neutralFarTint);
  assert.equal(aurora.style.aura, undefined);
});

test("an outfit several classes can wear is offered to each of them, and classes the game lacks are dropped", () => {
  const plan = planCatalog(cosmetics, codeStyles, NAME_FRAME_SLICES);
  const bloodfang = plan.looks.find((l) => l.id === "outfit:bloodfang_vampire")!;
  assert.deepEqual(bloodfang.classIds, ["swordman", "kensei"]);
  assert.equal(bloodfang.classId, "swordman");
  assert.deepEqual(
    plan.looks.filter((l) => l.kind === "outfit" && l.classIds.includes("kensei")).map((l) => l.itemId),
    ["azure_kensei", "bloodfang_vampire"],
  );
  assert.deepEqual(plan.looks.find((l) => l.id === "outfit:azure_kensei")!.classIds, ["kensei"]);
  const base = cosmetics.skins.find((s) => s.id === "bloodfang_vampire")!;
  const pirate = { ...base, id: "pirate_coat", classId: "pirate", className: "Pirate", classIds: ["pirate", "thief"] };
  const ghost = { ...base, id: "ghost_coat", classId: "pirate", className: "Pirate", classIds: ["pirate"] };
  const more = planCatalog({ ...cosmetics, skins: [...cosmetics.skins, pirate, ghost] }, codeStyles, NAME_FRAME_SLICES);
  const coat = more.looks.find((l) => l.id === "outfit:pirate_coat")!;
  assert.deepEqual([coat.classId, coat.className, coat.classIds], ["thief", "Thief", ["thief"]]);
  assert.equal(more.looks.some((l) => l.id === "outfit:ghost_coat"), false);
});

test("name frames take their art from cosmetics.json and their slices from the game's stylesheet", () => {
  const plan = planCatalog(cosmetics, codeStyles, NAME_FRAME_SLICES);
  const listed = cosmetics.skins.filter((s) => s.slot === "nameframe").map((s) => s.id);
  assert.equal(listed.length, 10);
  assert.deepEqual(plan.nameFrames.map((f) => f.id), listed);
  const star = nameFrame("celestial_star");
  assert.equal(star.name, "Celestial Star");
  assert.equal(star.url, `${LUMIVARA}/name-frames/celestial_star.png`);
  assert.equal(star.gemUrl, `${LUMIVARA}/name-frames/celestial_star-gem.png`);
  assert.equal(star.icon, `${LUMIVARA}/items/celestial_star.png`);
  assert.deepEqual(star.slice, [13, 54, 17, 54]);
  assert.deepEqual(star.width, [13, 54, 17, 54]);
  assert.deepEqual(plan.nameFramesWithoutSlices, []);
});

test("a name frame the game's stylesheet has no rule for is left out and listed", () => {
  const { celestial_star: _lifted, ...others } = NAME_FRAME_SLICES;
  const plan = planCatalog(cosmetics, codeStyles, others);
  assert.deepEqual(plan.nameFramesWithoutSlices, ["celestial_star"]);
  assert.equal(plan.nameFrames.some((f) => f.id === "celestial_star"), false);
  assert.equal(plan.nameFrames.length, 9);
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

  const plan = planCatalog(cosmetics, codeStyles, NAME_FRAME_SLICES);
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

// A width×height PNG filled with one RGBA colour, as a canvas would encode it.
const solidPng = (width: number, height: number, rgba: number[]) => {
  const chunk = (type: string, data: Uint8Array) => {
    const body = new Uint8Array([...Buffer.from(type, "latin1"), ...data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.set(body, 4);
    out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.concat(Array.from({ length: height }, () => Buffer.from([0, ...Array.from({ length: width }, () => rgba).flat()])));
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", new Uint8Array(0))]));
};

test("frames become one animated PNG that loops for ever, each shown for the same time, numbered in order", () => {
  const frames = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255]].map((c) => ({ png: solidPng(4, 3, c), x: 0, y: 0 }));
  const out = apng(frames, { num: 900, den: 3000 });
  const chunks = pngChunks(out);
  assert.deepEqual(chunks.map((c) => c.type), ["IHDR", "acTL", "fcTL", "IDAT", "fcTL", "fdAT", "fcTL", "fdAT", "IEND"]);
  const u32 = (d: Uint8Array, at: number) => new DataView(d.buffer, d.byteOffset).getUint32(at);
  const u16 = (d: Uint8Array, at: number) => new DataView(d.buffer, d.byteOffset).getUint16(at);
  const acTL = chunks[1].data;
  assert.deepEqual([u32(acTL, 0), u32(acTL, 4)], [3, 0], "not 3 frames looping for ever");
  const numbered = chunks.filter((c) => c.type === "fcTL" || c.type === "fdAT").map((c) => u32(c.data, 0));
  assert.deepEqual(numbered, [0, 1, 2, 3, 4], "sequence numbers are not 0, 1, 2…");
  for (const control of chunks.filter((c) => c.type === "fcTL")) {
    assert.deepEqual([u32(control.data, 4), u32(control.data, 8), u16(control.data, 20), u16(control.data, 22)], [4, 3, 900, 3000]);
  }
  const view = new DataView(out.buffer);
  for (let at = 8; at < out.length; ) {
    const length = view.getUint32(at);
    assert.equal(view.getUint32(at + 8 + length), crc32(out.subarray(at + 4, at + 8 + length)), "a chunk's CRC is wrong");
    at += 12 + length;
  }
});

test("a frame in another pixel format or outside the image is refused rather than written broken", () => {
  const rgba = solidPng(4, 4, [1, 2, 3, 255]);
  const rgb = new Uint8Array(rgba);
  rgb[8 + 8 + 9] = 2;
  assert.throws(() => apng([{ png: rgba, x: 0, y: 0 }, { png: rgb, x: 0, y: 0 }], { num: 1, den: 10 }), /pixel format/);
  assert.throws(() => apng([{ png: rgba, x: 0, y: 0 }, { png: solidPng(2, 2, [0, 0, 0, 255]), x: 3, y: 3 }], { num: 1, den: 10 }), /leaves the image/);
});

test("a typed character name is trimmed, single-spaced and capped at the game's 20 characters", () => {
  assert.equal(cleanName("  Diny\u200b  the\tViking \n"), "Diny the Viking");
  assert.equal(cleanName("สายฟ้าแลบ"), "สายฟ้าแลบ");
  assert.equal(cleanName("a".repeat(NAME_MAX + 5)).length, NAME_MAX);
  assert.equal(cleanName("   "), "");
});

test("a card is one board element showing its animated image, with the Drawdy symbol in the picture's bottom-right corner", () => {
  let seq = 0;
  const elements = buildCards([{ image: "data:image/png;base64,AAAA" }, { image: "data:image/png;base64,BBBB" }], { x: 10, y: 20 }, () => String(seq++));
  assert.equal(elements.length, 2, "a card is more than one element");
  const [first, second] = elements as unknown as { type: string; x: number; y: number; width: number; height: number; groupId?: string; schema: { type: string; child: string; styles: Record<string, unknown> } }[];
  assert.deepEqual([first.type, first.x, first.y, first.width, first.height], ["component", 10, 20, CARD.w, CARD.h]);
  assert.deepEqual([first.schema.type, first.schema.child], ["image", "data:image/png;base64,AAAA"]);
  assert.equal(first.schema.styles.pointerEvents, "none", "the image would take the board's pointer");
  assert.equal(first.groupId, undefined);
  assert.equal(second.x, 10 + CARD.w + CARD.gap);
  assert.equal(CARD.w - FRAME.w, 2 * CARD.pad);
  assert.equal(CARD.h - FRAME.h, 2 * CARD.pad, "the picture does not fill the frame");
  assert.ok(LOGO.h >= 16, "the symbol is under the logo pack's 16 px minimum");
  assert.ok(Math.abs(FRAME.w - (LOGO.x + LOGO.w) - (FRAME.h - (LOGO.y + LOGO.h))) < 1e-9, "the symbol is closer to one edge than the other");
  const { scale, w } = FRAME_GRID;
  const gap = scale;
  for (const style of FRAME_STYLES) {
    const px = paintFrame(style);
    for (let y = Math.floor((CARD.pad + LOGO.y - gap) / scale); y < Math.ceil((CARD.pad + LOGO.y + LOGO.h + gap) / scale); y++) {
      for (let x = Math.floor((CARD.pad + LOGO.x - gap) / scale); x < Math.ceil((CARD.pad + LOGO.x + LOGO.w + gap) / scale); x++) {
        assert.equal(px.data[(y * w + x) * 4 + 3], 0, `${style.id} frame comes within one art pixel of the symbol at ${x},${y}`);
      }
    }
  }
});

test("a nameplate shows the typed name over the class in brackets, smaller, or the class alone", () => {
  const plate = nameplate("mickyngub", "Swordsman");
  assert.deepEqual(plate.map((l) => l.text), ["mickyngub", "‹Swordsman›"]);
  assert.ok(plate[1].px < plate[0].px);
  assert.deepEqual(nameplate("", "Mage").map((l) => l.text), ["‹Mage›"]);
});

test("a name frame takes the label's place and holds the padded name in its 13 px middle, with the class under it", () => {
  const feet = { x: 50, y: 40 };
  for (const frame of nameFrames) {
    const plate = layoutNameplate(nameplate("mickyngub", "Swordsman"), measureByLength, feet, roomy, frame);
    const { box, area, gem } = plate.frame!;
    const [t, r, b, l] = frame.width.map((v) => v * labelPx);
    const labelW = 9 * 3 + 8 * labelPx;
    nearRect(box, { x: feet.x - labelW / 2, y: feet.y + 7 + t, w: labelW, h: 13 * labelPx }, `${frame.id} label`);
    nearRect(area, { x: box.x - l, y: feet.y + 7, w: box.w + l + r, h: box.h + t + b }, `${frame.id} frame`);
    nearRect(gem, { x: feet.x - (frame.gemWidth * labelPx) / 2, y: area.y, w: frame.gemWidth * labelPx, h: area.h }, `${frame.id} gem`);
    const [name, title] = plate.lines;
    near(name.y, box.y + box.h / 2, `${frame.id} name is off the label's middle`);
    near(name.size, nameFontEm, `${frame.id} name size`);
    near(title.y - (title.size * 1.2) / 2, area.y + area.h, `${frame.id} class is not right under the frame`);
  }
  const unnamed = layoutNameplate(nameplate("", "Mage"), measureByLength, feet, roomy, nameFrame("sakura_bloom"));
  near(unnamed.frame!.box.w, 2 * nameFontEm, "an empty label is not the game's 2em minimum");
  assert.deepEqual(unnamed.lines.map((l) => l.text), ["‹Mage›"]);
});

test("a nameplate too big for the picture shrinks about the top of its label until it fits", () => {
  const feet = { x: 46, y: 67 };
  const room = { x: 1, y: 1, w: 90, h: 100 };
  const inside = (r: Rect) => r.x >= room.x - 1e-9 && r.y >= room.y - 1e-9 && r.x + r.w <= room.x + room.w + 1e-9 && r.y + r.h <= room.y + room.h + 1e-9;
  for (const frame of nameFrames) {
    const plate = layoutNameplate(nameplate("a".repeat(20), "Swordsman"), measureByLength, feet, room, frame);
    const { box, area } = plate.frame!;
    assert.ok(inside(area), `${frame.id} leaves the picture`);
    assert.ok(Math.min(area.x - room.x, room.x + room.w - area.x - area.w) < 1e-9, `${frame.id} shrank more than it had to`);
    near(area.y, feet.y + 7, `${frame.id} frame moved off the feet`);
    near(box.x + box.w / 2, feet.x, `${frame.id} label is off centre`);
    assert.ok(plate.lines.every((l) => l.size < nameFontEm), `${frame.id} text kept its size`);
  }
  const plain = layoutNameplate(nameplate("mickyngub", "Swordsman"), measureByLength, feet, room);
  assert.deepEqual(plain.lines.map((l) => l.size), [6, 5], "a plate that fits was resized");
  assert.equal(plain.frame, undefined);
});

test("a name frame's nine parts tile its image and its area, corners unstretched and the middle on the label", () => {
  const frame = nameFrame("celestial_star");
  const image = { w: 111, h: 43 };
  const [t, r, b, l] = frame.slice;
  const box = { x: 200, y: 100, w: 57, h: 13 };
  const area = { x: box.x - l, y: box.y - t, w: box.w + l + r, h: box.h + t + b };
  const pieces = slicePieces(frame.slice, image, box, area);
  assert.equal(pieces.length, 9);
  assert.equal(pieces.reduce((sum, p) => sum + p.sw * p.sh, 0), image.w * image.h);
  assert.equal(pieces.reduce((sum, p) => sum + p.dw * p.dh, 0), area.w * area.h);
  for (const p of [pieces[0], pieces[2], pieces[6], pieces[8]]) assert.deepEqual([p.dw, p.dh], [p.sw, p.sh], "a corner is stretched");
  assert.deepEqual([pieces[4].dx, pieces[4].dy, pieces[4].dw, pieces[4].dh], [box.x, box.y, box.w, box.h]);
  assert.deepEqual([pieces[4].sx, pieces[4].sw, pieces[4].sh], [l, image.w - l - r, image.h - t - b]);
});

test("colours convert to hsl and back", () => {
  const colours: [number, number, number][] = [[255, 196, 51], [24, 32, 29], [255, 255, 255], [0, 0, 0], [56, 182, 242], [155, 92, 246]];
  for (const rgb of colours) {
    const back = hslToRgb(rgbToHsl(...rgb));
    back.forEach((v, i) => assert.ok(Math.abs(v - rgb[i]) <= 1, `${rgb} came back as ${back}`));
  }
});

// Three gold shades, a dark outline pixel and a transparent one.
const goldWing = () => new Uint8ClampedArray([255, 214, 90, 255, 235, 170, 40, 255, 180, 120, 20, 255, 24, 20, 12, 255, 255, 0, 0, 0]);
const hslAt = (data: Uint8ClampedArray, pixel: number) => rgbToHsl(data[pixel * 4], data[pixel * 4 + 1], data[pixel * 4 + 2]);

test("a dye turns an item's main colour onto the chosen one, keeping its shading, outline and transparency", () => {
  const data = goldWing();
  const outline = hslAt(data, 3);
  const target = hexToHsl("#38b6f2");
  dyePixels(data, mainColour(data), target);
  assert.ok(Math.abs(mainColour(data).h - target.h) < 3, `main hue is ${mainColour(data).h}, not ${target.h}`);
  const [light, mid, dark] = [0, 1, 2].map((i) => hslAt(data, i).l);
  assert.ok(light > mid && mid > dark, "the shading changed order");
  near(hslAt(data, 3).l, outline.l, "the outline's lightness");
  assert.deepEqual([...data.slice(16)], [255, 0, 0, 0], "a transparent pixel was touched");
});

test("dyeing an item to its own main colour leaves it as it is", () => {
  const data = goldWing();
  const before = [...data];
  const main = mainColour(data);
  dyePixels(data, main, main);
  data.forEach((v, i) => assert.ok(Math.abs(v - before[i]) <= 1, `byte ${i} moved from ${before[i]} to ${v}`));
});

test("white and black dyes give silver and dark wings that keep their outline", () => {
  for (const [hex, lighter] of [["#f2f2f2", true], ["#2b2b36", false]] as const) {
    const data = goldWing();
    const body = hslAt(data, 1);
    const outline = hslAt(data, 3);
    dyePixels(data, mainColour(data), hexToHsl(hex));
    const dyed = hslAt(data, 1);
    assert.ok(lighter ? dyed.l > body.l : dyed.l < body.l, `${hex} moved the body from ${body.l} to ${dyed.l}`);
    assert.ok(dyed.s < 0.3, `${hex} left the body saturated at ${dyed.s}`);
    near(hslAt(data, 3).l, outline.l, `${hex} outline lightness`);
  }
});

test("a dyed tint can keep its lightness, so the far wing stays as shaded", () => {
  const main = hexToHsl("#ebaa28");
  const far = 0xc8a878;
  const dyed = dyeRgb(far, main, hexToHsl("#38b6f2"), true);
  const [before, after] = [far, dyed].map((c) => rgbToHsl((c >> 16) & 255, (c >> 8) & 255, c & 255));
  assert.ok(Math.abs(after.l - before.l) < 0.01, `far lightness went from ${before.l} to ${after.l}`);
  assert.ok(Math.abs(after.h - 199) < 5, `far hue is ${after.h}`);
});

// One standing frame: a face in the shadow tone of the brown tunic under it,
// with a grey belt, a blue trim and a dark outline.
const tunicSheet = (hair?: string) => {
  const sheet = { cell: { w: 12, h: 20 }, baseline: 20, rows: [{ anim: "idle", dir: "south", count: 1 }] };
  const data = new Uint8ClampedArray(12 * 20 * 4);
  const paint = (x: number, y: number, w: number, h: number, hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) data.set([r, g, b, 255], (yy * 12 + xx) * 4);
  };
  paint(3, 0, 6, 6, "#8a5a3c");
  if (hair) paint(3, 0, 6, 2, hair);
  paint(2, 7, 8, 9, "#7a4a28");
  paint(2, 11, 8, 1, "#808080");
  paint(2, 15, 8, 1, "#3060c0");
  paint(2, 16, 8, 1, "#1a1010");
  const heads = findHeads(data, 12, sheet, () => 6);
  return { data, sheet, heads, at: (x: number, y: number) => [...data.slice((y * 12 + x) * 4, (y * 12 + x) * 4 + 3)] };
};
const hueAt = (pixel: number[]) => rgbToHsl(pixel[0], pixel[1], pixel[2]).h;

test("an outfit's clothes split into colour parts, each dyed on its own, while the face, greys and outline stay as drawn", () => {
  const { data, sheet, heads, at } = tunicSheet();
  const cloth = clothParts(data, 12, sheet, heads)!;
  assert.deepEqual(cloth.parts.map((p) => Math.round(p.h)), [Math.round(hueAt(at(4, 8))), Math.round(hueAt(at(4, 15)))], "the tunic and the trim are not its parts");
  const before = { face: at(5, 2), belt: at(4, 11), trim: at(4, 15), outline: at(4, 16) };
  dyeCloth(data, 12, sheet, heads, cloth, [hexToHsl("#38b6f2"), null]);
  assert.ok(Math.abs(hueAt(at(4, 8)) - 199) < 5, "the tunic was not dyed blue");
  assert.deepEqual({ face: at(5, 2), belt: at(4, 11), trim: at(4, 15), outline: at(4, 16) }, before);
  const trimOnly = tunicSheet();
  dyeCloth(trimOnly.data, 12, trimOnly.sheet, trimOnly.heads, cloth, [null, hexToHsl("#3fbf6a")]);
  assert.ok(Math.abs(hueAt(trimOnly.at(4, 15)) - hexToHsl("#3fbf6a").h) < 5, "the trim was not dyed green on its own");
  assert.deepEqual(trimOnly.at(4, 8), tunicSheet().at(4, 8), "dyeing the trim moved the tunic");
});

test("a warm colour inside the head keeps its colour even where the same colour is dyed on the body", () => {
  const { data, sheet, heads, at } = tunicSheet("#7a4a28");
  const hair = at(5, 0);
  const cloth = clothParts(data, 12, sheet, heads)!;
  dyeCloth(data, 12, sheet, heads, cloth, [hexToHsl("#38b6f2"), null]);
  assert.deepEqual(at(5, 0), hair, "hair the colour of the tunic was dyed with it");
  assert.ok(Math.abs(hueAt(at(4, 8)) - 199) < 5, "the tunic was not dyed blue");
});

test("a look with no coloured clothes has nothing to dye", () => {
  const sheet = { cell: { w: 4, h: 4 }, baseline: 4, rows: [{ anim: "idle", dir: "south", count: 1 }] };
  const grey = new Uint8ClampedArray(4 * 4 * 4).map((_, i) => (i % 4 === 3 ? 255 : 128));
  assert.equal(clothParts(grey, 4, sheet, findHeads(grey, 4, sheet, () => 2)), null);
});

test("the head is found at the top of each frame, and a frame holding something over its head keeps the idle head", () => {
  const cell = { w: 20, h: 24 };
  const sheet = { cell, baseline: 22, rows: [{ anim: "idle", dir: "south", count: 2 }, { anim: "attack", dir: "south", count: 1 }] };
  const width = 2 * cell.w;
  const data = new Uint8ClampedArray(width * 2 * cell.h * 4);
  const fill = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) data[(y * width + x) * 4 + 3] = 255;
  };
  fill(6, 10, 8, 8);
  fill(7, 18, 6, 4);
  fill(cell.w + 6, 11, 8, 8);
  fill(cell.w + 7, 19, 6, 3);
  fill(6, cell.h + 10, 8, 8);
  fill(10, cell.h + 1, 2, 9);
  const [[still, bobbed], [attack]] = findHeads(data, width, sheet, () => 10);
  assert.deepEqual(still, { x: 10, top: 10, w: 8 });
  assert.equal(bobbed.top, 11, "the head did not follow the bob");
  assert.deepEqual(attack, still, "a sword over the head was taken for the head");
});

const paintAccessory = (a: Accessory, headW: number, facing: number) => {
  const px = pixels(ACCESSORY_ART.w, ACCESSORY_ART.h);
  a.paint(px, headW, facing);
  return px;
};
const opaqueBox = (px: { w: number; h: number; data: Uint8ClampedArray }) => {
  let [left, top, right, bottom] = [px.w, px.h, -1, -1];
  for (let y = 0; y < px.h; y++) {
    for (let x = 0; x < px.w; x++) {
      if (!px.data[(y * px.w + x) * 4 + 3]) continue;
      [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x), Math.max(bottom, y)];
    }
  }
  return { left, top, right, bottom };
};

test("every accessory sits on the head, stays inside its texture, mirrors about the head's centre and narrows from the side", () => {
  const { w, h, x: centre, top: headTop } = ACCESSORY_ART;
  for (const a of ACCESSORIES) {
    for (const headW of [10, 16, 24]) {
      const front = paintAccessory(a, headW, 1);
      const box = opaqueBox(front);
      assert.ok(box.right >= 0, `${a.id} paints nothing`);
      assert.ok(box.left > 0 && box.top > 0 && box.right < w - 1 && box.bottom < h - 1, `${a.id} reaches the edge of its texture at head width ${headW}`);
      assert.ok(box.top <= headTop + 4 && box.bottom >= headTop - 4, `${a.id} is not on the head`);
      let unmatched = 0;
      for (let y = 0; y < h; y++) {
        for (let d = 1; centre + d < w && centre - d >= 0; d++) {
          if (!front.data[(y * w + centre + d) * 4 + 3] !== !front.data[(y * w + centre - d) * 4 + 3]) unmatched++;
        }
      }
      assert.ok(unmatched <= 4, `${a.id} is lopsided by ${unmatched} pixels at head width ${headW}`);
      const side = opaqueBox(paintAccessory(a, headW, 0));
      assert.ok(side.right - side.left <= box.right - box.left, `${a.id} is wider from the side`);
    }
  }
});

test("an accessory's colour turns its base shade into the one picked and leaves gems, trims and outline as drawn", () => {
  const target = hexToHsl("#38b6f2");
  const picked = hslToRgb(target);
  const hexAt = (data: Uint8ClampedArray, i: number) => `#${[0, 1, 2].map((k) => data[i + k].toString(16).padStart(2, "0")).join("")}`;
  for (const a of ACCESSORIES) {
    const before = paintAccessory(a, 16, 1).data;
    const seen = new Set<string>();
    for (let i = 0; i < before.length; i += 4) if (before[i + 3]) seen.add(hexAt(before, i));
    for (const shade of a.body) assert.ok(seen.has(shade), `${a.id} names ${shade} but does not paint it`);
    const after = new Uint8ClampedArray(before);
    dyeShades(after, a.body, target);
    for (let i = 0; i < before.length; i += 4) {
      if (!before[i + 3]) continue;
      const shade = hexAt(before, i);
      if (shade === a.body[0]) [0, 1, 2].forEach((k) => assert.ok(Math.abs(after[i + k] - picked[k]) <= 1, `${a.id}'s base did not turn into the picked colour`));
      else if (!a.body.includes(shade)) assert.equal(hexAt(after, i), shade, `${a.id} recoloured ${shade}, which is not its body`);
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
