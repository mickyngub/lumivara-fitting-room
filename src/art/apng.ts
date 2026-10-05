/**
 * Animated PNG from plain PNG frames, the format a browser plays by itself in
 * an <img>. The first frame is the whole image; a later one may cover only the
 * region that changed, placed at x, y.
 */
export type ApngFrame = { png: Uint8Array; x: number; y: number };
export type Chunk = { type: string; data: Uint8Array };

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

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

const header = (chunks: Chunk[]) => {
  const ihdr = chunks.find((c) => c.type === "IHDR");
  if (!ihdr) throw new Error("PNG has no IHDR");
  const view = new DataView(
    ihdr.data.buffer,
    ihdr.data.byteOffset,
    ihdr.data.byteLength,
  );
  // Bit depth through interlace: every frame must share them with the image.
  return {
    ihdr,
    w: view.getUint32(0),
    h: view.getUint32(4),
    format: ihdr.data.subarray(8).join(),
  };
};

/** Loops the frames for ever, each shown for delay.num / delay.den seconds. */
export function apng(
  frames: ApngFrame[],
  delay: { num: number; den: number },
): Uint8Array<ArrayBuffer> {
  if (!frames.length) throw new Error("no frames");
  const parsed = frames.map((f) => ({ ...f, chunks: pngChunks(f.png) }));
  const image = header(parsed[0].chunks);
  const parts: Uint8Array[] = [
    new Uint8Array(SIGNATURE),
    chunk("IHDR", image.ihdr.data),
    chunk("acTL", u32s(frames.length, 0)),
  ];
  let sequence = 0;
  parsed.forEach((frame, i) => {
    const own = header(frame.chunks);
    if (own.format !== image.format)
      throw new Error(`frame ${i} is not in the first frame's pixel format`);
    if (frame.x + own.w > image.w || frame.y + own.h > image.h)
      throw new Error(`frame ${i} leaves the image`);
    const control = new Uint8Array(26);
    const view = new DataView(control.buffer);
    [sequence++, own.w, own.h, frame.x, frame.y].forEach((v, k) =>
      view.setUint32(k * 4, v),
    );
    view.setUint16(20, delay.num);
    view.setUint16(22, delay.den);
    parts.push(chunk("fcTL", control));
    for (const { type, data } of frame.chunks) {
      if (type !== "IDAT") continue;
      if (i === 0) {
        parts.push(chunk("IDAT", data));
      } else {
        const body = new Uint8Array(4 + data.length);
        new DataView(body.buffer).setUint32(0, sequence++);
        body.set(data, 4);
        parts.push(chunk("fdAT", body));
      }
    }
  });
  parts.push(chunk("IEND", new Uint8Array(0)));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function u32s(...values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((v, i) => view.setUint32(i * 4, v));
  return out;
}
