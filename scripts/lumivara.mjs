import * as acorn from "acorn";

const ORIGIN = "https://lumivaraonline.com";
// Neutral UA on purpose: nothing that identifies whoever runs the script.
const UA = "drawdy-lumivara-fashion/0.1 (https://drawdy.io)";
const FETCH_ATTEMPTS = 3;

const fetchOk = async (path) => {
    for (let attempt = 1; ; attempt++) {
        const res = await fetch(ORIGIN + path, { headers: { "user-agent": UA } }).catch((err) => err);
        if (res instanceof Response && (res.ok || res.status === 404)) {
            if (!res.ok) throw new Error(`GET ${path}: HTTP 404`);
            return res;
        }
        if (attempt === FETCH_ATTEMPTS) {
            throw new Error(`GET ${path}: ${res instanceof Response ? `HTTP ${res.status}` : res.message}`);
        }
    }
};
export const getText = async (path) => (await fetchOk(path)).text();
export const need = (value, what) => {
    if (!value) throw new Error(`${what} not found`);
    return value;
};

// Minifiers rename variables on every deploy; renaming them canonically (by
// first appearance) leaves only real changes, while property names and
// literals stay as they are.
export const canonicalCode = (source) => {
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
