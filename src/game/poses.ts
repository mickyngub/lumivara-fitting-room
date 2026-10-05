import type { Look } from "./types";

// The game's wing flap is sin(t / 420) standing and sin(t / 130) walking.
export const FLAP_PERIOD_MS = {
  walk: 2 * Math.PI * 130,
  idle: 2 * Math.PI * 420,
};
// The game's player steps idle frames every 180 ms and walk frames every 90 ms.
const IDLE_FRAME_MS = 180;
const WALK_FRAME_MS = 90;
// An action is timed in this many steps per loop.
const ACTION_STEPS = 15;
// A placed card shows about half the frames the preview does, which halves
// what it takes on the board; the preview keeps every step.
const CARD_FRAMES = { still: 8, walk: 4, action: 8 };

export type PoseId = "idle" | "walk" | "attack" | "attack-alt" | "cast" | "sit";
export type PoseDef = {
  id: PoseId;
  name: string;
  loopMs: number;
  cardFrames: number;
  walking: boolean;
  needs?: string;
};
export type PoseFrame = {
  anim: string;
  frame: number;
  wingMs: number;
  loop: { ms: number; loopMs: number };
};

export const POSES: PoseDef[] = [
  {
    id: "idle",
    name: "ยืน",
    loopMs: FLAP_PERIOD_MS.idle,
    cardFrames: CARD_FRAMES.still,
    walking: false,
  },
  {
    id: "walk",
    name: "เดิน",
    loopMs: FLAP_PERIOD_MS.walk,
    cardFrames: CARD_FRAMES.walk,
    walking: true,
  },
  {
    id: "attack",
    name: "โจมตี",
    loopMs: FLAP_PERIOD_MS.walk,
    cardFrames: CARD_FRAMES.action,
    walking: false,
    needs: "attack",
  },
  {
    id: "attack-alt",
    name: "โจมตี 2",
    loopMs: FLAP_PERIOD_MS.walk,
    cardFrames: CARD_FRAMES.action,
    walking: false,
    needs: "attack-alt",
  },
  {
    id: "cast",
    name: "ร่ายเวท",
    loopMs: FLAP_PERIOD_MS.walk,
    cardFrames: CARD_FRAMES.action,
    walking: false,
    needs: "cast",
  },
  {
    id: "sit",
    name: "นั่ง",
    loopMs: FLAP_PERIOD_MS.idle,
    cardFrames: CARD_FRAMES.still,
    walking: false,
    needs: "sit",
  },
];

export const posesFor = (look: Look): PoseDef[] =>
  POSES.filter(
    (p) => !p.needs || look.sheet.rows.some((r) => r.anim === p.needs),
  );

export const poseById = (id: string): PoseDef =>
  POSES.find((p) => p.id === id) ?? POSES[0];

const frameCount = (look: Look, anim: string, direction: string) =>
  look.sheet.rows.find((r) => r.anim === anim && r.dir === direction)?.count ??
  0;

/**
 * What the body and wings show t ms into a pose. Idle and walk run on the
 * game's own clocks. An action plays once at the start of each loop and then
 * holds the standing pose, while the wings make one full standing flap per
 * loop (as they do in the game during an attack), so a card closes its loop
 * without a seam.
 */
export function poseAt(
  pose: PoseDef,
  look: Look,
  direction: string,
  t: number,
): PoseFrame {
  const loop = { ms: t, loopMs: pose.loopMs };
  switch (pose.id) {
    case "idle":
      return {
        anim: "idle",
        frame: Math.floor(t / IDLE_FRAME_MS),
        wingMs: t,
        loop,
      };
    case "walk":
      return {
        anim: "walk",
        frame: Math.floor(t / WALK_FRAME_MS),
        wingMs: t,
        loop,
      };
    case "sit":
      return {
        anim: "sit",
        frame: Math.max(0, frameCount(look, "sit", direction) - 1),
        wingMs: t,
        loop,
      };
    default: {
      const phase =
        (((t % pose.loopMs) + pose.loopMs) % pose.loopMs) / pose.loopMs;
      // Cards sample exactly on step boundaries; the nudge stops float error repeating a step.
      const step = Math.floor(phase * ACTION_STEPS + 1e-9);
      const playing = step < frameCount(look, pose.id, direction);
      return {
        anim: playing ? pose.id : "idle",
        frame: playing ? step : 0,
        wingMs: phase * FLAP_PERIOD_MS.idle,
        loop,
      };
    }
  }
}
