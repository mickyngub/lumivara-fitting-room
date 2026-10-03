# Lumivara Fitting Room (Drawdy extension)

Try Lumivara Online's fashion items on a live character, then put it on the board. Pick a class, then that class's fashion (its plain look or an outfit made for it; outfits are class-bound in the game), then wings (none, Divine, Demon). The preview turns by itself; drag it or use the arrows to turn it, and tap "ลองเดิน" to see it walk. "วางลงบอร์ด" stamps an animated character card. The link under it places every outfit in a row.

## Where it comes from

- Every fashion item the game client can draw is included, not only what the shop lists: outfits come from the game's atlas table (`"outfit-<id>"`) and wings from the styles in its wing code. Names and descriptions come from the game's item tables. Items the wing menu offers without art in the current build (the Limited "Critical King Card" today) are reported by the snapshot and `check-art`, not bundled.
- Character art is the game's own sprite atlases (`/jobs/<look>/player.png|json`, `/novice-v6/`): idle and walk frames, all eight directions.
- Rendering uses the game's own engine. The panel embeds Phaser 3.90 (the version the game ships, MIT licence) and draws at native game resolution with the game's `pixelArt` and `roundPixels` settings, then scales the canvas up. A canvas-2D imitation was tried first; compared pixel by pixel against real Phaser it differed on 144 to 922 pixels per pose from texel sampling, so it was replaced.
- Wings are animated by the game's own code. `scripts/snapshot.mjs` lifts the player class's `setWings`, `drawWings` and `wingParts` methods plus every module-level binding they use into `src/game/wings.js`. The body sprite, its feet anchor and the shadow (`ellipse 25×9, #122018, 0.4`) match the game's player drawing.
- Board cards bake the plate colour into every frame, so a still render (a selected card, a thumbnail) shows one clean pose.

## Commands

```bash
npm install
npm run check-art  # compare the bundled art and wing code with the live game, item by item (minifier renames ignored)
npm run snapshot   # re-download looks, wings and the wing code after a game update
npm test
npm run dev        # dev server on :5182; in Drawdy run ⌘K → "Add extension dev server" on a local board
npm run build      # dist/drawdy-lumivara-fashion.drawdyx
```

`dev/contact.ts` renders every wing and outfit in all eight directions as one sheet for visual checks. With `npm run dev` running, open `http://localhost:5182/version` in a browser and run `import("/dev/contact.ts")` in its console.
