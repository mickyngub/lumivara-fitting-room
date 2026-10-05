import assert from "node:assert/strict";
import { test } from "node:test";
import { pixels, put, rgb } from "../src/art/pixels";
import {
  clearBackground,
  fitInside,
  hardenAlpha,
  mirror,
  opaqueBox,
} from "../src/art/upload-wing";

// A gold wing shape on a flat white page, with a white highlight inside it.
const wingOnWhite = () => {
  const px = pixels(10, 8);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 10; x++) put(px, x, y, rgb("#fefefe"));
  for (let y = 2; y < 6; y++)
    for (let x = 2; x < 8; x++) put(px, x, y, rgb("#d9a520"));
  put(px, 4, 3, rgb("#ffffff"));
  return px;
};
const alphaAt = (
  px: { w: number; data: Uint8ClampedArray },
  x: number,
  y: number,
) => px.data[(y * px.w + x) * 4 + 3];

test("a wing drawn on a flat page loses the page and keeps every pixel inside its outline", () => {
  const px = wingOnWhite();
  clearBackground(px);
  assert.equal(alphaAt(px, 0, 0), 0, "the page stayed");
  assert.equal(alphaAt(px, 3, 3), 255, "the wing was cleared");
  assert.equal(
    alphaAt(px, 4, 3),
    255,
    "a white highlight inside the wing was cleared with the page",
  );
  assert.deepEqual(opaqueBox(px), { x: 2, y: 2, w: 6, h: 4 });
});

test("an image already cut out, or with corners in different colours, keeps its pixels", () => {
  const cut = pixels(4, 4);
  put(cut, 1, 1, rgb("#d9a520"));
  const before = [...cut.data];
  clearBackground(cut);
  assert.deepEqual([...cut.data], before);
  const photo = wingOnWhite();
  put(photo, 9, 7, rgb("#202020"));
  clearBackground(photo);
  assert.equal(alphaAt(photo, 0, 0), 255, "a busy picture lost its corner");
});

test("an empty image has no box, hardened alpha is all or nothing, and mirroring flips left and right", () => {
  assert.equal(opaqueBox(pixels(3, 3)), null);
  const px = pixels(3, 1);
  put(px, 0, 0, rgb("#ff0000"), 0.4);
  put(px, 2, 0, rgb("#0000ff"), 0.8);
  hardenAlpha(px);
  assert.deepEqual([alphaAt(px, 0, 0), alphaAt(px, 2, 0)], [0, 255]);
  mirror(px);
  assert.deepEqual([...px.data.slice(0, 4)], [0, 0, 255, 255]);
  assert.deepEqual(fitInside(200, 100, { w: 56, h: 46 }), { w: 56, h: 28 });
  assert.deepEqual(fitInside(50, 400, { w: 56, h: 46 }), { w: 6, h: 46 });
});
