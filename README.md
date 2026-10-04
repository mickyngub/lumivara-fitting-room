# Lumivara Fitting Room (Drawdy extension)

Try Lumivara Online's fashion items on a live character, then put it on the board. Pick a class, then that class's fashion (its plain look or an outfit made for it; outfits are class-bound in the game), then wings. The preview turns by itself; drag it or use the arrows to turn it, and tap "ลองเดิน" to see it walk. "วางลงบอร์ด" stamps an animated character card. The link under it places every outfit in a row.

## Where it comes from

- Nothing about the fashion is bundled. Every time the panel opens it reads the game's `https://lumivaraonline.com/cosmetics.json` (classes, outfits and wings with names, descriptions, icons, atlas paths and wing placement) and builds each look's sprite sheet in the browser from the game's own atlases (`/jobs/<look>/player.png|json`, `/novice-v6/`): idle and walk frames, all eight directions. Lumivara serves these files with `Access-Control-Allow-Origin: *`, which the sandboxed panel (origin `null`) needs. If the game cannot be reached the panel says so and offers a retry; there is no offline copy.
- Rendering uses the game's own engine. The panel embeds Phaser 3.90 (the version the game ships, MIT licence) and draws at native game resolution with the game's `pixelArt` and `roundPixels` settings, then scales the canvas up. A canvas-2D imitation was tried first; compared pixel by pixel against real Phaser it differed on 144 to 922 pixels per pose from texel sampling, so it was replaced.
- Wings are animated by the game's own code, the one thing that is bundled: code cannot be loaded live (the game's scripts carry no CORS header, and running downloaded code is not allowed). `scripts/wing-code.mjs` lifts the player class's `setWings`, `drawWings` and `wingParts` methods plus every module-level binding they use into `src/game/wings.js`. Placement comes from `cosmetics.json`; the effect (`aura`, far-wing tint `far`) comes from this code, so a wing the code does not know draws with default sparkles until `cosmetics.json` carries `aura` and `far` or the code is lifted again. The body sprite, its feet anchor and the shadow (`ellipse 25×9, #122018, 0.4`) match the game's player drawing.
- Board cards bake the plate colour into every frame, so a still render (a selected card, a thumbnail) shows one clean pose.

## Commands

```bash
npm install
npm run check-wings  # is the bundled wing code still the game's? also lists wings in cosmetics.json it has no effect for
npm run wing-code    # lift the wing code again after a game update
npm test
npm run dev        # dev server on :5182; in Drawdy run ⌘K → "Add extension dev server" on a local board
npm run build      # dist/drawdy-lumivara-fashion.drawdyx
```

`dev/contact.ts` renders every wing and outfit in all eight directions as one sheet for visual checks. With `npm run dev` running, open `http://localhost:5182/version` in a browser and run `import("/dev/contact.ts")` in its console.
