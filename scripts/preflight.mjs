import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// What a Drawdy submission needs beyond the repository's own tests: Drawdy
// builds the pushed commit, refuses a version that is not above the live one,
// and fails a bundle over its limit.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://backend.drawdy.io";
const MAX_BUNDLE_BYTES = 5 * 1024 * 1024;

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const newer = (a, b) => {
    const [x, y] = [a, b].map((v) => v.split(".").map(Number));
    const i = x.findIndex((n, k) => n !== y[k]);
    return i >= 0 && x[i] > y[i];
};
const problems = [];

if (git("status", "--porcelain")) problems.push("The tree has uncommitted changes; Drawdy builds the pushed commit, not this tree.");

execFileSync("npm", ["run", "build", "--silent"], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
if (git("status", "--porcelain", "src/webview-html.ts")) problems.push("src/webview-html.ts changed when rebuilt; commit it.");
const bundle = statSync(join(ROOT, "dist", "main.js")).size;
if (bundle > MAX_BUNDLE_BYTES) problems.push(`The bundle is ${bundle} bytes; Drawdy takes ${MAX_BUNDLE_BYTES}.`);

git("fetch", "--quiet", "origin");
const head = git("rev-parse", "HEAD");
const tip = git("rev-parse", "origin/HEAD");
if (head !== tip) problems.push(`HEAD ${head.slice(0, 7)} is not the tip of origin's default branch (${tip.slice(0, 7)}); push it first.`);

const res = await fetch(`${API}/api/extensions/catalog/${encodeURIComponent(manifest.driverId)}`);
if (!res.ok && res.status !== 404) throw new Error(`Drawdy catalog: HTTP ${res.status}`);
const live = res.ok ? (await res.json()).entry : null;
if (live && !newer(manifest.driverVersion, live.version)) problems.push(`driverVersion ${manifest.driverVersion} is not above the live ${live.version}; bump it in manifest.json and CHANGELOG.md.`);

// The panel reads everything from the copy in mirror/, so a release needs it
// deployed and letting the sandboxed panel (origin null), and no other site, use the art.
const assets = readFileSync(join(ROOT, "src", "game", "catalog.ts"), "utf8").match(/export const ASSETS = "([^"]+)"/)?.[1];
const asOrigin = (origin) =>
    fetch(`${assets}/cosmetics.json`, { headers: { origin } }).then(
        (r) => ({ status: r.status, cors: r.headers.get("access-control-allow-origin") }),
        (e) => ({ status: 0, cors: null, error: e.cause?.code ?? e.message }),
    );
if (!assets) problems.push("No ASSETS URL in src/game/catalog.ts.");
else {
    const [panel, other] = await Promise.all([asOrigin("null"), asOrigin("https://example.com")]);
    if (panel.status !== 200 || panel.cors !== "null")
        problems.push(`The mirror at ${assets} does not serve the panel (${panel.error ?? `HTTP ${panel.status}, Access-Control-Allow-Origin ${panel.cors}`}); deploy mirror/ and set ASSETS to its URL.`);
    else if (other.cors === "*" || other.cors === "https://example.com")
        problems.push(`The mirror at ${assets} lets other sites use the art (Access-Control-Allow-Origin ${other.cors}); it must allow only null.`);
}

console.log(`${manifest.driverId} ${manifest.driverVersion} at ${head.slice(0, 7)} · bundle ${(bundle / 1024).toFixed(0)} KB`);
console.log(live ? `Live: ${live.version} at ${live.commitSha.slice(0, 7)}, published ${live.publishedAt}` : "Live: not published yet");
if (problems.length) {
    for (const p of problems) console.log(`✗ ${p}`);
    process.exit(1);
}
console.log(`✓ Ready to submit ${head} as ${manifest.driverVersion}.`);
