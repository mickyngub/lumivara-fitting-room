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
