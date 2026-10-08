import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { artPaths, sync } from "../mirror/sync";

const COSMETICS = {
  format: 1,
  build: "b1",
  classes: [
    {
      id: "novice",
      atlas: { png: "/novice-v6/player.png", json: "/novice-v6/player.json" },
    },
  ],
  skins: [
    {
      id: "demon_wings",
      icon: "/items/demon_wings.png",
      description: "ปีกปีศาจ / not a path.png",
      wings: {
        url: "/wings/demon-wings.png",
        rimUrl: "/wings/demon-wings-rim.png",
        rootX: 1,
      },
    },
    {
      id: "star",
      nameFrame: {
        url: "/name-frames/star.png",
        gemUrl: "/name-frames/star-gem.png",
      },
    },
    {
      id: "pegasus",
      mount: { sheet: "/mounts/meadow_pegasus.png", cell: [112, 118] },
    },
    {
      id: "odd",
      icon: "https://other.example/x.png",
      extra: ["/../secret.png", "/assets/main.js", "/./x.png"],
    },
  ],
};
const FILES = artPaths(COSMETICS);

function lumivara(files: Record<string, number | string>) {
  return (async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname;
    if (path === "/cosmetics.json")
      return new Response(JSON.stringify(COSMETICS));
    const file = files[path];
    if (typeof file === "number") return new Response(null, { status: file });
    return new Response(file ?? `art of ${path}`);
  }) as typeof fetch;
}

async function inMirror(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "lumivara-mirror-"));
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "_headers"),
      "/*\n  Access-Control-Allow-Origin: null\n",
    );
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function put(dir: string, path: string, text: string) {
  await mkdir(dirname(join(dir, path)), { recursive: true });
  await writeFile(join(dir, path), text);
}

test("finds every file cosmetics.json mentions, wherever it sits, and nothing off the site", () => {
  assert.deepEqual(FILES, [
    "/items/demon_wings.png",
    "/mounts/meadow_pegasus.png",
    "/name-frames/star-gem.png",
    "/name-frames/star.png",
    "/novice-v6/player.json",
    "/novice-v6/player.png",
    "/wings/demon-wings-rim.png",
    "/wings/demon-wings.png",
  ]);
});

test("copies every file, drops what Lumivara no longer mentions, and keeps _headers", async () => {
  await inMirror(async (dir) => {
    await put(dir, "/mounts/retired.png", "old");
    await put(dir, "/items/demon_wings.png", "art of /items/demon_wings.png");
    const r = await sync(dir, lumivara({}));
    assert.deepEqual(r, {
      files: FILES.length + 1,
      written: FILES.length - 1,
      removed: 1,
      missing: [],
    });
    for (const path of FILES)
      assert.equal(await readFile(join(dir, path), "utf8"), `art of ${path}`);
    assert.equal(existsSync(join(dir, "mounts", "retired.png")), false);
    assert.match(
      await readFile(join(dir, "_headers"), "utf8"),
      /Access-Control-Allow-Origin: null/,
    );
    assert.deepEqual(
      JSON.parse(await readFile(join(dir, "cosmetics.json"), "utf8")),
      COSMETICS,
    );
  });
});

test("leaves the copy as it was when Lumivara fails partway", async () => {
  await inMirror(async (dir) => {
    await put(dir, "/cosmetics.json", "previous");
    await put(dir, "/mounts/retired.png", "old");
    await assert.rejects(
      sync(dir, lumivara({ "/wings/demon-wings.png": 503 })),
      /demon-wings\.png: HTTP 503/,
    );
    assert.equal(
      await readFile(join(dir, "cosmetics.json"), "utf8"),
      "previous",
    );
    assert.equal(existsSync(join(dir, "mounts", "retired.png")), true);
  });
});

test("keeps the last copy of a file Lumivara has lost, and copies the rest", async () => {
  await inMirror(async (dir) => {
    await put(dir, "/mounts/meadow_pegasus.png", "last copy");
    const r = await sync(
      dir,
      lumivara({
        "/mounts/meadow_pegasus.png": 404,
        "/items/demon_wings.png": 404,
      }),
    );
    assert.deepEqual(r.missing, [
      "/items/demon_wings.png",
      "/mounts/meadow_pegasus.png",
    ]);
    assert.equal(
      await readFile(join(dir, "mounts", "meadow_pegasus.png"), "utf8"),
      "last copy",
    );
    assert.equal(
      await readFile(join(dir, "wings", "demon-wings.png"), "utf8"),
      "art of /wings/demon-wings.png",
    );
  });
});

test("the deployed copy lets only sandboxed pages, like Drawdy's panel, use the art", async () => {
  const headers = await readFile(
    new URL("../mirror/public/_headers", import.meta.url),
    "utf8",
  );
  assert.match(headers, /^\/\*\n {2}Access-Control-Allow-Origin: null$/m);
  assert.doesNotMatch(headers, /Access-Control-Allow-Origin: \*/);
});
