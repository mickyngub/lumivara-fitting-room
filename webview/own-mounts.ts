import { DRAWN_MOUNTS, paintSheet } from "../src/art/mounts";
import { pixels, type Pixels } from "../src/art/pixels";
import type { Mount } from "../src/game/types";

function pngOf(px: Pixels): string {
  const canvas = document.createElement("canvas");
  canvas.width = px.w;
  canvas.height = px.h;
  canvas
    .getContext("2d")!
    .putImageData(new ImageData(px.data, px.w, px.h), 0, 0);
  return canvas.toDataURL("image/png");
}

/** A frame cropped to its pixels, for the mount's tile. */
function iconOf(frame: Pixels): string {
  let [left, top, right, bottom] = [frame.w, frame.h, -1, -1];
  for (let y = 0; y < frame.h; y++)
    for (let x = 0; x < frame.w; x++) {
      if (!frame.data[(y * frame.w + x) * 4 + 3]) continue;
      [left, top, right, bottom] = [
        Math.min(left, x),
        Math.min(top, y),
        Math.max(right, x),
        Math.max(bottom, y),
      ];
    }
  const icon = pixels(
    Math.max(1, right - left + 1),
    Math.max(1, bottom - top + 1),
  );
  for (let y = 0; y < icon.h; y++)
    icon.data.set(
      frame.data.subarray(
        ((top + y) * frame.w + left) * 4,
        ((top + y) * frame.w + left + icon.w) * 4,
      ),
      y * icon.w * 4,
    );
  return pngOf(icon);
}

/**
 * The fitting room's own mounts. A whole sheet takes tens of milliseconds to
 * paint, so only each tile's first frame is painted when the panel opens and
 * the sheet waits until the mount is first ridden.
 */
export function drawnMounts(): Mount[] {
  return DRAWN_MOUNTS.map((m) => {
    const first = pixels(m.cell.w, m.cell.h);
    m.paint(first, "south", 0);
    let sheet: string | undefined;
    return {
      id: m.id,
      name: m.name,
      description: m.description,
      icon: iconOf(first),
      get sheet() {
        return (sheet ??= pngOf(paintSheet(m)));
      },
      cell: m.cell,
      seat: m.seat,
    };
  });
}
