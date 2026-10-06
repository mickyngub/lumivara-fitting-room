import { RIDING } from "../game/riding";
import { pixels, type Pixels } from "./pixels";
import { AURORA_JELLY } from "./mounts/aurora-jelly";
import { CRYSTAL_TORTOISE } from "./mounts/crystal-tortoise";
import { EMBER_DRAKE } from "./mounts/ember-drake";
import { MOON_MOTH } from "./mounts/moon-moth";
import { SAKURA_KOI } from "./mounts/sakura-koi";
import { SAND_SCARAB } from "./mounts/sand-scarab";
import { STORM_GRIFFIN } from "./mounts/storm-griffin";
import { TIDE_MANTA } from "./mounts/tide-manta";

/**
 * A mount of the fitting room's own, drawn in code the way the game's mount
 * sheets are drawn: one row per direction in RIDING.directions, six frames of
 * one looping cycle each, and the art's lowest pixel 2 px above the cell's
 * bottom, since the game floats every mount over its shadow.
 */
export type DrawnMount = {
  id: string;
  name: string;
  description: string;
  cell: { w: number; h: number };
  /** The point on the back where the rider sits, per drawn direction; its feet go 3 px below it. */
  seat: Record<string, [number, number]>;
  /** Paints one frame of one drawn direction into an empty canvas at least as big as the cell. */
  paint: (px: Pixels, direction: string, frame: number) => void;
};

export const DRAWN_MOUNTS: DrawnMount[] = [
  EMBER_DRAKE,
  TIDE_MANTA,
  STORM_GRIFFIN,
  MOON_MOTH,
  CRYSTAL_TORTOISE,
  SAND_SCARAB,
  SAKURA_KOI,
  AURORA_JELLY,
];

/** The mount's whole sheet, laid out like the game's: a row per drawn direction, a column per frame. */
export function paintSheet(mount: DrawnMount): Pixels {
  const { w, h } = mount.cell;
  const n = RIDING.framesPerDirection;
  const sheet = pixels(w * n, h * RIDING.directions.length);
  RIDING.directions.forEach((direction, row) => {
    for (let frame = 0; frame < n; frame++) {
      const cell = pixels(w, h);
      mount.paint(cell, direction, frame);
      for (let y = 0; y < h; y++)
        sheet.data.set(
          cell.data.subarray(y * w * 4, (y + 1) * w * 4),
          ((row * h + y) * sheet.w + frame * w) * 4,
        );
    }
  });
  return sheet;
}
