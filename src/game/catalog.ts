import type { Look, Sheet, SheetRow, WingInfo, WingStyle } from "./types";

export const LUMIVARA = "https://lumivaraonline.com";
export const COSMETICS_URL = `${LUMIVARA}/cosmetics.json`;
const COSMETICS_FORMAT = 1;
// Tint for the far wing of a wing the bundled wing code has never seen.
const DEFAULT_FAR = 0xb8b8b8;
const ANIMS = ["idle", "walk"];
// Action poses ship in every atlas today but are optional; cast is the Mage's.
const OPTIONAL_ANIMS = ["attack", "attack-alt", "cast", "sit"];
// The game's sprites stand 16 px above the bottom of their cell.
const FEET_FROM_BOTTOM = 16;

export type Atlas = { png: string; json: string };
export type WingPlacement = {
  url: string;
  rimUrl?: string;
  rootX: number;
  rootY: number;
  scale: number;
  drop?: number;
  far?: number;
  aura?: string;
};
export type Skin = {
  id: string;
  slot: string;
  name: string;
  description?: string;
  icon?: string;
  classId?: string;
  className?: string;
  atlas?: Atlas;
  wings?: WingPlacement;
};
export type Cosmetics = {
  format: number;
  build: string;
  classes: { id: string; name: string; atlas: Atlas }[];
  skins: Skin[];
};

export type LookSource = Omit<Look, "sheet"> & { atlas: Atlas };
export type WingEntry = {
  info: WingInfo;
  style: WingStyle;
  textures: Record<string, string>;
};
export type CatalogPlan = {
  build: string;
  looks: LookSource[];
  wings: WingEntry[];
  wingsWithoutEffect: string[];
};

export const absolute = (path: string) => new URL(path, LUMIVARA).href;

export function isCosmetics(v: unknown): v is Cosmetics {
  const c = v as Cosmetics;
  return (
    !!c &&
    c.format === COSMETICS_FORMAT &&
    Array.isArray(c.classes) &&
    Array.isArray(c.skins)
  );
}

/**
 * Turns the game's cosmetics.json into the panel's looks and wing styles.
 * Placement comes from the file; the wing effect (aura, far tint) comes from
 * the bundled wing code until the file carries it.
 */
export function planCatalog(
  c: Cosmetics,
  codeStyles: Record<string, WingStyle>,
): CatalogPlan {
  const classNames = new Map(c.classes.map((k) => [k.id, k.name]));
  const looks: LookSource[] = [
    ...c.skins
      .filter(
        (s) =>
          s.slot === "outfit" &&
          s.atlas &&
          s.classId &&
          classNames.has(s.classId),
      )
      .map((s) => ({
        id: `outfit:${s.id}`,
        kind: "outfit" as const,
        itemId: s.id,
        classId: s.classId!,
        className: s.className ?? classNames.get(s.classId!)!,
        name: s.name,
        description: s.description ?? "",
        source: s.atlas!.png.replace(/\.png$/, ""),
        atlas: s.atlas!,
      })),
    ...c.classes.map((k) => ({
      id: `class:${k.id}`,
      kind: "class" as const,
      classId: k.id,
      className: k.name,
      name: k.name,
      description: "",
      source: k.atlas.png.replace(/\.png$/, ""),
      atlas: k.atlas,
    })),
  ];
  const wings: WingEntry[] = [];
  const wingsWithoutEffect: string[] = [];
  for (const s of c.skins) {
    if (s.slot !== "wings" || !s.wings) continue;
    const code = codeStyles[s.id];
    if (!code && (s.wings.aura === undefined || s.wings.far === undefined))
      wingsWithoutEffect.push(s.id);
    const texture = `wing:${s.id}`;
    const rim = s.wings.rimUrl ? `wing:${s.id}:rim` : undefined;
    wings.push({
      info: {
        id: s.id,
        name: s.name,
        description: s.description ?? "",
        ...(s.icon ? { icon: absolute(s.icon) } : {}),
      },
      style: {
        texture,
        url: s.wings.url,
        rootX: s.wings.rootX,
        rootY: s.wings.rootY,
        scale: s.wings.scale,
        drop: s.wings.drop ?? code?.drop ?? 0,
        far: s.wings.far ?? code?.far ?? DEFAULT_FAR,
        ...((s.wings.aura ?? code?.aura)
          ? { aura: s.wings.aura ?? code?.aura }
          : {}),
        ...(rim ? { rim, rimUrl: s.wings.rimUrl } : {}),
      },
      textures: {
        [texture]: absolute(s.wings.url),
        ...(rim ? { [rim]: absolute(s.wings.rimUrl!) } : {}),
      },
    });
  }
  return { build: c.build, looks, wings, wingsWithoutEffect };
}

type AtlasFrame = {
  filename?: string;
  frame: { x: number; y: number; w: number; h: number };
  rotated?: boolean;
  trimmed?: boolean;
  spriteSourceSize: { x: number; y: number };
  sourceSize: { w: number; h: number };
};
export type AtlasJson = {
  frames: AtlasFrame[] | Record<string, AtlasFrame>;
  meta?: { baseline?: number };
};
export type Blit = {
  sx: number;
  sy: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
};

/** Where every idle and walk frame of a game atlas goes in the panel's sheet: one row per animation and direction. */
export function layoutSheet(
  json: AtlasJson,
  directions: string[],
): Omit<Sheet, "png"> & { size: { w: number; h: number }; blits: Blit[] } {
  const frames = Array.isArray(json.frames)
    ? Object.fromEntries(json.frames.map((f) => [f.filename!, f]))
    : json.frames;
  const countOf = (anim: string, dir: string) => {
    let count = 0;
    while (frames[`${anim}/${dir}/${count}`]) count++;
    return count;
  };
  const rows: SheetRow[] = [
    ...ANIMS.flatMap((anim) =>
      directions.map((dir) => {
        const count = countOf(anim, dir);
        if (!count) throw new Error(`no ${anim}/${dir} frames`);
        return { anim, dir, count };
      }),
    ),
    ...OPTIONAL_ANIMS.filter((anim) => directions.every((dir) => countOf(anim, dir) > 0)).flatMap((anim) =>
      directions.map((dir) => ({ anim, dir, count: countOf(anim, dir) })),
    ),
  ];
  const sample = frames[`${rows[0].anim}/${rows[0].dir}/0`];
  const cell = { w: sample.sourceSize.w, h: sample.sourceSize.h };
  const cols = Math.max(...rows.map((r) => r.count));
  const blits: Blit[] = [];
  rows.forEach((row, r) => {
    for (let i = 0; i < row.count; i++) {
      const f = frames[`${row.anim}/${row.dir}/${i}`];
      if (f.rotated) throw new Error("rotated atlas frames are not supported");
      const off = f.trimmed ? f.spriteSourceSize : { x: 0, y: 0 };
      blits.push({
        sx: f.frame.x,
        sy: f.frame.y,
        w: f.frame.w,
        h: f.frame.h,
        dx: i * cell.w + off.x,
        dy: r * cell.h + off.y,
      });
    }
  });
  return {
    cell,
    baseline: json.meta?.baseline ?? cell.h - FEET_FROM_BOTTOM,
    rows,
    size: { w: cols * cell.w, h: rows.length * cell.h },
    blits,
  };
}
