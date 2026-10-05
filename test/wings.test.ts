import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { pixels, type Pixels } from "../src/art/pixels";
import { DRAWN_WINGS } from "../src/art/wings";

const cosmetics: { skins: { id: string; slot: string }[] } = JSON.parse(
  readFileSync(new URL("./fixtures/cosmetics.json", import.meta.url), "utf8"),
);
const gameWingIds = cosmetics.skins
  .filter((s) => s.slot === "wings")
  .map((s) => s.id);
const alpha = (px: Pixels, x: number, y: number) =>
  x < 0 || y < 0 || x >= px.w || y >= px.h
    ? 0
    : px.data[(y * px.w + x) * 4 + 3];

test("every drawn wing paints a sizeable wing inside its box, attached at its root", () => {
  for (const wing of DRAWN_WINGS) {
    // Roomier than the box, so paint past the right or bottom edge shows up instead of being clipped away.
    const px = pixels(wing.w + 8, wing.h + 8);
    wing.paint(px);
    let painted = 0;
    for (let y = 0; y < px.h; y++)
      for (let x = 0; x < px.w; x++) {
        if (!alpha(px, x, y)) continue;
        assert.ok(
          x < wing.w && y < wing.h,
          `${wing.id} paints (${x}, ${y}) outside its ${wing.w}x${wing.h} box`,
        );
        painted++;
      }
    assert.ok(
      painted >= wing.w * wing.h * 0.25,
      `${wing.id} paints only ${painted} of ${wing.w * wing.h} pixels`,
    );
    const { x, y } = wing.root;
    const attached = [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => alpha(px, x + dx, y + dy) >= 128);
    assert.ok(
      attached,
      `${wing.id} has no opaque pixel at or next to its root (${x}, ${y})`,
    );
  }
});

test("drawn wing ids are unique, own- prefixed and never one of the game's wing ids", () => {
  const ids = DRAWN_WINGS.map((w) => w.id);
  assert.ok(gameWingIds.length > 0, "the fixture lists the game's wings");
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.ok(id.startsWith("own-"), `${id} lacks the own- prefix`);
    assert.ok(!gameWingIds.includes(id), `${id} is a game wing's id`);
  }
});

test("drawn wings root at their left edge, fit the game's wing sizes and use one of its effects", () => {
  for (const wing of DRAWN_WINGS) {
    assert.equal(wing.root.x, 0, `${wing.id} root x`);
    assert.ok(
      wing.root.y >= wing.h * 0.55 && wing.root.y <= wing.h * 0.85,
      `${wing.id} root y ${wing.root.y} of ${wing.h}`,
    );
    assert.ok(wing.w >= 26 && wing.w <= 40, `${wing.id} is ${wing.w} wide`);
    assert.ok(wing.h >= 34 && wing.h <= 46, `${wing.id} is ${wing.h} tall`);
    assert.ok(
      ["gold", "demon", "storm"].includes(wing.aura),
      `${wing.id} aura ${wing.aura}`,
    );
    assert.ok(
      Number.isInteger(wing.far) && wing.far >= 0 && wing.far <= 0xffffff,
      `${wing.id} far ${wing.far}`,
    );
  }
});
