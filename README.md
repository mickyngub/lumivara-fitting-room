# Lumivara Fitting Room · ห้องแต่งตัว Lumivara

ลองชุดแฟชั่น ปีก และกรอบชื่อของ Lumivara Online บนตัวละครของคุณก่อนซื้อ แล้ววางการ์ดตัวละครที่ขยับได้ลงบอร์ด Drawdy ให้เพื่อนดู

![เลือกอาชีพ ชุด ปีก และท่า ใส่ชื่อ พื้นหลังและกรอบ แล้ววางการ์ดลงบอร์ด · Pick a class, outfit, wings and pose, add a name, background and frame, then place the card](https://raw.githubusercontent.com/mickyngub/lumivara-fitting-room/main/docs/media/fitting-room.gif)

## วิธีใช้

1. ติดตั้งแล้วห้องแต่งตัวจะเปิดขึ้นเอง ครั้งต่อไปกดไอคอน Lumivara ที่แถบด้านขวาของบอร์ด
2. รอโหลดชุดจากเกมสักครู่ แล้วลากที่ตัวละครหรือกดลูกศรเพื่อหมุนดูรอบตัว
3. เลือกอาชีพ แล้วเลือกชุดปกติหรือชุดแฟชั่นของอาชีพนั้น (ชุดแฟชั่นใส่ได้เฉพาะอาชีพของมัน เหมือนในเกม)
4. เลือกปีก และเลือกท่าใต้ตัวอย่าง: ยืน เดิน โจมตี โจมตี 2 นั่ง (จอมเวทร่ายเวทได้ด้วย)
5. พิมพ์ชื่อในเกม ชื่อจะขึ้นใต้ตัวละครพร้อมอาชีพ เหมือนป้ายชื่อในเกม
6. เลือกกรอบชื่อจาก Item Mall ชื่อของคุณจะอยู่ในกรอบแบบเดียวกับในเกม
7. เลือกพื้นหลัง (สีพื้น หรือฉากพิกเซลที่ขยับได้: ออโรร่า ห้วงดาว วงเวท ประกายไฟ ซากุระ) และกรอบการ์ด
8. กด ✦ วางลงบอร์ด การ์ดจะขยับวนได้เหมือนในเกม วางได้หลายใบ แล้วกด “แชร์” เพื่อส่งลิงก์ให้เพื่อน

ชื่อ พื้นหลัง และกรอบการ์ดที่เลือกจะถูกจำไว้ในเบราว์เซอร์นี้ ครั้งหน้าไม่ต้องตั้งใหม่ รายการชุด ภาพตัวละคร ปีก และกรอบชื่อโหลดสดจาก lumivaraonline.com ทุกครั้งที่เปิด ชุดใหม่ในเกมจึงขึ้นเองโดยไม่ต้องอัปเดตส่วนขยาย

## In English

Try every Lumivara Online outfit, wing and name frame on your own character before you buy, then put an animated character card on your Drawdy board to share with friends.

1. After installing, the Fitting Room opens on its own; next time, open it from the Lumivara button on the right of the board.
2. Drag the character or use the arrows to turn it around.
3. Pick a class, then its plain look or one of its fashion outfits (outfits belong to one class, as in the game), then wings.
4. Pick a pose: idle, walk, attack, attack 2 or sit (mages can also cast).
5. Type your in-game name: it shows under the character with your class, like the game's name tag.
6. Pick a name frame from the Item Mall: your name sits in it the way the game draws it.
7. Pick a background (a colour or an animated pixel-art scene) and a card frame, then tap ✦ วางลงบอร์ด.

## Permissions

| Permission | Why |
| --- | --- |
| Interface | the Lumivara button and the Fitting Room panel |
| Canvas | placing character cards on your board |
| Local storage | remembering your name, background and frame in this browser |

The extension sends nothing anywhere. It only downloads the game's public fashion data and art from `lumivaraonline.com`.

## How it works

- Nothing about the fashion is bundled. Each time the panel opens it reads the game's `https://lumivaraonline.com/cosmetics.json` (classes, outfits, wings and name frames with names, icons, art paths and wing placement) and builds each look's sprite sheet in the browser from the game's own atlases: idle, walk and every action pose the atlas has, in all eight directions. Lumivara serves these files with `Access-Control-Allow-Origin: *`, which the sandboxed panel (origin `null`) needs. If the game cannot be reached the panel says so and offers a retry.
- Characters are drawn with the game's own engine, Phaser 3.90, at native game resolution with the game's `pixelArt` and `roundPixels` settings, then scaled up, so they match the game pixel for pixel.
- Wings move with the game's own wing code (`src/game/wings.js`, lifted from the game client by `scripts/wing-code.mjs`); placement comes from `cosmetics.json`.
- Name frames are drawn the way the game's stylesheet draws them: a border-image around the padded name label, corners as drawn and the middle stretched to the name, with the gem strip centred over the seam. The art comes from `cosmetics.json`; the slice numbers come from the game's stylesheet (`src/game/name-frames.ts`, lifted by `scripts/name-frames.mjs`), so a frame the game adds later shows up once they are lifted again. The preview and the card draw the name tag with the same code, and shrink it to fit the picture when a wide frame and a long name need it.
- A card is a frame overlay plus up to 15 picture frames that Drawdy plays in a loop. The background, name tag and Drawdy mark are baked into every frame, so a still render shows one clean pose. Animated backgrounds and frames are pixel art on the sprites' 4x grid (`src/art/`) and loop without a seam.

## Credits

Characters, outfits, wings and their animation are from [Lumivara Online](https://lumivaraonline.com) and load live from the game's site. Rendering uses [Phaser](https://phaser.io) 3.90 (MIT).

## Licence

This extension's code is [MIT](LICENSE). Lumivara Online's art and data are not part of this repository; they load from the game's site. `src/game/wings.js` is the game client's wing animation code, lifted by `scripts/wing-code.mjs` so wings move as in the game; it belongs to Lumivara Online. `src/game/name-frames.ts` holds the name frames' slice numbers from the game's stylesheet, lifted by `scripts/name-frames.mjs`.

## Development

```bash
npm install
npm test
npm run dev          # dev server on :5182; in Drawdy run ⌘K → "Add extension dev server" on a local board
npm run build        # regenerates src/webview-html.ts and dist/*.drawdyx
npm run check-wings  # is the bundled wing code still the game's?
npm run wing-code    # lift the wing code again after a game update
npm run check-name-frames  # are the bundled name frame slices still the game's?
npm run name-frames        # lift them again after a game update
```

Drawdy builds published versions from this repository's `src/index.ts`, so commit `src/webview-html.ts` after `npm run build`. Bump `driverVersion` in `manifest.json` for every release and add it to `CHANGELOG.md`.

`dev/contact.ts` renders every wing and outfit in all eight directions as one sheet for visual checks: with `npm run dev` running, open `http://localhost:5182/version` and run `import("/dev/contact.ts")` in the console.
