import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DRAWN_MOUNTS, paintSheet, type DrawnMount } from "../src/art/mounts";
import { pixels, type Pixels } from "../src/art/pixels";
import { RIDING } from "../src/game/riding";

const cosmetics: { skins: { id: string; slot: string }[] } = JSON.parse(
  readFileSync(new URL("./fixtures/cosmetics.json", import.meta.url), "utf8"),
);
const gameMountIds = cosmetics.skins
  .filter((s) => s.slot === "mount")
  .map((s) => s.id);
const alpha = (px: Pixels, x: number, y: number) =>
  x < 0 || y < 0 || x >= px.w || y >= px.h
    ? 0
    : px.data[(y * px.w + x) * 4 + 3];
// Roomier than the cell, so paint past its right or bottom edge shows up instead of being clipped away.
const frameOf = (m: DrawnMount, direction: string, frame: number) => {
  const px = pixels(m.cell.w + 8, m.cell.h + 8);
  m.paint(px, direction, frame);
  return px;
};
const frames = (m: DrawnMount) =>
  RIDING.directions.flatMap((direction) =>
    Array.from({ length: RIDING.framesPerDirection }, (_, frame) => ({
      direction,
      frame,
      px: frameOf(m, direction, frame),
    })),
  );
// The game's sheets: cells of 109 to 117 by 95 to 118 px, and two empty rows under the art.
const CELL = { minW: 96, maxW: 128, minH: 88, maxH: 128 };
const BOTTOM_GAP = { min: 1, max: 4 };
// The game seats a rider 5 to 7 px below the top of the back; a little more room either way.
const BACK_ABOVE_SEAT = { min: 3, max: 12 };
const MAX_COLOURS = 64;
const MAX_SHEET_MS = 150;

test("drawn mount ids are unique, own- prefixed and never one of the game's mount ids", () => {
  const ids = DRAWN_MOUNTS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.match(id, /^own-[a-z-]+$/);
    assert.ok(!gameMountIds.includes(id), `${id} is a game mount id`);
  }
});

for (const m of DRAWN_MOUNTS) {
  test(`${m.id} is named in English, described in Thai, sized like the game's mounts and seated in every drawn direction`, () => {
    assert.match(m.name, /^[A-Z][A-Za-z]+( [A-Z][A-Za-z]+)*$/);
    assert.match(m.description, /[฀-๿]/, "a Thai description");
    const { w, h } = m.cell;
    assert.ok(
      Number.isInteger(w) && w >= CELL.minW && w <= CELL.maxW,
      `cell width ${w}`,
    );
    assert.ok(
      Number.isInteger(h) && h >= CELL.minH && h <= CELL.maxH,
      `cell height ${h}`,
    );
    assert.deepEqual(Object.keys(m.seat).sort(), [...RIDING.directions].sort());
    for (const [direction, [x, y]] of Object.entries(m.seat)) {
      assert.ok(
        Number.isInteger(x) && x >= w * 0.25 && x <= w * 0.75,
        `${direction} seat x ${x} is off the middle of the cell`,
      );
      assert.ok(
        Number.isInteger(y) && y >= 20 && y <= h - 20,
        `${direction} seat y ${y}`,
      );
    }
  });

  test(`${m.id} paints crisp, sizeable frames inside its cell, in a pixel-art palette`, () => {
    const colours = new Set<number>();
    for (const { direction, frame, px } of frames(m)) {
      let painted = 0;
      for (let y = 0; y < px.h; y++)
        for (let x = 0; x < px.w; x++) {
          const a = alpha(px, x, y);
          if (!a) continue;
          const at = `${direction} frame ${frame} at (${x}, ${y})`;
          assert.ok(
            x < m.cell.w && y < m.cell.h,
            `${at} is outside the ${m.cell.w}x${m.cell.h} cell`,
          );
          assert.equal(a, 255, `${at} is half see-through`);
          const i = (y * px.w + x) * 4;
          colours.add(
            (px.data[i] << 16) | (px.data[i + 1] << 8) | px.data[i + 2],
          );
          painted++;
        }
      assert.ok(
        painted >= m.cell.w * m.cell.h * 0.15,
        `${direction} frame ${frame} paints only ${painted} pixels`,
      );
    }
    assert.ok(
      colours.size <= MAX_COLOURS,
      `${colours.size} colours, more than ${MAX_COLOURS}`,
    );
  });

  test(`${m.id} floats like the game's mounts, its lowest pixel just above the cell bottom in every direction`, () => {
    for (const direction of RIDING.directions) {
      let lowest = -1;
      for (let frame = 0; frame < RIDING.framesPerDirection; frame++) {
        const px = frameOf(m, direction, frame);
        for (let y = 0; y < m.cell.h; y++)
          for (let x = 0; x < m.cell.w; x++)
            if (alpha(px, x, y)) lowest = Math.max(lowest, y);
      }
      const gap = m.cell.h - 1 - lowest;
      assert.ok(
        gap >= BOTTOM_GAP.min && gap <= BOTTOM_GAP.max,
        `${direction}: ${gap} empty rows under the art`,
      );
    }
  });

  test(`${m.id} carries its rider: the seat is on its back in every frame`, () => {
    for (const { direction, frame, px } of frames(m)) {
      const [sx, sy] = m.seat[direction];
      const at = `${direction} frame ${frame}`;
      assert.equal(
        alpha(px, sx, sy),
        255,
        `${at}: nothing under the seat (${sx}, ${sy})`,
      );
      let top = sy;
      while (top > 0 && alpha(px, sx, top - 1)) top--;
      const above = sy - top;
      assert.ok(
        above >= BACK_ABOVE_SEAT.min && above <= BACK_ABOVE_SEAT.max,
        `${at}: the back is ${above} px above the seat`,
      );
    }
  });

  test(`${m.id} moves through its six frames in every direction`, () => {
    for (const direction of RIDING.directions) {
      const distinct = new Set(
        Array.from({ length: RIDING.framesPerDirection }, (_, frame) =>
          Buffer.from(frameOf(m, direction, frame).data).toString("base64"),
        ),
      );
      assert.ok(
        distinct.size >= 3,
        `${direction}: only ${distinct.size} different frames`,
      );
    }
  });

  test(`${m.id} paints its whole sheet quickly enough to build when the panel opens`, () => {
    const start = performance.now();
    const sheet = paintSheet(m);
    const ms = performance.now() - start;
    assert.equal(sheet.w, m.cell.w * RIDING.framesPerDirection);
    assert.equal(sheet.h, m.cell.h * RIDING.directions.length);
    assert.ok(ms < MAX_SHEET_MS, `${Math.round(ms)} ms`);
  });
}
