import { bayer, rgb, type Rgb } from "../pixels";
import {
  blob,
  capsule,
  layer,
  litSide,
  plume,
  poly,
  tones,
  type Hit,
  type Xy,
} from "../wing-shapes";
import type { DrawnWing } from "../wings";

const OUTLINE = rgb("#14040b");
const LEATHER = ["#bc2f4a", "#8a1c36", "#561028", "#2b0715"].map(rgb);
const BONE = ["#b08088", "#6a3646", "#341724"].map(rgb);
const CLAW = ["#f1e6d0", "#bfae92", "#7d6c58"].map(rgb);

const SHOULDER: Xy = [0.5, 29.5];
const ELBOW: Xy = [5.5, 21.2];
const WRIST: Xy = [13, 15];
const TIPS: Xy[] = [
  [35.5, 2.5],
  [37.8, 17.6],
  [30.8, 31],
  [14.7, 34.9],
];
const HIP: Xy = [3.5, 36];

const heading = (a: Xy, b: Xy): Xy => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
};
const at = (a: Xy, b: Xy, k: number): Xy => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
];
const angle = ([x, y]: Xy) => Math.atan2(y - WRIST[1], x - WRIST[0]);

/** The trailing edge dips toward the wrist between two finger tips. */
function scallop(a: Xy, b: Xy, depth: number): Xy[] {
  const mid = at(a, b, 0.5);
  const [ux, uy] = heading(mid, WRIST);
  const pull: Xy = [mid[0] + ux * depth * 2, mid[1] + uy * depth * 2];
  return Array.from({ length: 11 }, (_, i) => {
    const t = (i + 1) / 12;
    const [p, q, r] = [(1 - t) ** 2, 2 * t * (1 - t), t * t];
    return [
      p * a[0] + q * pull[0] + r * b[0],
      p * a[1] + q * pull[1] + r * b[1],
    ];
  });
}

const MEMBRANE: Xy[] = [
  SHOULDER,
  ELBOW,
  WRIST,
  TIPS[0],
  ...TIPS.slice(1).flatMap((tip, i) => [...scallop(TIPS[i], tip, 4.2), tip]),
  ...scallop(TIPS[3], HIP, 3.6),
  HIP,
  [0, 34],
];
const SPOKES = [...TIPS, SHOULDER].map(angle);

function membrane(_: Hit, x: number, y: number): Rgb {
  const cx = x + 0.5;
  const cy = y + 0.5;
  const r = Math.hypot(cx - WRIST[0], cy - WRIST[1]);
  const phi = angle([cx, cy]);
  let k = 0;
  while (k < SPOKES.length - 2 && phi > SPOKES[k + 1]) k++;
  const above = (phi - SPOKES[k]) * r;
  const below = (SPOKES[k + 1] - phi) * r;
  if (r < 6) return LEATHER[3];
  if (k < 3 && above > 1.8 && above < 2.9 && r > 9 && r < 26 && bayer(x, y) < 0.6)
    return LEATHER[0];
  const grain = bayer(x, y) * 2;
  if (above < 4.2 && (above < 3.2 || 4.2 - above > grain)) return LEATHER[1];
  return below < 3.4 && 3.4 - below > grain * 1.2 ? LEATHER[3] : LEATHER[2];
}

export const bat: DrawnWing = {
  id: "own-bat",
  name: "Bat Wings",
  description:
    "ปีกค้างคาวกางอยู่ด้านหลัง พังผืดเหนียวเหมือนหนังสีแดงเลือดหมูเข้มเกือบดำขึงระหว่างกระดูกนิ้วสีเข้มยาวสี่นิ้ว มีกรงเล็บโค้งที่ข้อปีก ขอบปีกด้านล่างเว้าเป็นลอนระหว่างปลายนิ้ว มีประกายสีแดงจาง ๆ บนพังผืด มีควันสีม่วงและแดงหมุนวนรอบตัวและประกายไฟลอยขึ้น กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "demon",
  far: 0xc8b4bc,
  drop: 0,
  w: 40,
  h: 40,
  root: { x: 0, y: 29 },
  paint: (px) => {
    layer(px, poly(MEMBRANE), OUTLINE, membrane);
    for (const tip of TIPS) {
      const [ux, uy] = heading(WRIST, tip);
      const end: Xy = [tip[0] + ux * 0.6, tip[1] + uy * 0.6];
      const knuckle: Xy = at(WRIST, end, 0.45);
      knuckle[0] += uy * 0.5;
      knuckle[1] -= ux * 0.5;
      const lit = litSide(WRIST, end);
      for (const [from, to, radius] of [
        [WRIST, knuckle, 1.35],
        [knuckle, end, 0.85],
      ] as [Xy, Xy, number][])
        layer(
          px,
          capsule(from, to, radius),
          OUTLINE,
          ({ side, half }) =>
            BONE[
              side * lit > half * 0.3 ? 0 : side * lit < -half * 0.3 ? 2 : 1
            ],
        );
      layer(
        px,
        blob(knuckle[0], knuckle[1], 1.2),
        OUTLINE,
        tones(BONE, 0.3, 0.5),
      );
    }
    for (const [from, to] of [
      [SHOULDER, ELBOW],
      [ELBOW, WRIST],
    ])
      layer(px, capsule(from, to, 1.6), OUTLINE, tones(BONE, 0.3, 0.4));
    layer(px, blob(ELBOW[0], ELBOW[1], 1.9), OUTLINE, tones(BONE, 0.3, 0.5));
    layer(
      px,
      plume(
        [WRIST[0] - 1.5, WRIST[1] - 1.5],
        [WRIST[0] - 5, WRIST[1] - 5],
        [WRIST[0] - 0.8, WRIST[1] - 8],
        3.4,
      ),
      OUTLINE,
      tones(CLAW, 0.3, 0.5),
    );
    layer(px, blob(WRIST[0], WRIST[1], 2.5), OUTLINE, tones(BONE, 0.3, 0.5));
  },
};
