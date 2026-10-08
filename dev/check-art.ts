// npx tsx dev/check-art.ts <wing|mount|scene> <module>
// Runs the repo's tests for one drawn wing, mount or scene before it is in its
// registry, and writes a preview to dev/previews/<id>.png.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import { EFFECTS, type Effect } from "../src/art/effects";
import { DRAWN_MOUNTS, paintSheet, type DrawnMount } from "../src/art/mounts";
import { pixels, put, rgb, type Pixels } from "../src/art/pixels";
import { DRAWN_WINGS, type DrawnWing } from "../src/art/wings";
import { RIDING } from "../src/game/riding";

const [kind, file] = process.argv.slice(2);
if (!["wing", "mount", "scene"].includes(kind) || !file) {
  console.error("usage: npx tsx dev/check-art.ts <wing|mount|scene> <module>");
  process.exit(2);
}
const mod = await import(pathToFileURL(resolve(file)).href);
const item = Object.values(mod).find(
  (v): v is { id: string; paint: unknown } =>
    !!v && typeof v === "object" && "id" in v && "paint" in v,
);
if (!item) {
  console.error(`${file} exports no object with an id and a paint function`);
  process.exit(2);
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
function encode(px: Pixels): Buffer {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(px.w, 0);
  head.writeUInt32BE(px.h, 4);
  head.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((px.w * 4 + 1) * px.h);
  for (let y = 0; y < px.h; y++)
    raw.set(
      px.data.subarray(y * px.w * 4, (y + 1) * px.w * 4),
      y * (px.w * 4 + 1) + 1,
    );
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", head),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const BACK = rgb("#8a8f99");
const SEAT = rgb("#ff00ff");
function board(w: number, h: number): Pixels {
  const px = pixels(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(px, x, y, BACK);
  return px;
}
function blit(
  to: Pixels,
  from: Pixels,
  ox: number,
  oy: number,
  scale: number,
  flip = false,
): void {
  for (let y = 0; y < from.h; y++)
    for (let x = 0; x < from.w; x++) {
      const i = (y * from.w + (flip ? from.w - 1 - x : x)) * 4;
      const a = from.data[i + 3] / 255;
      if (!a) continue;
      const c: [number, number, number] = [
        from.data[i],
        from.data[i + 1],
        from.data[i + 2],
      ];
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++)
          put(to, ox + x * scale + dx, oy + y * scale + dy, c, a);
    }
}

function preview(): Pixels {
  if (kind === "wing") {
    const wing = item as unknown as DrawnWing;
    const art = pixels(wing.w, wing.h);
    wing.paint(art);
    const s = 8;
    const out = board((wing.w * 2 + 6) * s, (wing.h + 4) * s);
    blit(out, art, 2 * s, 2 * s, s, true);
    blit(out, art, (wing.w + 4) * s, 2 * s, s);
    return out;
  }
  if (kind === "mount") {
    const mount = item as unknown as DrawnMount;
    const sheet = paintSheet(mount);
    const s = 2;
    const out = board(sheet.w * s, sheet.h * s);
    blit(out, sheet, 0, 0, s);
    RIDING.directions.forEach((d, row) => {
      const [sx, sy] = mount.seat[d];
      for (let f = 0; f < RIDING.framesPerDirection; f++)
        for (let k = 0; k < s * s; k++)
          put(
            out,
            (f * mount.cell.w + sx) * s + (k % s),
            (row * mount.cell.h + sy) * s + Math.floor(k / s),
            SEAT,
          );
    });
    return out;
  }
  const scene = item as unknown as Effect;
  const [w, h, s] = [118, 88, 4];
  const out = board((w * 2 + 3) * s, (h * 2 + 3) * s);
  [0, 0.25, 0.5, 0.75].forEach((phase, k) => {
    const px = pixels(w, h);
    scene.paint(px, { x: 59, y: 71 }, phase);
    blit(
      out,
      px,
      (1 + (k % 2) * (w + 1)) * s,
      (1 + Math.floor(k / 2) * (h + 1)) * s,
      s,
    );
  });
  return out;
}

const registry: { id: string }[] =
  kind === "wing" ? DRAWN_WINGS : kind === "mount" ? DRAWN_MOUNTS : EFFECTS;
const taken = registry.filter((r) => r !== item).map((r) => r.id);
if (taken.includes(item.id)) {
  console.error(`${item.id} is already the id of a registered ${kind}`);
  process.exit(1);
}
mkdirSync(new URL("./previews/", import.meta.url), { recursive: true });
const out = new URL(`./previews/${item.id}.png`, import.meta.url);
writeFileSync(out, encode(preview()));
console.log(`preview: ${out.pathname}`);

registry.splice(0, registry.length, item as never);
await import(
  kind === "wing"
    ? "../test/wings.test.ts"
    : kind === "mount"
      ? "../test/mounts.test.ts"
      : "../test/fashion.test.ts"
);
