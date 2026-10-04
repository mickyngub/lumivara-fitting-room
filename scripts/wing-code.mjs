import * as acorn from "acorn";
import * as eslintScope from "eslint-scope";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getText, need } from "./lumivara.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GAME_DIR = join(ROOT, "src", "game");
const WING_METHODS = ["setWings", "drawWings", "wingParts"];
const MAX_EXTRACTED_BYTES = 40_000;
// --check lifts the code in memory and compares it with the bundled file
// instead of writing it.
const CHECK = process.argv.includes("--check");

// Minifiers rename variables on every deploy; renaming them canonically (by
// first appearance) leaves only real changes, while property names and
// literals stay as they are.
const canonicalCode = (source) => {
    const code = source.replace(/^\/\/.*\n/, "");
    const tree = acorn.parse(code, { ecmaVersion: "latest", sourceType: "module", ranges: true });
    const ids = [];
    (function walk(node, parent, key) {
        if (!node || typeof node.type !== "string") return;
        if (node.type === "Identifier") {
            const member = parent?.type === "MemberExpression" && key === "property" && !parent.computed;
            const propKey =
                (parent?.type === "Property" || parent?.type === "MethodDefinition") && key === "key" && !parent.computed;
            if (!member && !propKey) ids.push(node);
        }
        for (const k of Object.keys(node)) {
            if (node.type === "Property" && node.shorthand && k === "key") continue;
            const child = node[k];
            if (Array.isArray(child)) child.forEach((c) => walk(c, node, k));
            else if (child && typeof child.type === "string") walk(child, node, k);
        }
    })(tree, null, null);
    const names = new Map();
    let out = "";
    let last = 0;
    for (const id of ids.sort((a, b) => a.range[0] - b.range[0])) {
        if (!names.has(id.name)) names.set(id.name, `$${names.size}`);
        out += code.slice(last, id.range[0]) + names.get(id.name);
        last = id.range[1];
    }
    return out + code.slice(last);
};

const home = await getText("/");
const mainChunk = need(home.match(/assets\/main-[\w-]+\.js/)?.[0], "main chunk");
const mainCode = await getText("/" + mainChunk);
const cosmetics = JSON.parse(await getText("/cosmetics.json"));
const scratch = mkdtempSync(join(tmpdir(), "lumivara-fashion-"));

// Wings are drawn by procedural code in the game's player class. Lift those
// methods and every module-level binding they reach, so the panel runs the
// game's own wing animation instead of an imitation.
const ast = acorn.parse(mainCode, { ecmaVersion: "latest", sourceType: "module", ranges: true });
const scopes = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: "module" });
const parents = new Map();
const methods = {};
(function walk(node, parent) {
    if (!node || typeof node.type !== "string") return;
    parents.set(node, parent);
    if (node.type === "MethodDefinition" && WING_METHODS.includes(node.key?.name)) {
        if (methods[node.key.name]) throw new Error(`${node.key.name} defined twice`);
        methods[node.key.name] = node;
    }
    for (const key of Object.keys(node)) {
        if (key === "parent") continue;
        const child = node[key];
        if (Array.isArray(child)) child.forEach((c) => walk(c, node));
        else if (child && typeof child.type === "string") walk(child, node);
    }
})(ast, null);
for (const name of WING_METHODS) need(methods[name], `method ${name}`);

const moduleScope = scopes.scopes.find((s) => s.type === "module");
const allRefs = scopes.scopes.flatMap((s) => s.references);
const inside = (node, range) => node.range[0] >= range[0] && node.range[1] <= range[1];
const moduleRefsIn = (range) =>
    allRefs.filter((r) => inside(r.identifier, range) && r.resolved?.scope === moduleScope);

const phaserNames = new Set();
const order = [];
const seen = new Set();
const visit = (variable) => {
    if (seen.has(variable)) return;
    seen.add(variable);
    const def = need(variable.defs[0], `definition of ${variable.name}`);
    if (def.type === "ImportBinding") throw new Error(`${variable.name} is imported; add a shim`);
    const node = def.type === "Variable" ? def.node : def.node;
    for (const ref of moduleRefsIn(node.range)) visit(ref.resolved);
    order.push(variable);
};
for (const node of Object.values(methods)) {
    for (const ref of moduleRefsIn(node.range)) {
        const parent = parents.get(ref.identifier);
        const isPhaser =
            parent?.type === "MemberExpression" &&
            parent.object === ref.identifier &&
            parent.property?.name === "BlendModes";
        if (isPhaser) phaserNames.add(ref.resolved.name);
        else visit(ref.resolved);
    }
}
const src = (node) => mainCode.slice(node.range[0], node.range[1]);
const declarations = order
    .filter((v) => !phaserNames.has(v.name))
    .map((v) => {
        const def = v.defs[0];
        if (def.type !== "Variable") return src(def.node);
        const kind = def.parent.kind === "var" ? "let" : def.parent.kind;
        return `${kind} ${v.name} = ${def.node.init ? src(def.node.init) : "undefined"};`;
    });
const configVar = need(
    order.find((v) => {
        const init = v.defs[0].node.init;
        return init?.type === "ObjectExpression" && init.properties.some((p) => p.key?.name === "divine_wings");
    }),
    "wing config",
);
const directionsVar = need(
    order.find((v) => {
        const init = v.defs[0].node.init;
        return init?.type === "ArrayExpression" && init.elements[0]?.value === "east";
    }),
    "direction list",
);
const wingSource =
    `// Generated by scripts/wing-code.mjs from ${mainChunk}. Do not edit by hand.\n` +
    `export function createWingKit(Phaser) {\n` +
    [...phaserNames].map((n) => `  const ${n} = Phaser;\n`).join("") +
    declarations.map((d) => `  ${d}\n`).join("") +
    `  return {\n    config: ${configVar.name},\n    directions: ${directionsVar.name},\n    methods: {\n` +
    WING_METHODS.map((m) => `      ${src(methods[m])},\n`).join("") +
    `    },\n  };\n}\n`;
if (wingSource.length > MAX_EXTRACTED_BYTES) {
    throw new Error(`wing code pulled in ${wingSource.length} bytes: ${order.map((v) => v.name).join(", ")}`);
}
writeFileSync(join(scratch, "wings.js"), wingSource);
if (!CHECK) writeFileSync(join(GAME_DIR, "wings.js"), wingSource);
if (!CHECK) writeFileSync(
    join(GAME_DIR, "wings.d.ts"),
    `// Generated by scripts/wing-code.mjs. Do not edit by hand.\n` +
        `import type { WingKit } from "./types";\nexport declare function createWingKit(phaser: unknown): WingKit;\n`,
);
const kit = (await import(pathToFileURL(join(scratch, "wings.js")).href)).createWingKit({
    BlendModes: { ADD: 1, NORMAL: 0 },
});
const directions = kit.directions;

// The panel takes wing placement from cosmetics.json and the effect (aura and
// far tint) from this code; a wing the code does not know draws with defaults.
const liveWings = cosmetics.skins.filter((s) => s.slot === "wings");
const withoutEffect = liveWings.filter((s) => !kit.config[s.id] && (s.wings?.aura === undefined || s.wings?.far === undefined)).map((s) => s.id);
const placementDiffers = liveWings
    .filter((s) => kit.config[s.id] && ["url", "rootX", "rootY", "scale"].some((k) => s.wings?.[k] !== kit.config[s.id][k]))
    .map((s) => s.id);
if (withoutEffect.length) console.log(`Wings in cosmetics.json with no effect in the game's wing code (they draw with default sparkles): ${withoutEffect.join(", ")}`);
if (placementDiffers.length) console.log(`Wing placement in cosmetics.json differs from the game's wing code (the panel follows cosmetics.json): ${placementDiffers.join(", ")}`);

if (CHECK) {
    if (canonicalCode(readFileSync(join(GAME_DIR, "wings.js"), "utf8")) !== canonicalCode(wingSource)) {
        console.log(`Wing animation code changed in ${mainChunk}. Run npm run wing-code.`);
        process.exit(1);
    }
    console.log(`Wing animation code is identical to ${mainChunk} (cosmetics.json build ${cosmetics.build}).`);
    process.exit(0);
}
console.log(JSON.stringify({ mainChunk, phaserShim: [...phaserNames], extracted: order.map((v) => v.name), wingBytes: wingSource.length, wings: Object.keys(kit.config) }, null, 1));
