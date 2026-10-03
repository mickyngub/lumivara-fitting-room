export type CardPayload = {
  title: string;
  subtitle: string;
  frames: ArrayBuffer[];
  loopMs: number;
};

export type WebviewToDriver = { type: "place"; cards: CardPayload[] };

export type DriverToWebview =
  { type: "placed"; count: number } | { type: "error"; message: string };
