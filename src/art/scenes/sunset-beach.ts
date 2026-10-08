import type { Effect } from "../effects";
import { calm, GOLD, WHITE } from "../scene-kit";
import {
  mix,
  put,
  quantize,
  rgb,
  ring,
  TAU,
  verticalGradient,
  wrap,
} from "../pixels";

export const sunsetBeach: Effect = {
  id: "sunset-beach",
  name: "ชายหาดยามเย็น",
  plate: "#6a3c2a",
  paint(px, feet, phase) {
    phase = wrap(phase);
    verticalGradient(px, [
      rgb("#2c1a4a"),
      rgb("#6a3c6b"),
      rgb("#b8656a"),
      rgb("#f5a866"),
      rgb("#ffc87b"),
    ]);

    const sunX = px.w * 0.72;
    const sunY = px.h * 0.55;
    const sunR = Math.max(6, Math.min(px.w, px.h) * 0.15);
    const hot = rgb("#fff4d6");
    const warm = rgb("#ffb84a");
    const shimmer = 0.4 + 0.15 * Math.sin(TAU * phase);

    for (let y = Math.floor(sunY - sunR * 1.5); y <= sunY; y++) {
      for (let x = Math.floor(sunX - sunR * 1.5); x <= sunX + sunR * 1.5; x++) {
        const dx = x - sunX;
        const dy = y - sunY;
        const d = Math.hypot(dx, dy);

        if (d < sunR * 0.95) {
          put(px, x, y, mix(hot, warm, dy / (sunR * 1.2)));
        } else if (d < sunR * 1.5) {
          const q = quantize(
            (1 - (d - sunR) / (sunR * 0.5)) * shimmer,
            3,
            x,
            y,
          );
          if (q > 0) put(px, x, y, rgb("#ffd699"), q * 0.65);
        }
      }
    }

    const waterTop = px.h * 0.65;
    const seaDeep = rgb("#1a3a5a");
    const seaMid = rgb("#3a5a8a");
    const seaShallow = rgb("#5a7aaa");
    const sand = rgb("#e8c89a");
    const sandDark = rgb("#a88060");

    for (let x = 0; x < px.w; x++) {
      const u = x / px.w;
      const wave1 = 0.04 * Math.sin(TAU * (u * 2.5 + phase * 0.6));
      const wave2 = 0.015 * Math.sin(TAU * (u * 5 - phase * 1.2));
      const waveY =
        waterTop + px.h * (wave1 + wave2 + 0.02 * Math.sin(TAU * (u * 1.3)));

      for (let y = Math.floor(waveY); y < px.h; y++) {
        const depth = (y - waveY) / (px.h - waveY + 1);

        if (y < feet.y) {
          const q = quantize(depth * 0.8, 3, x, y);
          put(
            px,
            x,
            y,
            depth < 0.5
              ? mix(seaShallow, seaMid, q)
              : mix(seaMid, seaDeep, q - 0.5),
          );
          const ripple = Math.abs(
            Math.sin(TAU * (u * 3 + depth * 0.8 + phase * 0.8)),
          );
          if (ripple < 0.15) put(px, x, y, WHITE, ripple * 0.2);
        } else {
          put(px, x, y, mix(sand, sandDark, quantize(depth * 0.6, 2, x, y)));
        }
      }
    }

    for (let y = Math.floor(waterTop - 2); y < feet.y; y++) {
      for (let x = 0; x < px.w; x++) {
        const reflection = Math.abs(
          Math.sin(TAU * ((x / px.w) * 2.3 + (y - waterTop) * 0.3 + phase)),
        );
        if (reflection > 0.85) {
          put(px, x, y, rgb("#ffd699"), reflection * 0.2);
        }
      }
    }

    const gulls = [
      { startX: 0.1, y: 0.3, speed: 0.8 },
      { startX: 0.6, y: 0.25, speed: 1 },
      { startX: 0.85, y: 0.32, speed: 0.6 },
    ];

    for (const gull of gulls) {
      const x = wrap(gull.startX + phase * gull.speed) * (px.w + 12) - 6;
      const y = px.h * gull.y;
      const a = calm(px, feet, x, y);

      put(px, x - 1, y, WHITE, a * 0.8);
      put(px, x + 1, y, WHITE, a * 0.8);
      put(px, x, y - 1, rgb("#d4e8f5"), a * 0.9);
    }

    ring(px, feet, 24, 7, GOLD, 0.6);
  },
};
