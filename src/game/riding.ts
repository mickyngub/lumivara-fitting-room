import type { Mount } from "./types";

// The game's numbers for a rider on a mount, from drawRiding in its player
// class and the constants it imports; scripts/riding-code.mjs keeps a copy of
// that code in src/game/riding.game.js to diff against after a game update.
export const RIDING = {
  /** The directions a sheet draws, one row each; the other three are mirrored. */
  directions: ["south", "south-east", "east", "north-east", "north"],
  mirrored: {
    "north-west": "north-east",
    west: "east",
    "south-west": "south-east",
  } as Record<string, string>,
  framesPerDirection: 6,
  frameMs: { idle: 140, walk: 75 },
  bobPeriodMs: 2 * Math.PI * 420,
  bob: 2,
  /** The sheet's cell bottom floats this far above the shadow. */
  hover: 16,
  /** The rider's feet sit this far below the seat. */
  seatDrop: 3,
  shadowScale: { x: 2.4, y: 1.8 },
  /** Below the shadow, as the game draws it. */
  depth: -2.5,
};

export type RidePlacement = {
  /** The sheet frame, its row the direction's and mirrored for the west side. */
  frame: number;
  flip: boolean;
  /** The bottom centre of the mount's cell. */
  mount: { x: number; y: number };
  /** The rider's feet, on the seat. */
  rider: { x: number; y: number };
};

/** Where the mount and its rider go for a character whose feet are at `feet`, as the game places them. */
export function ridePlacement(
  mount: Mount,
  direction: string,
  feet: { x: number; y: number },
  step: number,
  bob: number,
): RidePlacement {
  const drawn = RIDING.mirrored[direction] ?? direction;
  const flip = drawn !== direction;
  const row = Math.max(0, RIDING.directions.indexOf(drawn));
  const { w, h } = mount.cell;
  const [seatX, seatY] = mount.seat[drawn] ?? [w / 2, h / 2];
  const bottom = feet.y - RIDING.hover - bob;
  const left = feet.x - Math.floor(w / 2);
  const n = RIDING.framesPerDirection;
  return {
    frame: row * n + (((step % n) + n) % n),
    flip,
    mount: { x: feet.x, y: bottom },
    rider: {
      x: left + (flip ? w - 1 - seatX : seatX),
      y: bottom - h + seatY + RIDING.seatDrop,
    },
  };
}
