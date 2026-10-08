/**
 * A skin of the fitting room's own: a class's plain look with its clothes'
 * colour parts, largest first, dyed onto these colours the way the outfit
 * colour tray dyes them.
 */
export type ClassSkin = {
  id: string;
  classId: string;
  name: string;
  description: string;
  dyes: [main: string, second: string, third: string];
  /** A tint for clothes drawn in grey, which the dyes leave as drawn, such as the Kensei's. */
  greys?: string;
};

export const CLASS_SKINS: ClassSkin[] = [
  {
    id: "own-novice-olive-greenhorn",
    classId: "novice",
    name: "Olive Greenhorn",
    description: "ชุดมือใหม่โทนเขียวมะกอก ตัดเขียวมะนาวที่ดวงตาและแสงฟันดาบ",
    dyes: ["#717e30", "#80e619", "#aabf40"],
  },
  {
    id: "own-novice-sky-trainee",
    classId: "novice",
    name: "Sky Trainee",
    description: "ชุดมือใหม่โทนฟ้าสด ตัดเหลืองทองที่ดวงตาและแสงฟันดาบ",
    dyes: ["#2170ca", "#f9bf10", "#6195d1"],
  },
  {
    id: "own-novice-berry-hopeful",
    classId: "novice",
    name: "Berry Hopeful",
    description:
      "ชุดมือใหม่โทนชมพูเบอร์รี่ ตัดเขียวเทอร์ควอยซ์ที่ดวงตาและแสงฟันดาบ",
    dyes: ["#c43189", "#22c3a8", "#cc66a3"],
  },
  {
    id: "own-novice-clover-pupil",
    classId: "novice",
    name: "Clover Pupil",
    description: "ชุดมือใหม่โทนเขียวสด ตัดเหลืองทองที่ดวงตาและแสงฟันดาบ",
    dyes: ["#24be19", "#f9d210", "#5bc653"],
  },
  {
    id: "own-novice-peach-recruit",
    classId: "novice",
    name: "Peach Recruit",
    description: "ชุดมือใหม่โทนส้มพีช ตัดฟ้าไซยานที่ดวงตาและแสงฟันดาบ",
    dyes: ["#e27e50", "#13c8ec", "#cc6333"],
  },
  {
    id: "own-novice-grape-cadet",
    classId: "novice",
    name: "Grape Cadet",
    description: "ชุดมือใหม่โทนม่วงองุ่น ตัดเหลืองมะนาวที่ดวงตาและแสงฟันดาบ",
    dyes: ["#8c2caf", "#dbf20d", "#ae6bc7"],
  },
  {
    id: "own-swordman-forest-warden",
    classId: "swordman",
    name: "Forest Warden",
    description: "ชุดนักดาบโทนเขียวป่า ตัดเขียวมะนาวที่ใบดาบและประกายเกราะ",
    dyes: ["#206f42", "#eca413", "#9bd22d"],
  },
  {
    id: "own-swordman-cobalt-vanguard",
    classId: "swordman",
    name: "Cobalt Vanguard",
    description: "ชุดนักดาบโทนน้ำเงินโคบอลต์ ตัดฟ้าไซยานที่ใบดาบและประกายเกราะ",
    dyes: ["#2043b6", "#ecb913", "#1dcaed"],
  },
  {
    id: "own-swordman-violet-templar",
    classId: "swordman",
    name: "Violet Templar",
    description: "ชุดนักดาบโทนม่วงเข้ม ตัดม่วงบานเย็นที่ใบดาบและประกายเกราะ",
    dyes: ["#63298e", "#f3d516", "#e637d5"],
  },
  {
    id: "own-swordman-copper-champion",
    classId: "swordman",
    name: "Copper Champion",
    description: "ชุดนักดาบโทนน้ำตาลทองแดง ตัดเขียวมรกตที่ใบดาบและประกายเกราะ",
    dyes: ["#84531a", "#2eb85c", "#19e680"],
  },
  {
    id: "own-swordman-lagoon-paladin",
    classId: "swordman",
    name: "Lagoon Paladin",
    description:
      "ชุดนักดาบโทนฟ้าอมเขียวเข้ม ตัดส้มแดงที่ประกายเกราะและเหลืองสดที่ใบดาบ",
    dyes: ["#1f5c6b", "#e25e36", "#f4d825"],
  },
  {
    id: "own-swordman-peridot-sentinel",
    classId: "swordman",
    name: "Peridot Sentinel",
    description:
      "ชุดนักดาบโทนเขียวมะกอกสด ตัดม่วงที่ประกายเกราะและเหลืองทองที่ใบดาบ",
    dyes: ["#758d1b", "#8040bf", "#f4d125"],
  },
  {
    id: "own-mage-ember-magus",
    classId: "mage",
    name: "Ember Magus",
    description: "ชุดจอมเวทโทนส้มอำพัน ตัดลายทองที่คอและชายเสื้อคลุม",
    dyes: ["#c67d10", "#b33d19", "#ecdd13"],
  },
  {
    id: "own-mage-tidal-mystic",
    classId: "mage",
    name: "Tidal Mystic",
    description: "ชุดจอมเวทโทนเขียวหัวเป็ด ตัดลายทองที่คอและชายเสื้อคลุม",
    dyes: ["#1a938f", "#2298c3", "#29a37a"],
  },
  {
    id: "own-mage-wine-sorcerer",
    classId: "mage",
    name: "Wine Sorcerer",
    description: "ชุดจอมเวทโทนแดงไวน์ ตัดลายทองที่คอและชายเสื้อคลุม",
    dyes: ["#841f2c", "#b82e73", "#c35822"],
  },
  {
    id: "own-mage-ink-magister",
    classId: "mage",
    name: "Ink Magister",
    description: "ชุดจอมเวทโทนน้ำเงินกรมท่าเข้ม ตัดลายทองที่คอและชายเสื้อคลุม",
    dyes: ["#193270", "#f2c40d", "#269dd9"],
  },
  {
    id: "own-mage-citron-seer",
    classId: "mage",
    name: "Citron Seer",
    description: "ชุดจอมเวทโทนเหลืองมะนาว ตัดลายทองที่คอและชายเสื้อคลุม",
    dyes: ["#e4d611", "#cf7317", "#a8c322"],
  },
  {
    id: "own-mage-cinnamon-conjurer",
    classId: "mage",
    name: "Cinnamon Conjurer",
    description: "ชุดจอมเวทโทนน้ำตาลอบเชย ตัดลายทองที่คอและชายเสื้อคลุม",
    dyes: ["#684322", "#cf9117", "#a33d29"],
  },
  {
    id: "own-archer-rust-falconer",
    classId: "archer",
    name: "Rust Falconer",
    description: "ชุดนักธนูโทนแดงสนิม ตัดฟ้าอมเทาเข้มที่กางเกง",
    dyes: ["#b8331e", "#2a586f", "#822517"],
  },
  {
    id: "own-archer-kingfisher-scout",
    classId: "archer",
    name: "Kingfisher Scout",
    description: "ชุดนักธนูโทนฟ้าน้ำทะเล ตัดน้ำตาลเข้มที่กางเกง",
    dyes: ["#148cb8", "#633721", "#156979"],
  },
  {
    id: "own-archer-plum-skirmisher",
    classId: "archer",
    name: "Plum Skirmisher",
    description: "ชุดนักธนูโทนม่วงพลัม ตัดม่วงเข้มที่กางเกง",
    dyes: ["#853280", "#512460", "#6b2466"],
  },
  {
    id: "own-archer-periwinkle-marksman",
    classId: "archer",
    name: "Periwinkle Marksman",
    description: "ชุดนักธนูโทนม่วงน้ำเงินอ่อน ตัดน้ำตาลเข้มที่กางเกง",
    dyes: ["#8d73ce", "#633c21", "#503399"],
  },
  {
    id: "own-archer-gold-stalker",
    classId: "archer",
    name: "Gold Stalker",
    description: "ชุดนักธนูโทนเหลืองมัสตาร์ด ตัดน้ำเงินเข้มที่กางเกง",
    dyes: ["#b99c0e", "#264a73", "#72561d"],
  },
  {
    id: "own-archer-magenta-sharpshooter",
    classId: "archer",
    name: "Magenta Sharpshooter",
    description: "ชุดนักธนูโทนชมพูบานเย็นสด ตัดเขียวอมฟ้าเข้มที่กางเกง",
    dyes: ["#e61ea0", "#245b60", "#7a1f5a"],
  },
  {
    id: "own-acolyte-mint-healer",
    classId: "acolyte",
    name: "Mint Healer",
    description: "ชุดนักบวชโทนเขียวมิ้นต์ ตัดทองอำพันที่ลูกประคำและแสงในมือ",
    dyes: ["#5ec99f", "#f3a216", "#339970"],
  },
  {
    id: "own-acolyte-lilac-chaplain",
    classId: "acolyte",
    name: "Lilac Chaplain",
    description: "ชุดนักบวชโทนม่วงไลแลค ตัดเหลืองสดที่ลูกประคำและแสงในมือ",
    dyes: ["#b166cc", "#f2d40d", "#7e3399"],
  },
  {
    id: "own-acolyte-rose-vestal",
    classId: "acolyte",
    name: "Rose Vestal",
    description: "ชุดนักบวชโทนชมพูกุหลาบ ตัดเขียวอมฟ้าที่ลูกประคำและแสงในมือ",
    dyes: ["#d04e75", "#2eb8b8", "#993352"],
  },
  {
    id: "own-acolyte-pistachio-deacon",
    classId: "acolyte",
    name: "Pistachio Deacon",
    description:
      "ชุดนักบวชโทนเขียวพิสตาชิโอ ตัดชมพูบานเย็นที่ลูกประคำและแสงในมือ",
    dyes: ["#b1c978", "#de3595", "#7a9933"],
  },
  {
    id: "own-acolyte-aqua-pilgrim",
    classId: "acolyte",
    name: "Aqua Pilgrim",
    description: "ชุดนักบวชโทนฟ้าใส ตัดส้มแดงที่ลูกประคำและแสงในมือ",
    dyes: ["#58bad5", "#ea603e", "#338399"],
  },
  {
    id: "own-acolyte-cardinal-curate",
    classId: "acolyte",
    name: "Cardinal Curate",
    description: "ชุดนักบวชโทนแดงคาร์ดินัล ตัดเหลืองทองที่ลูกประคำและแสงในมือ",
    dyes: ["#b32340", "#f2bd0d", "#862d3e"],
  },
  {
    id: "own-merchant-marigold-trader",
    classId: "merchant",
    name: "Marigold Trader",
    description:
      "ชุดพ่อค้าโทนเหลืองดาวเรือง ตัดฟ้าอมเขียวที่แถบเหล็กบนกระเป๋าสะพายหลัง",
    dyes: ["#dfae0c", "#298fa3", "#7a651f"],
  },
  {
    id: "own-merchant-seafoam-broker",
    classId: "merchant",
    name: "Seafoam Broker",
    description: "ชุดพ่อค้าโทนเขียวน้ำทะเล ตัดส้มที่แถบเหล็กบนกระเป๋าสะพายหลัง",
    dyes: ["#25937d", "#e68019", "#2a6f61"],
  },
  {
    id: "own-merchant-royal-peddler",
    classId: "merchant",
    name: "Royal Peddler",
    description: "ชุดพ่อค้าโทนน้ำเงินรอยัล ตัดทองที่แถบเหล็กบนกระเป๋าสะพายหลัง",
    dyes: ["#3034a6", "#ecc113", "#2a2c6f"],
  },
  {
    id: "own-merchant-mulberry-mercer",
    classId: "merchant",
    name: "Mulberry Mercer",
    description:
      "ชุดพ่อค้าโทนม่วงแดงเข้ม ตัดเหลืองสดที่แถบเหล็กบนกระเป๋าสะพายหลัง",
    dyes: ["#6a244a", "#f2d40d", "#6f2a4f"],
  },
  {
    id: "own-merchant-terracotta-hawker",
    classId: "merchant",
    name: "Terracotta Hawker",
    description: "ชุดพ่อค้าโทนส้มอิฐ ตัดฟ้าไซยานที่แถบเหล็กบนกระเป๋าสะพายหลัง",
    dyes: ["#94442e", "#26bbd9", "#733726"],
  },
  {
    id: "own-merchant-cerulean-vendor",
    classId: "merchant",
    name: "Cerulean Vendor",
    description: "ชุดพ่อค้าโทนฟ้าสว่าง ตัดส้มที่แถบเหล็กบนกระเป๋าสะพายหลัง",
    dyes: ["#3892e5", "#ec8013", "#264e73"],
  },
  {
    id: "own-thief-venom-cutpurse",
    classId: "thief",
    name: "Venom Cutpurse",
    description: "ชุดโจรโทนเขียวใบไม้ ตัดเขียวสะท้อนแสงที่ใบมีด",
    dyes: ["#5aa329", "#3ce619", "#5c9933"],
  },
  {
    id: "own-thief-orchid-footpad",
    classId: "thief",
    name: "Orchid Footpad",
    description: "ชุดโจรโทนม่วงกล้วยไม้ ตัดม่วงบานเย็นที่ใบมีด",
    dyes: ["#bf3bce", "#d920df", "#8f3399"],
  },
  {
    id: "own-thief-tangerine-cutthroat",
    classId: "thief",
    name: "Tangerine Cutthroat",
    description: "ชุดโจรโทนส้มแทนเจอรีน ตัดเหลืองทองที่ใบมีด",
    dyes: ["#ec5b13", "#f4af25", "#a35229"],
  },
  {
    id: "own-thief-verdigris-prowler",
    classId: "thief",
    name: "Verdigris Prowler",
    description:
      "ชุดโจรโทนเขียวอมฟ้าที่เกราะ ตัดเขียวใบไม้ที่เครื่องหนังและฟ้าไซยานที่ใบมีด",
    dyes: ["#309147", "#30c9e8", "#2d8641"],
    greys: "#339992",
  },
  {
    id: "own-thief-lapis-bandit",
    classId: "thief",
    name: "Lapis Bandit",
    description:
      "ชุดโจรโทนน้ำเงินเข้มที่เกราะ ตัดส้มทองที่เครื่องหนังและฟ้าสดที่ใบมีด",
    dyes: ["#ec9e18", "#4799eb", "#a37629"],
    greys: "#334b99",
  },
  {
    id: "own-thief-bronze-highwayman",
    classId: "thief",
    name: "Bronze Highwayman",
    description:
      "ชุดโจรโทนน้ำตาลบรอนซ์ที่เกราะ ตัดฟ้าไซยานที่เครื่องหนังและส้มทองที่ใบมีด",
    dyes: ["#16cdda", "#f4af25", "#299ba3"],
    greys: "#9b6831",
  },
  {
    id: "own-mamushi-wisteria-viper",
    classId: "mamushi",
    name: "Wisteria Viper",
    description: "ชุดนินจามามุชิโทนม่วงสด ตัดขาวที่แขนเสื้อ",
    dyes: ["#6425d0", "#8057c7", "#5a3894"],
  },
  {
    id: "own-mamushi-bamboo-shinobi",
    classId: "mamushi",
    name: "Bamboo Shinobi",
    description: "ชุดนินจามามุชิโทนเขียวไผ่ ตัดขาวที่แขนเสื้อ",
    dyes: ["#14b83a", "#40bf5e", "#307e42"],
  },
  {
    id: "own-mamushi-gilded-kunoichi",
    classId: "mamushi",
    name: "Gilded Kunoichi",
    description: "ชุดนินจามามุชิโทนส้มทอง ตัดขาวที่แขนเสื้อ",
    dyes: ["#e9730c", "#bf7b40", "#855932"],
  },
  {
    id: "own-mamushi-peacock-dancer",
    classId: "mamushi",
    name: "Peacock Dancer",
    description: "ชุดนินจามามุชิโทนเขียวนกยูง ตัดขาวที่แขนเสื้อ",
    dyes: ["#13c37a", "#40bf8a", "#38946e"],
  },
  {
    id: "own-mamushi-lime-whisper",
    classId: "mamushi",
    name: "Lime Whisper",
    description: "ชุดนินจามามุชิโทนเขียวมะนาว ตัดขาวที่แขนเสื้อ",
    dyes: ["#a2b517", "#b0bf40", "#899438"],
  },
  {
    id: "own-mamushi-peony-adder",
    classId: "mamushi",
    name: "Peony Adder",
    description: "ชุดนินจามามุชิโทนชมพูบานเย็นสด ตัดขาวที่แขนเสื้อ",
    dyes: ["#e619df", "#bf40bb", "#943891"],
  },
  {
    id: "own-nekobaku-moss-brewer",
    classId: "nekobaku",
    name: "Moss Brewer",
    description:
      "ชุดนักเล่นแร่แปรธาตุแมวโทนเขียวมอส ตัดเหลืองที่กระเป๋าคาดเอวและส้มที่อัญมณี",
    dyes: ["#378e29", "#ecdd13", "#e68019"],
  },
  {
    id: "own-nekobaku-iris-apothecary",
    classId: "nekobaku",
    name: "Iris Apothecary",
    description:
      "ชุดนักเล่นแร่แปรธาตุแมวโทนม่วงน้ำเงิน ตัดม่วงบานเย็นที่กระเป๋าคาดเอวและทองที่อัญมณี",
    dyes: ["#4e3bb0", "#b82ea1", "#f2b50d"],
  },
  {
    id: "own-nekobaku-fuchsia-tinkerer",
    classId: "nekobaku",
    name: "Fuchsia Tinkerer",
    description:
      "ชุดนักเล่นแร่แปรธาตุแมวโทนม่วงบานเย็น ตัดเขียวเทอร์ควอยซ์ที่กระเป๋าคาดเอวและฟ้าไซยานที่อัญมณี",
    dyes: ["#a82489", "#25b1a7", "#19c4e6"],
  },
  {
    id: "own-nekobaku-spruce-chemist",
    classId: "nekobaku",
    name: "Spruce Chemist",
    description:
      "ชุดนักเล่นแร่แปรธาตุแมวโทนเขียวเทอร์ควอยซ์ ตัดชมพูบานเย็นที่กระเป๋าคาดเอวและเหลืองส้มที่อัญมณี",
    dyes: ["#1fc1b1", "#cc3380", "#f2a60d"],
  },
  {
    id: "own-nekobaku-denim-distiller",
    classId: "nekobaku",
    name: "Denim Distiller",
    description:
      "ชุดนักเล่นแร่แปรธาตุแมวโทนน้ำเงินยีนส์ ตัดส้มที่กระเป๋าคาดเอวและชมพูบานเย็นที่อัญมณี",
    dyes: ["#1f65a3", "#ee862b", "#dd3ca7"],
  },
  {
    id: "own-nekobaku-cherry-herbalist",
    classId: "nekobaku",
    name: "Cherry Herbalist",
    description:
      "ชุดนักเล่นแร่แปรธาตุแมวโทนแดงเชอร์รี่ ตัดฟ้าอมเขียวที่กระเป๋าคาดเอวและเหลืองสดที่อัญมณี",
    dyes: ["#dd1d3a", "#22a8c3", "#f2f20d"],
  },
  {
    id: "own-kensei-pine-ronin",
    classId: "kensei",
    name: "Pine Ronin",
    description: "ชุดซามูไรเคนเซโทนเขียวสนที่กิโมโน ตัดแดงสดที่ด้ามดาบ",
    dyes: ["#e0221f", "#40bf8c", "#388a59"],
    greys: "#339966",
  },
  {
    id: "own-kensei-teal-duelist",
    classId: "kensei",
    name: "Teal Duelist",
    description:
      "ชุดซามูไรเคนเซโทนเขียวหัวเป็ดที่กิโมโน ตัดชมพูแดงสดที่ด้ามดาบ",
    dyes: ["#e2287b", "#39aec6", "#348d8b"],
    greys: "#2e979e",
  },
  {
    id: "own-kensei-aubergine-samurai",
    classId: "kensei",
    name: "Aubergine Samurai",
    description:
      "ชุดซามูไรเคนเซโทนม่วงมะเขือที่กิโมโน ตัดเขียวมะนาวสดที่ด้ามดาบ",
    dyes: ["#95e133", "#7c46b9", "#4f3a88"],
    greys: "#5a3894",
  },
  {
    id: "own-kensei-raspberry-kenshi",
    classId: "kensei",
    name: "Raspberry Kenshi",
    description:
      "ชุดซามูไรเคนเซโทนม่วงแดงราสเบอร์รี่ที่กิโมโน ตัดเขียวสดที่ด้ามดาบ",
    dyes: ["#28e26c", "#bf4084", "#8a3874"],
    greys: "#943872",
  },
  {
    id: "own-kensei-umber-swordmaster",
    classId: "kensei",
    name: "Umber Swordmaster",
    description:
      "ชุดซามูไรเคนเซโทนน้ำตาลอัมเบอร์ที่กิโมโน ตัดน้ำเงินสดที่ด้ามดาบ",
    dyes: ["#3a28e2", "#bf9940", "#8c6136"],
    greys: "#997033",
  },
  {
    id: "own-kensei-lichen-blademaster",
    classId: "kensei",
    name: "Lichen Blademaster",
    description: "ชุดซามูไรเคนเซโทนเขียวมะกอกอ่อนที่กิโมโน ตัดม่วงสดที่ด้ามดาบ",
    dyes: ["#ad28e2", "#80b946", "#70883a"],
    greys: "#6f9438",
  },
];
