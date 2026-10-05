export type CardPayload = {
  /** The whole card as an animated PNG data URL. */
  image: string;
};

export type WebviewToDriver =
  | { type: "ready" }
  | { type: "save-name"; name: string }
  | { type: "save-style"; background?: string; frame?: string }
  | { type: "place"; cards: CardPayload[] };

export type DriverToWebview =
  | { type: "profile"; name: string; background?: string; frame?: string }
  | { type: "placed"; count: number }
  | { type: "error"; message: string };
