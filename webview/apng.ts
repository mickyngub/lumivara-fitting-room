import { zlibSync } from "fflate";

/**
 * Animated PNG from whole RGBA frames, the format a browser plays by itself in
 * an <img>. Every frame shares one palette of at most 128 colours, a later
 * frame keeps only the region that changed with the pixels in it that did not
 * change left clear and laid over the frame before, and a frame like the one
 * before shows that one longer instead, which together keep a card many times
 * smaller than whole true-colour frames.
 */
export type Chunk = { type: string; data: Uint8Array };

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const MAX_COLOURS = 128;
// Alpha counts this much more than a colour channel when a colour is brought to
// the nearest in the palette, so soft edges keep their shape.
const ALPHA_WEIGHT = 3;
// The palette's first entry is always fully clear, for the corners and for the
// unchanged pixels of a frame laid over the one before.
const CLEAR = 0;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function pngChunks(png: Uint8Array): Chunk[] {
  SIGNATURE.forEach((b, i) => {
    if (png[i] !== b) throw new Error("not a PNG");
  });
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Chunk[] = [];
  for (let at = SIGNATURE.length; at < png.length;) {
    const length = view.getUint32(at);
    chunks.push({
      type: String.fromCharCode(...png.subarray(at + 4, at + 8)),
      data: png.subarray(at + 8, at + 8 + length),
    });
    at += 12 + length;
  }
  return chunks;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function bytes(...fields: [number, 1 | 2 | 4][]): Uint8Array {
  const out = new Uint8Array(fields.reduce((n, [, size]) => n + size, 0));
  const view = new DataView(out.buffer);
  let at = 0;
  for (const [value, size] of fields) {
    if (size === 4) view.setUint32(at, value);
    else if (size === 2) view.setUint16(at, value);
    else view.setUint8(at, value);
    at += size;
  }
  return out;
}

// Every fully clear pixel is the same clear colour, 0.
const colourAt = (d: Uint8ClampedArray, i: number) =>
  d[i + 3] === 0
    ? 0
    : ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0;
const channel = (colour: number, c: number) => (colour >>> (24 - 8 * c)) & 255;

type Swatch = { colour: number; count: number };

/**
 * At most 128 colours for all the frames, clear first: every colour when there
 * are that few, otherwise median cut weighted by how many pixels each colour
 * covers, each box standing for its most common colour so flat pixel art keeps
 * its exact colours.
 */
export function paletteOf(frames: Uint8ClampedArray[]): number[] {
  const counts = new Map<number, number>();
  for (const d of frames) {
    for (let i = 0; i < d.length; i += 4) {
      const c = colourAt(d, i);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  counts.delete(CLEAR);
  const room = MAX_COLOURS - 1;
  const swatches: Swatch[] = [...counts].map(([colour, count]) => ({
    colour,
    count,
  }));
  const kept =
    swatches.length <= room
      ? swatches.map((s) => s.colour)
      : medianCut(swatches, room).map(
          (box) => box.reduce((a, b) => (b.count > a.count ? b : a)).colour,
        );
  return [CLEAR, ...kept];
}

function medianCut(swatches: Swatch[], boxes: number): Swatch[][] {
  const spread = (box: Swatch[]) => {
    let best = { c: 0, range: -1 };
    for (let c = 0; c < 4; c++) {
      let [lo, hi] = [255, 0];
      for (const s of box) {
        const v = channel(s.colour, c);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi - lo > best.range) best = { c, range: hi - lo };
    }
    return best;
  };
  const out = [swatches];
  while (out.length < boxes) {
    let pick = -1;
    let score = 0;
    out.forEach((box, i) => {
      if (box.length < 2) return;
      const s = spread(box).range * box.reduce((n, w) => n + w.count, 0);
      if (s > score) [pick, score] = [i, s];
    });
    if (pick < 0) break;
    const box = out[pick];
    const { c } = spread(box);
    box.sort((a, b) => channel(a.colour, c) - channel(b.colour, c));
    const half = box.reduce((n, w) => n + w.count, 0) / 2;
    let at = 0;
    for (let seen = 0; at < box.length - 1 && seen + box[at].count < half; at++)
      seen += box[at].count;
    const cut = Math.min(box.length - 1, Math.max(1, at));
    out.splice(pick, 1, box.slice(0, cut), box.slice(cut));
  }
  return out;
}

/** Each colour's place in the palette: its own, or the nearest one's. */
function indexer(palette: number[]): (colour: number) => number {
  const exact = new Map(palette.map((c, i) => [c, i]));
  return (colour) => {
    const known = exact.get(colour);
    if (known !== undefined) return known;
    let best = 0;
    let bestDistance = Infinity;
    palette.forEach((p, i) => {
      let d = 0;
      for (let c = 0; c < 4; c++)
        d +=
          (channel(colour, c) - channel(p, c)) ** 2 *
          (c === 3 ? ALPHA_WEIGHT : 1);
      if (d < bestDistance) [best, bestDistance] = [i, d];
    });
    exact.set(colour, best);
    return best;
  };
}

type Region = { x: number; y: number; w: number; h: number };

/** The box around the pixels that differ between two frames of palette indices, or null when none do. */
function changed(
  a: Uint8Array,
  b: Uint8Array,
  w: number,
  h: number,
): Region | null {
  let [left, top, right, bottom] = [w, h, -1, -1];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (a[y * w + x] === b[y * w + x]) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      bottom = y;
    }
  }
  return right < 0
    ? null
    : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

type Shown = {
  region: Region;
  rows: Uint8Array;
  over: boolean;
  frames: number;
};

/**
 * A later frame's rows: every pixel that did not change is left clear and the
 * frame is laid over the one before, so long clear runs compress to almost
 * nothing; a frame where a pixel turns less than opaque replaces its region instead.
 */
function laterFrame(
  before: Uint8Array,
  now: Uint8Array,
  width: number,
  r: Region,
  opaque: boolean[],
): Shown {
  const rows = new Uint8Array(r.h * (r.w + 1));
  let over = true;
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const p = (r.y + y) * width + r.x + x;
      const changes = now[p] !== before[p];
      if (changes && !opaque[now[p]]) over = false;
      rows[y * (r.w + 1) + 1 + x] = changes ? now[p] : CLEAR;
    }
  }
  if (!over)
    return { region: r, rows: wholeRows(now, width, r), over, frames: 1 };
  return { region: r, rows, over, frames: 1 };
}

// Rows of palette indices, each after PNG's "no filter" byte, which suits palette images best.
function wholeRows(indices: Uint8Array, width: number, r: Region): Uint8Array {
  const out = new Uint8Array(r.h * (r.w + 1));
  for (let y = 0; y < r.h; y++) {
    const from = (r.y + y) * width + r.x;
    out.set(indices.subarray(from, from + r.w), y * (r.w + 1) + 1);
  }
  return out;
}

/** Loops the frames for ever, each shown for delay.num / delay.den seconds. */
export function apng(
  frames: Uint8ClampedArray[],
  size: { w: number; h: number },
  delay: { num: number; den: number },
): Uint8Array<ArrayBuffer> {
  if (!frames.length) throw new Error("no frames");
  const { w, h } = size;
  if (frames.some((f) => f.length !== w * h * 4))
    throw new Error("a frame is not the image's size");
  const palette = paletteOf(frames);
  const opaque = palette.map((c) => channel(c, 3) === 255);
  const indexOf = indexer(palette);
  const indexed = frames.map((d) => {
    const out = new Uint8Array(w * h);
    for (let p = 0; p < out.length; p++) out[p] = indexOf(colourAt(d, p * 4));
    return out;
  });
  const whole = { x: 0, y: 0, w, h };
  const shown: Shown[] = [
    {
      region: whole,
      rows: wholeRows(indexed[0], w, whole),
      over: false,
      frames: 1,
    },
  ];
  for (let i = 1; i < indexed.length; i++) {
    const region = changed(indexed[i - 1], indexed[i], w, h);
    if (region)
      shown.push(laterFrame(indexed[i - 1], indexed[i], w, region, opaque));
    else shown[shown.length - 1].frames++;
  }
  const lastClear = palette.reduce(
    (last, c, i) => (channel(c, 3) < 255 ? i : last),
    -1,
  );
  const parts: Uint8Array[] = [
    new Uint8Array(SIGNATURE),
    chunk(
      "IHDR",
      bytes([w, 4], [h, 4], [8, 1], [3, 1], [0, 1], [0, 1], [0, 1]),
    ),
    chunk(
      "PLTE",
      new Uint8Array(
        palette.flatMap((c) => [channel(c, 0), channel(c, 1), channel(c, 2)]),
      ),
    ),
    chunk(
      "tRNS",
      new Uint8Array(palette.slice(0, lastClear + 1).map((c) => channel(c, 3))),
    ),
    chunk("acTL", bytes([shown.length, 4], [0, 4])),
  ];
  let sequence = 0;
  for (const [i, frame] of shown.entries()) {
    const { x, y, w: fw, h: fh } = frame.region;
    parts.push(
      chunk(
        "fcTL",
        bytes(
          [sequence++, 4],
          [fw, 4],
          [fh, 4],
          [x, 4],
          [y, 4],
          [delay.num * frame.frames, 2],
          [delay.den, 2],
          [0, 1],
          [frame.over ? 1 : 0, 1],
        ),
      ),
    );
    const data = zlibSync(frame.rows, { level: 9 });
    if (i === 0) parts.push(chunk("IDAT", data));
    else {
      const body = new Uint8Array(4 + data.length);
      new DataView(body.buffer).setUint32(0, sequence++);
      body.set(data, 4);
      parts.push(chunk("fdAT", body));
    }
  }
  parts.push(chunk("IEND", new Uint8Array(0)));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
