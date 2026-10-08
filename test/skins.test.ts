import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CLASS_SKINS } from "../src/art/skins";

const cosmetics: { classes: { id: string }[] } = JSON.parse(
  readFileSync(new URL("./fixtures/cosmetics.json", import.meta.url), "utf8"),
);
const classIds = cosmetics.classes.map((c) => c.id);
// The Kensei's plain clothes are grey, which a dye leaves as drawn, so a skin would only recolour its sword grip.
const UNDYEABLE = ["kensei"];

test("every class of the game whose clothes take a dye has three skins of the fitting room's own", () => {
  assert.ok(classIds.length > 0, "the fixture lists the game's classes");
  for (const skin of CLASS_SKINS)
    assert.ok(
      classIds.includes(skin.classId),
      `${skin.id} is for ${skin.classId}, not a class of the game`,
    );
  for (const id of classIds)
    assert.equal(
      CLASS_SKINS.filter((s) => s.classId === id).length,
      UNDYEABLE.includes(id) ? 0 : 3,
      `${id} skins`,
    );
});

test("skin ids are unique and own- prefixed with their class", () => {
  const ids = CLASS_SKINS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const skin of CLASS_SKINS)
    assert.match(
      skin.id,
      new RegExp(`^own-${skin.classId}-[a-z]+(-[a-z]+)*$`),
      `${skin.id} id`,
    );
});

test("skins are named in English, described in Thai, and dye three different colours", () => {
  for (const skin of CLASS_SKINS) {
    assert.match(
      skin.name,
      /^[A-Z][A-Za-z]+( [A-Z][A-Za-z]+)*$/,
      `${skin.id} name`,
    );
    assert.match(skin.description, /[฀-๿]/, `${skin.id} description`);
    assert.equal(skin.dyes.length, 3, `${skin.id} dyes`);
    for (const dye of skin.dyes)
      assert.match(dye, /^#[0-9a-f]{6}$/, `${skin.id} dye ${dye}`);
    assert.equal(
      new Set(skin.dyes).size,
      3,
      `${skin.id} dyes are not distinct`,
    );
  }
});
