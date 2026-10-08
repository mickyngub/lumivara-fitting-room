import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const UPSTREAM = "https://lumivaraonline.com";
const ART = /^(\/[\w-][\w.-]*)+\.(png|json)$/;
const KEPT = ["/_headers", "/cosmetics.json"];
const PARALLEL = 8;

export type Synced = {
  files: number;
  written: number;
  removed: number;
  missing: string[];
};

/** Every same-site .png or .json path cosmetics.json mentions, wherever in the file it sits. */
export function artPaths(cosmetics: unknown): string[] {
  const found = new Set<string>();
  const visit = (v: unknown): void => {
    if (typeof v === "string") {
      if (ART.test(v)) found.add(v);
    } else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") Object.values(v).forEach(visit);
  };
  visit(cosmetics);
  return [...found].sort();
}

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, {
    recursive: true,
    withFileTypes: true,
  }).catch(() => []);
  return entries
    .filter((e) => e.isFile())
    .map(
      (e) =>
        "/" + relative(dir, join(e.parentPath, e.name)).split(sep).join("/"),
    );
}

/**
 * Copies Lumivara's cosmetics.json and every file it mentions into dir and drops
 * the files it no longer mentions. A file Lumivara answers 404 for keeps its last
 * copy; any other failure stops the copy before cosmetics.json is written, so the
 * copy never lists a file it lacks.
 */
export async function sync(
  dir: string,
  get: typeof fetch = fetch,
): Promise<Synced> {
  const res = await get(`${UPSTREAM}/cosmetics.json`);
  if (!res.ok) throw new Error(`/cosmetics.json: HTTP ${res.status}`);
  const catalog = await res.text();
  const paths = artPaths(JSON.parse(catalog));
  const missing: string[] = [];
  let written = 0;
  const queue = [...paths];
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      for (let path = queue.shift(); path; path = queue.shift()) {
        const r = await get(UPSTREAM + path);
        if (r.status === 404) {
          missing.push(path);
          continue;
        }
        if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
        const bytes = new Uint8Array(await r.arrayBuffer());
        const file = join(dir, path);
        const old = await readFile(file).catch(() => null);
        if (old && Buffer.compare(old, bytes) === 0) continue;
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, bytes);
        written++;
      }
    }),
  );
  const keep = new Set([...paths, ...KEPT]);
  let removed = 0;
  for (const file of await filesUnder(dir)) {
    if (keep.has(file)) continue;
    await rm(join(dir, file));
    removed++;
  }
  await writeFile(join(dir, "cosmetics.json"), catalog);
  return { files: paths.length + 1, written, removed, missing: missing.sort() };
}

/** Whether the deployed mirror already serves Lumivara's current cosmetics.json; every Lumivara deploy changes its build id. */
async function alreadyServed(mirror: string): Promise<boolean> {
  const [upstream, served] = await Promise.all(
    [`${UPSTREAM}/cosmetics.json`, `${mirror}/cosmetics.json`].map((url) =>
      fetch(url, { headers: { origin: "null" } }).then(
        (r) => (r.ok ? r.text() : null),
        () => null,
      ),
    ),
  );
  return upstream !== null && upstream === served;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const mirror = process.env.MIRROR_URL;
  const changed = !(mirror && (await alreadyServed(mirror)));
  if (changed) {
    const r = await sync(
      join(dirname(fileURLToPath(import.meta.url)), "public"),
    );
    console.log(`${r.files} files, ${r.written} written, ${r.removed} removed`);
    if (r.missing.length)
      console.log(
        `Lumivara has lost ${r.missing.join(", ")}; kept the last copy where there was one.`,
      );
  } else
    console.log(`${mirror} already serves Lumivara's current cosmetics.json.`);
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}
