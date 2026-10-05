export type SheetRow = { anim: string; dir: string; count: number };

export type Sheet = {
  png: string;
  cell: { w: number; h: number };
  baseline: number;
  rows: SheetRow[];
};

export type Look = {
  id: string;
  kind: "outfit" | "class";
  itemId?: string;
  classId: string;
  className: string;
  name: string;
  description: string;
  source?: string;
  sheet: Sheet;
};

export type WingInfo = {
  id: string;
  name: string;
  description: string;
  icon?: string;
};

export type WingStyle = {
  texture: string;
  url: string;
  rootX: number;
  rootY: number;
  scale: number;
  drop?: number;
  far?: number;
  aura?: string;
  rim?: string;
  rimUrl?: string;
};

/** Top, right, bottom, left, in CSS order. */
export type Edges = [number, number, number, number];

/**
 * The game's border-image for a name frame: slices in image pixels, and the
 * widths (equal to the outsets) and the gem strip's width in label pixels.
 */
export type NameFrameSlices = { slice: Edges; width: Edges; gemWidth: number };

export type NameFrame = NameFrameSlices & {
  id: string;
  name: string;
  description: string;
  icon?: string;
  url: string;
  gemUrl?: string;
};

export type WingKit = {
  config: Record<string, WingStyle>;
  directions: string[];
  methods: Record<
    "setWings" | "drawWings" | "wingParts",
    (...args: any[]) => any
  >;
};
