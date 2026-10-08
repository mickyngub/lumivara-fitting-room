const UPSTREAM = "https://lumivaraonline.com";
// Drawdy runs an extension's panel and code in sandboxed iframes, whose requests
// carry `Origin: null`. A game on its own site sends its own origin, so it is
// refused here just as Lumivara refuses it.
const PANEL_ORIGIN = "null";
const ART = /^(\/[\w.-]+)+\.(png|json)$/;
const PASSED_ON = ["content-type", "cache-control", "etag", "last-modified"];
const REVALIDATION = ["if-none-match", "if-modified-since"];

type Kept = { body: ReadableStream; httpMetadata?: { contentType?: string } };
export type Store = {
  get(key: string): Promise<Kept | null>;
  put(
    key: string,
    value: ArrayBuffer,
    options: { httpMetadata: { contentType: string } },
  ): Promise<unknown>;
};
export type Env = { STORE?: Store };
export type Context = { waitUntil(promise: Promise<unknown>): void };

function served(
  body: BodyInit | null,
  status: number,
  headers = new Headers(),
): Response {
  headers.set("access-control-allow-origin", "*");
  headers.set("vary", "Origin");
  return new Response(body, { status, headers });
}

/** Lumivara's art for the fitting room's panel, from Lumivara or, when it stops answering, from the copy kept in STORE. */
export async function handle(
  request: Request,
  env: Env,
  ctx: Context,
  upstream: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== "GET") return new Response(null, { status: 405 });
  if (request.headers.get("origin") !== PANEL_ORIGIN)
    return new Response(null, { status: 403 });
  const { pathname } = new URL(request.url);
  if (!ART.test(pathname)) return served(null, 404);

  const forward = new Headers();
  for (const name of REVALIDATION) {
    const value = request.headers.get(name);
    if (value) forward.set(name, value);
  }
  const res = await upstream(UPSTREAM + pathname, { headers: forward }).catch(
    () => null,
  );
  if (res && (res.ok || res.status === 304 || res.status === 404)) {
    const headers = new Headers();
    for (const name of PASSED_ON) {
      const value = res.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (res.status !== 200 || !env.STORE)
      return served(res.body, res.status, headers);
    const bytes = await res.arrayBuffer();
    ctx.waitUntil(
      env.STORE.put(pathname, bytes, {
        httpMetadata: {
          contentType:
            headers.get("content-type") ?? "application/octet-stream",
        },
      }),
    );
    return served(bytes, 200, headers);
  }

  const kept = await env.STORE?.get(pathname);
  if (!kept) return served(null, res?.status ?? 502);
  const headers = new Headers({ "cache-control": "no-cache" });
  if (kept.httpMetadata?.contentType)
    headers.set("content-type", kept.httpMetadata.contentType);
  return served(kept.body, 200, headers);
}

export default {
  fetch: (request: Request, env: Env, ctx: Context) =>
    handle(request, env, ctx),
};
