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

export type WingInfo = { id: string; name: string; description: string };

export type WingStyle = {
  texture: string;
  url: string;
  rootX: number;
  rootY: number;
  scale: number;
  rim?: string;
  rimUrl?: string;
};

export type WingKit = {
  config: Record<string, WingStyle>;
  directions: string[];
  methods: Record<
    "setWings" | "drawWings" | "wingParts",
    (...args: any[]) => any
  >;
};
