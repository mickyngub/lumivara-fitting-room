import * as acorn from "acorn";
import * as eslintScope from "eslint-scope";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PNG } from "pngjs";
import { crc32, deflateSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GAME_DIR = join(ROOT, "src", "game");
const ORIGIN = "https://lumivaraonline.com";
// Neutral UA on purpose: nothing that identifies whoever runs the snapshot.
const UA = "drawdy-lumivara-fashion/0.1 (https://drawdy.io)";
const ANIMS = ["idle", "walk"];
const WING_METHODS = ["setWings", "drawWings", "wingParts"];
const MAX_EXTRACTED_BYTES = 40_000;

const fetchOk = async (path) => {
    const res = await fetch(ORIGIN + path, { headers: { "user-agent": UA } });
    if (!res.ok) throw new Error(`GET ${path}: HTTP ${res.status}`);
    return res;
};
const getText = async (path) => (await fetchOk(path)).text();
const getBytes = async (path) => Buffer.from(await (await fetchOk(path)).arrayBuffer());
const need = (value, what) => {
    if (!value) throw new Error(`${what} not found`);
    return value;
};

const home = await getText("/");
const mainChunk = need(home.match(/assets\/main-[\w-]+\.js/)?.[0], "main chunk");
const equipmentChunk = need(home.match(/assets\/equipment-[\w-]+\.js/)?.[0], "equipment chunk");
const mainCode = await getText("/" + mainChunk);
const equipmentCode = await getText("/" + equipmentChunk);

const scratch = mkdtempSync(join(tmpdir(), "lumivara-fashion-"));
writeFileSync(join(scratch, "equipment.mjs"), equipmentCode);
const G = await import(pathToFileURL(join(scratch, "equipment.mjs")).href);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const pickExport = (test, what) => {
    const hits = Object.values(G).filter((v) => {
        try {
            return test(v);
        } catch {
            return false;
        }
    });
    if (hits.length !== 1) throw new Error(`${what}: ${hits.length} matches`);
    return hits[0];
};
const cosmetics = pickExport(
    (v) =>
        isObj(v) &&
        Object.values(v).length > 1 &&
        Object.values(v).every((c) => c.slot === "wings" || c.slot === "outfit") &&
        Object.values(v).some((c) => c.slot === "outfit"),
    "cosmetics table",
);
const classNames = pickExport((v) => isObj(v) && v.swordman === "Swordsman", "class names");

const classAtlas = Object.fromEntries(
    [...mainCode.matchAll(/"player-([a-z_]+)":"(\/jobs\/[^"]+)"/g)].map((m) => [m[1], m[2]]),
);
const outfitAtlas = Object.fromEntries(
    [...mainCode.matchAll(/"outfit-([a-z_]+)":"(\/jobs\/[^"]+)"/g)].map((m) => [m[1], m[2]]),
);
const novice = need(
    mainCode.match(/load\.atlas\("player","([^"]+)\.png","[^"]+\.json"\)/),
    "novice atlas",
);
classAtlas.novice ??= novice[1];
for (const classId of Object.keys(classNames)) need(classAtlas[classId], `atlas for class ${classId}`);
for (const [id, c] of Object.entries(cosmetics)) {
    if (c.slot === "outfit") need(outfitAtlas[id], `atlas for outfit ${id}`);
}

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
    `// Generated by scripts/snapshot.mjs from ${mainChunk}. Do not edit by hand.\n` +
    `export function createWingKit(Phaser) {\n` +
    [...phaserNames].map((n) => `  const ${n} = Phaser;\n`).join("") +
    declarations.map((d) => `  ${d}\n`).join("") +
    `  return {\n    config: ${configVar.name},\n    directions: ${directionsVar.name},\n    methods: {\n` +
    WING_METHODS.map((m) => `      ${src(methods[m])},\n`).join("") +
    `    },\n  };\n}\n`;
if (wingSource.length > MAX_EXTRACTED_BYTES) {
    throw new Error(`wing code pulled in ${wingSource.length} bytes: ${order.map((v) => v.name).join(", ")}`);
}
writeFileSync(join(GAME_DIR, "wings.js"), wingSource);
writeFileSync(
    join(GAME_DIR, "wings.d.ts"),
    `// Generated by scripts/snapshot.mjs. Do not edit by hand.\n` +
        `import type { WingKit } from "./types";\nexport declare function createWingKit(phaser: unknown): WingKit;\n`,
);
const kit = (await import(pathToFileURL(join(GAME_DIR, "wings.js")).href + `?t=${Date.now()}`)).createWingKit({
    BlendModes: { ADD: 1, NORMAL: 0 },
});
const directions = kit.directions;

// The game ships its atlases as 256-colour indexed PNGs; writing the packed
// sheets back the same way keeps the extension bundle a few times smaller
// than pngjs's RGBA output.
const indexedPng = (image) => {
    const colours = new Map();
    const indices = Buffer.alloc(image.width * image.height);
    for (let i = 0; i < indices.length; i++) {
        const a = image.data[i * 4 + 3];
        const key = a === 0 ? 0 : image.data.readUInt32BE(i * 4);
        let index = colours.get(key);
        if (index === undefined) {
            index = colours.size;
            if (index > 255) return null;
            colours.set(key, index);
        }
        indices[i] = index;
    }
    const rows = Buffer.alloc((image.width + 1) * image.height);
    for (let y = 0; y < image.height; y++) {
        indices.copy(rows, y * (image.width + 1) + 1, y * image.width, (y + 1) * image.width);
    }
    const palette = Buffer.alloc(colours.size * 3);
    const alpha = Buffer.alloc(colours.size);
    for (const [key, index] of colours) {
        palette[index * 3] = (key >>> 24) & 255;
        palette[index * 3 + 1] = (key >>> 16) & 255;
        palette[index * 3 + 2] = (key >>> 8) & 255;
        alpha[index] = key & 255;
    }
    const chunk = (type, data) => {
        const head = Buffer.alloc(8);
        head.writeUInt32BE(data.length, 0);
        head.write(type, 4, "ascii");
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
        return Buffer.concat([head, data, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(image.width, 0);
    ihdr.writeUInt32BE(image.height, 4);
    ihdr.set([8, 3, 0, 0, 0], 8);
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", ihdr),
        chunk("PLTE", palette),
        chunk("tRNS", alpha),
        chunk("IDAT", deflateSync(rows, { level: 9 })),
        chunk("IEND", Buffer.alloc(0)),
    ]);
};

const packSheet = (atlasJson, atlasPng) => {
    const frames = Array.isArray(atlasJson.frames)
        ? Object.fromEntries(atlasJson.frames.map((f) => [f.filename, f]))
        : atlasJson.frames;
    const atlas = PNG.sync.read(atlasPng);
    const rows = ANIMS.flatMap((anim) =>
        directions.map((dir) => {
            let count = 0;
            while (frames[`${anim}/${dir}/${count}`]) count++;
            if (!count) throw new Error(`no ${anim}/${dir} frames`);
            return { anim, dir, count };
        }),
    );
    const sample = frames[`${rows[0].anim}/${rows[0].dir}/0`];
    const cell = { w: sample.sourceSize.w, h: sample.sourceSize.h };
    const cols = Math.max(...rows.map((r) => r.count));
    const sheet = new PNG({ width: cols * cell.w, height: rows.length * cell.h });
    rows.forEach((row, r) => {
        for (let i = 0; i < row.count; i++) {
            const f = frames[`${row.anim}/${row.dir}/${i}`];
            if (f.rotated) throw new Error("rotated atlas frames are not supported");
            const off = f.trimmed ? f.spriteSourceSize : { x: 0, y: 0 };
            for (let y = 0; y < f.frame.h; y++) {
                const from = ((f.frame.y + y) * atlas.width + f.frame.x) * 4;
                const to = ((r * cell.h + off.y + y) * sheet.width + i * cell.w + off.x) * 4;
                atlas.data.copy(sheet.data, to, from, from + f.frame.w * 4);
            }
        }
    });
    return {
        png: (indexedPng(sheet) ?? PNG.sync.write(sheet)).toString("base64"),
        cell,
        baseline: atlasJson.meta?.baseline ?? cell.h - 16,
        rows,
    };
};

const lookSources = [
    ...Object.entries(cosmetics)
        .filter(([, c]) => c.slot === "outfit")
        .map(([id, c]) => ({
            id: `outfit:${id}`,
            kind: "outfit",
            itemId: id,
            classId: c.classId,
            name: c.name,
            description: c.description ?? "",
            path: outfitAtlas[id],
        })),
    ...Object.entries(classNames).map(([classId, name]) => ({
        id: `class:${classId}`,
        kind: "class",
        classId,
        name,
        description: "",
        path: classAtlas[classId],
    })),
];
const looks = [];
for (const look of lookSources) {
    const [json, png] = await Promise.all([getText(`${look.path}.json`), getBytes(`${look.path}.png`)]);
    const { path, ...rest } = look;
    looks.push({ ...rest, className: classNames[look.classId] ?? look.classId, sheet: packSheet(JSON.parse(json), png) });
}

const wingTextures = {};
for (const style of Object.values(kit.config)) {
    wingTextures[style.texture] = (await getBytes(style.url)).toString("base64");
    if (style.rim && style.rimUrl) wingTextures[style.rim] = (await getBytes(style.rimUrl)).toString("base64");
}
const wings = Object.entries(cosmetics)
    .filter(([id, c]) => c.slot === "wings" && kit.config[id])
    .map(([id, c]) => ({ id, name: c.name, description: c.description ?? "" }));
const itemIcons = {};
for (const id of Object.keys(cosmetics)) {
    try {
        itemIcons[id] = (await getBytes(`/items/${id}.png`)).toString("base64");
    } catch {
        // A missing shop icon only costs the tile its picture.
    }
}

writeFileSync(
    join(GAME_DIR, "looks.ts"),
    `// Generated by scripts/snapshot.mjs from ${ORIGIN}. Do not edit by hand.\n` +
        `import type { Look, WingInfo } from "./types";\n\n` +
        `export const LOOKS: Look[] = ${JSON.stringify(looks)};\n` +
        `export const WINGS: WingInfo[] = ${JSON.stringify(wings)};\n` +
        `export const WING_TEXTURES: Record<string, string> = ${JSON.stringify(wingTextures)};\n` +
        `export const ITEM_ICONS: Record<string, string> = ${JSON.stringify(itemIcons)};\n` +
        `export const SNAPSHOT = ${JSON.stringify({ mainChunk: mainChunk.replace("assets/", ""), date: new Date().toLocaleDateString("sv-SE") })};\n`,
);

console.log(
    JSON.stringify(
        {
            mainChunk,
            equipmentChunk,
            phaserShim: [...phaserNames],
            extracted: order.map((v) => v.name),
            wingBytes: wingSource.length,
            looks: looks.map((l) => `${l.id} ${l.sheet.cell.w}x${l.sheet.cell.h} b${l.sheet.baseline}`),
            wings: wings.map((w) => w.id),
            icons: Object.keys(itemIcons),
        },
        null,
        1,
    ),
);
