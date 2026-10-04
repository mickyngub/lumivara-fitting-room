export type Theme = {
  id: string;
  name: string;
  plate: string;
  glow: string;
  edge: string;
};

export const THEMES: Theme[] = [
  {
    id: "navy",
    name: "กรมท่า",
    plate: "#16295a",
    glow: "#2a4688",
    edge: "#0b1a3a",
  },
  {
    id: "night",
    name: "ราตรี",
    plate: "#141a28",
    glow: "#27314a",
    edge: "#090c14",
  },
  {
    id: "lavender",
    name: "ลาเวนเดอร์",
    plate: "#3a3166",
    glow: "#5c4f9a",
    edge: "#221c40",
  },
  {
    id: "rose",
    name: "กุหลาบ",
    plate: "#4a1d3a",
    glow: "#743058",
    edge: "#2a0f21",
  },
  {
    id: "amber",
    name: "อำพัน",
    plate: "#583214",
    glow: "#8c5424",
    edge: "#331b08",
  },
  {
    id: "forest",
    name: "ป่า",
    plate: "#1d3b2a",
    glow: "#2f5e42",
    edge: "#0f2318",
  },
  {
    id: "sea",
    name: "ทะเล",
    plate: "#14464a",
    glow: "#236f73",
    edge: "#0a2a2d",
  },
  {
    id: "sky",
    name: "ฟ้า",
    plate: "#2c5a8c",
    glow: "#4f86c2",
    edge: "#1a3a5e",
  },
];

export const themeById = (id: string | undefined): Theme =>
  THEMES.find((t) => t.id === id) ?? THEMES[0];
