export type CardPayload = {
  title: string;
  plate?: string;
  frames: ArrayBuffer[];
  loopMs: number;
};

export type WebviewToDriver =
  | { type: "ready" }
  | { type: "save-name"; name: string }
  | { type: "save-background"; background: string }
  | { type: "place"; cards: CardPayload[] };

export type DriverToWebview =
  | { type: "profile"; name: string; background?: string }
  | { type: "placed"; count: number }
  | { type: "error"; message: string };
