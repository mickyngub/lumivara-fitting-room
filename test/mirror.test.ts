import assert from "node:assert/strict";
import { test } from "node:test";
import { handle, type Context, type Store } from "../mirror/worker";

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const request = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://lumivara-mirror.test${path}`, { headers });
const fromPanel = (path: string, headers: Record<string, string> = {}) =>
  request(path, { origin: "null", ...headers });

function lumivara(
  respond: (init?: RequestInit) => Response | Promise<Response>,
) {
  const asked: { url: string; init?: RequestInit }[] = [];
  const upstream = (async (input: RequestInfo | URL, init?: RequestInit) => {
    asked.push({ url: String(input), init });
    return respond(init);
  }) as typeof fetch;
  return { asked, upstream };
}

function context() {
  const pending: Promise<unknown>[] = [];
  const ctx: Context = { waitUntil: (p) => void pending.push(p) };
  return { ctx, settled: () => Promise.all(pending) };
}

function memoryStore(): Store & { keys(): string[] } {
  const kept = new Map<string, { bytes: ArrayBuffer; contentType: string }>();
  return {
    async get(key) {
      const k = kept.get(key);
      return k
        ? {
            body: new Response(k.bytes).body!,
            httpMetadata: { contentType: k.contentType },
          }
        : null;
    },
    async put(key, value, options) {
      kept.set(key, {
        bytes: value,
        contentType: options.httpMetadata.contentType,
      });
    },
    keys: () => [...kept.keys()],
  };
}

const png = () =>
  new Response(PNG, {
    headers: { "content-type": "image/png", etag: '"abc"' },
  });

test("refuses a game on its own site, and anything sent with no origin, without asking Lumivara", async () => {
  const { asked, upstream } = lumivara(png);
  const sites: Record<string, string>[] = [{ origin: "https://copycat.example" }, {}];
  for (const headers of sites) {
    const res = await handle(
      request("/mounts/meadow_pegasus.png", headers),
      {},
      context().ctx,
      upstream,
    );
    assert.equal(res.status, 403);
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  }
  assert.deepEqual(asked, []);
});

test("serves Drawdy's sandboxed panel Lumivara's art with CORS, whatever query it adds", async () => {
  const { asked, upstream } = lumivara(png);
  const res = await handle(
    fromPanel("/mounts/meadow_pegasus.png?v=2"),
    {},
    context().ctx,
    upstream,
  );
  assert.deepEqual(
    asked.map((a) => a.url),
    ["https://lumivaraonline.com/mounts/meadow_pegasus.png"],
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.equal(res.headers.get("vary"), "Origin");
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), PNG);
});

test("serves only the game's art and data, not its pages or code", async () => {
  const { asked, upstream } = lumivara(png);
  for (const path of [
    "/",
    "/play",
    "/assets/main-h8slX4rf.js",
    "/cosmetics.json/",
  ]) {
    const res = await handle(fromPanel(path), {}, context().ctx, upstream);
    assert.equal(res.status, 404, path);
  }
  assert.deepEqual(asked, []);
});

test("passes a revalidation through, so an unchanged file comes back as 304", async () => {
  const { asked, upstream } = lumivara(
    () => new Response(null, { status: 304 }),
  );
  const res = await handle(
    fromPanel("/cosmetics.json", { "if-none-match": '"abc"' }),
    {},
    context().ctx,
    upstream,
  );
  assert.equal(
    new Headers(asked[0].init?.headers).get("if-none-match"),
    '"abc"',
  );
  assert.equal(res.status, 304);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
});

test("keeps what it serves and falls back to it when Lumivara stops answering", async () => {
  const store = memoryStore();
  const first = context();
  await handle(
    fromPanel("/mounts/meadow_pegasus.png"),
    { STORE: store },
    first.ctx,
    lumivara(png).upstream,
  );
  await first.settled();
  assert.deepEqual(store.keys(), ["/mounts/meadow_pegasus.png"]);

  for (const down of [
    lumivara(() => Promise.reject(new TypeError("fetch failed"))).upstream,
    lumivara(() => new Response(null, { status: 403 })).upstream,
  ]) {
    const res = await handle(
      fromPanel("/mounts/meadow_pegasus.png"),
      { STORE: store },
      context().ctx,
      down,
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.equal(res.headers.get("content-type"), "image/png");
    assert.deepEqual(new Uint8Array(await res.arrayBuffer()), PNG);
  }

  const missing = await handle(
    fromPanel("/mounts/skytide_manta.png"),
    { STORE: store },
    context().ctx,
    lumivara(() => new Response(null, { status: 503 })).upstream,
  );
  assert.equal(missing.status, 503);
  assert.equal(missing.headers.get("access-control-allow-origin"), "*");
});
