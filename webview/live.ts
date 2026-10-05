import {
  absolute,
  COSMETICS_URL,
  isCosmetics,
  layoutSheet,
  planCatalog,
  type AtlasJson,
  type LookSource,
} from "../src/game/catalog";
import { NAME_FRAME_SLICES } from "../src/game/name-frames";
import type { Look, NameFrame, WingInfo, WingStyle } from "../src/game/types";

const FETCH_TIMEOUT_MS = 15000;
const PARALLEL_ATLASES = 4;

export type Catalog = {
  build: string;
  looks: Look[];
  wings: WingInfo[];
  styles: Record<string, WingStyle>;
  wingTextures: Record<string, string>;
  nameFrames: NameFrame[];
};

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-cache",
  });
  if (!res.ok) throw new Error(`${new URL(url).pathname}: HTTP ${res.status}`);
  return res;
}

/** Loads an image, giving up after the same wait as a fetch so a stalled download cannot hang the panel. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const where = url.startsWith("data:") ? "image" : new URL(url).pathname;
    const timer = setTimeout(() => {
      img.src = "";
      reject(new Error(`${where}: image timed out`));
    }, FETCH_TIMEOUT_MS);
    img.crossOrigin = "anonymous";
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`${where}: image failed`));
    };
    img.src = url;
  });
}

async function buildLook(
  source: LookSource,
  directions: string[],
): Promise<Look> {
  const [json, atlas] = await Promise.all([
    fetchOk(absolute(source.atlas.json)).then(
      (r) => r.json() as Promise<AtlasJson>,
    ),
    loadImage(absolute(source.atlas.png)),
  ]);
  const layout = layoutSheet(json, directions);
  const canvas = document.createElement("canvas");
  canvas.width = layout.size.w;
  canvas.height = layout.size.h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (const b of layout.blits)
    ctx.drawImage(atlas, b.sx, b.sy, b.w, b.h, b.dx, b.dy, b.w, b.h);
  const { atlas: _atlas, ...look } = source;
  return {
    ...look,
    sheet: {
      png: canvas
        .toDataURL("image/png")
        .replace(/^data:image\/png;base64,/, ""),
      cell: layout.cell,
      baseline: layout.baseline,
      rows: layout.rows,
    },
  };
}

/** Everything the panel shows, read from the game every time the panel opens. */
export async function loadCatalog(
  codeStyles: Record<string, WingStyle>,
  directions: string[],
  progress: (done: number, total: number) => void,
): Promise<Catalog> {
  const cosmetics = await (await fetchOk(COSMETICS_URL)).json();
  if (!isCosmetics(cosmetics))
    throw new Error("cosmetics.json has a format this panel does not know");
  const plan = planCatalog(cosmetics, codeStyles, NAME_FRAME_SLICES);
  const looks: Look[] = new Array(plan.looks.length);
  let done = 0;
  progress(done, plan.looks.length);
  let next = 0;
  const worker = async () => {
    while (next < plan.looks.length) {
      const i = next++;
      looks[i] = await buildLook(plan.looks[i], directions);
      progress(++done, plan.looks.length);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL_ATLASES }, worker));
  return {
    build: plan.build,
    looks,
    wings: plan.wings.map((w) => w.info),
    styles: Object.fromEntries(plan.wings.map((w) => [w.info.id, w.style])),
    wingTextures: Object.assign({}, ...plan.wings.map((w) => w.textures)),
    nameFrames: plan.nameFrames,
  };
}
