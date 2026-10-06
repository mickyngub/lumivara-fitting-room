import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { LUMIVARA, planCatalog, type Cosmetics } from "../src/game/catalog";
import { NAME_FRAME_SLICES } from "../src/game/name-frames";
import {
  FLAP_PERIOD_MS,
  poseAt,
  posesFor,
  RIDING_POSES,
} from "../src/game/poses";
import { RIDING, ridePlacement } from "../src/game/riding";
import type { Look, Mount } from "../src/game/types";

const cosmetics: Cosmetics = JSON.parse(
  readFileSync(new URL("./fixtures/cosmetics.json", import.meta.url), "utf8"),
);
const mountsOf = (c: Cosmetics) => planCatalog(c, {}, NAME_FRAME_SLICES).mounts;
const pegasus = (): Mount =>
  mountsOf(cosmetics).find((m) => m.id === "meadow_pegasus")!;
const directions = [
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
  "north",
  "north-east",
];
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
    cell: { w: 72, h: 72 },
    baseline: 56,
    rows: Object.entries(counts).flatMap(([anim, count]) =>
      directions.map((dir) => ({ anim, dir, count })),
    ),
  },
});

test("every mount in cosmetics.json comes with its sheet, cell and a seat for each direction its sheet draws", () => {
  const mounts = mountsOf(cosmetics);
  assert.deepEqual(
    mounts.map((m) => m.id),
    cosmetics.skins.filter((s) => s.slot === "mount").map((s) => s.id),
  );
  const m = pegasus();
  assert.equal(m.name, "Meadow Pegasus");
  assert.equal(m.sheet, `${LUMIVARA}/mounts/meadow_pegasus.png`);
  assert.equal(m.icon, `${LUMIVARA}/items/meadow_pegasus.png`);
  assert.deepEqual(m.cell, { w: 112, h: 118 });
  assert.deepEqual(Object.keys(m.seat), RIDING.directions);
  assert.deepEqual(m.seat.south, [55, 59]);
});

test("a mount without a whole cell or a seat for every drawn direction is left out", () => {
  const broken: Cosmetics = JSON.parse(JSON.stringify(cosmetics));
  const mounts = broken.skins.filter((s) => s.slot === "mount");
  delete mounts[0].mount!.seat.north;
  mounts[1].mount!.cell = [117.5, 115];
  delete mounts[2].mount;
  assert.deepEqual(
    mountsOf(broken).map((m) => m.id),
    [mounts[3].id],
  );
});

test("the rider's feet sit on the game's seat, and the west side mirrors the east side's row", () => {
  const m = pegasus();
  const feet = { x: 100, y: 200 };
  // The game: cell bottom at feet - 16 - bob, cell left at feet.x - floor(w / 2), rider 3 below the seat.
  assert.deepEqual(ridePlacement(m, "south", feet, 0, 0), {
    frame: 0,
    flip: false,
    mount: { x: 100, y: 184 },
    rider: { x: 44 + 55, y: 184 - 118 + 59 + 3 },
  });
  assert.deepEqual(ridePlacement(m, "west", feet, 7, 2), {
    frame: 2 * RIDING.framesPerDirection + 1,
    flip: true,
    mount: { x: 100, y: 182 },
    rider: { x: 44 + (112 - 1 - 61), y: 182 - 118 + 69 + 3 },
  });
  assert.equal(
    ridePlacement(m, "north-west", feet, 0, 0).frame,
    3 * RIDING.framesPerDirection,
  );
  assert.equal(
    ridePlacement(m, "north", feet, 0, 0).frame,
    4 * RIDING.framesPerDirection,
  );
});

test("riding offers standing and moving only, with the rider on its last sit frame", () => {
  const look = lookWithFrames({ idle: 4, walk: 6, attack: 5, sit: 9 });
  assert.deepEqual(
    posesFor(look, true).map((p) => p.id),
    ["idle", "walk"],
  );
  const f = poseAt(RIDING_POSES[0], look, "south", 500, true);
  assert.equal(f.anim, "sit");
  assert.equal(f.frame, 8);
  assert.equal(
    poseAt(
      RIDING_POSES[0],
      lookWithFrames({ idle: 4, walk: 6 }),
      "south",
      0,
      true,
    ).frame,
    0,
  );
});

test("a riding card closes its loop on whole rounds of the mount's frames, its bob and its wing flap", () => {
  const look = lookWithFrames({ idle: 4, walk: 6, sit: 9 });
  for (const pose of RIDING_POSES) {
    const at = (t: number) => poseAt(pose, look, "south", t, true);
    const steps = Array.from(
      { length: pose.cardFrames },
      (_, k) =>
        at((k * pose.loopMs) / pose.cardFrames).ride!.step %
        RIDING.framesPerDirection,
    );
    assert.deepEqual(
      steps,
      Array.from(
        { length: pose.cardFrames },
        (_, k) => (2 * k) % RIDING.framesPerDirection,
      ),
      `${pose.id}: every other frame of the mount`,
    );
    assert.equal(
      at(pose.loopMs).ride!.step % RIDING.framesPerDirection,
      0,
      `${pose.id}: frames close`,
    );
    assert.ok(
      at(pose.loopMs).ride!.bob === at(0).ride!.bob,
      `${pose.id}: bob closes`,
    );
    const flaps =
      at(pose.loopMs).wingMs /
      (pose.walking ? FLAP_PERIOD_MS.walk : FLAP_PERIOD_MS.idle);
    assert.ok(
      Math.abs(flaps - Math.round(flaps)) < 1e-9 && flaps >= 1,
      `${pose.id}: ${flaps} flaps`,
    );
  }
});
