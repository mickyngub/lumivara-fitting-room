export type CardPayload = {
  title: string;
  subtitle: string;
  frames: ArrayBuffer[];
  loopMs: number;
};

export type WebviewToDriver =
  | { type: "ready" }
  | { type: "save-name"; name: string }
  | { type: "place"; cards: CardPayload[] };

export type DriverToWebview =
  | { type: "profile"; name: string }
  | { type: "placed"; count: number }
  | { type: "error"; message: string };
