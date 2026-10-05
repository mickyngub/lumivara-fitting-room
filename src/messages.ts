export type WingAura = "gold" | "demon" | "storm";
export type WingSize = "s" | "m" | "l";
/** A wing made from the player's own image: the cut-out PNG and how it is worn. */
export type SavedWing = { id: string; png: string; aura: WingAura; size: WingSize; flip: boolean };

export const MAX_OWN_WINGS = 8;

// A saved wing is a small PNG; anything much bigger was not made by the panel.
const MAX_SAVED_WING = 120_000;

export const isSavedWing = (v: unknown): v is SavedWing => {
  const w = v as SavedWing;
  return (
    !!w &&
    typeof w.id === "string" &&
    /^own-upload-[a-z0-9]{1,24}$/.test(w.id) &&
    typeof w.png === "string" &&
    w.png.startsWith("data:image/png;base64,") &&
    w.png.length <= MAX_SAVED_WING &&
    ["gold", "demon", "storm"].includes(w.aura) &&
    ["s", "m", "l"].includes(w.size) &&
    typeof w.flip === "boolean"
  );
};

export type CardPayload = {
  /** The whole card as an animated PNG data URL. */
  image: string;
};

export type WebviewToDriver =
  | { type: "ready" }
  | { type: "save-name"; name: string }
  | { type: "save-style"; background?: string; frame?: string }
  | { type: "save-wings"; wings: SavedWing[] }
  | { type: "place"; cards: CardPayload[] };

export type DriverToWebview =
  | { type: "profile"; name: string; background?: string; frame?: string; wings?: SavedWing[] }
  | { type: "placed"; count: number }
  | { type: "error"; message: string };
