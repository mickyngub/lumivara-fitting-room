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
];
