# Lumivara Fitting Room (Drawdy extension)

Try Lumivara Online's fashion items on a live character, then put it on the board. Pick a class, then that class's fashion (its plain look or an outfit made for it; outfits are class-bound in the game), then wings (none, Divine, Demon). The preview turns by itself; drag it or use the arrows to turn it, and tap "ลองเดิน" to see it walk. "วางลงบอร์ด" stamps an animated character card. The link under it places every outfit in a row.

## Where it comes from

- Outfits, wings, names and descriptions come from the game's shared client module (`assets/equipment-*.js`). Character art comes from the game's own sprite atlases (`/jobs/<look>/player.png|json`, `/novice-v6/`): idle and walk frames, all eight directions.
- Wings are animated by the game's own code. `scripts/snapshot.mjs` parses the main bundle, lifts the player class's `setWings`, `drawWings` and `wingParts` methods plus every module-level binding they use, and writes them to `src/game/wings.js`. `webview/stage.ts` runs them against a small canvas stand-in for Phaser's sprite API.
- Board cards bake the plate colour into every frame, so a still render (a selected card, a thumbnail) shows one clean pose.

## Commands

```bash
npm install
npm run check-art  # compare the bundled art and wing code with the live game, item by item
npm run snapshot   # re-download looks, wings and the wing code after a game update
npm test
npm run dev        # dev server on :5182; in Drawdy run ⌘K → "Add extension dev server" on a local board
npm run build      # dist/drawdy-lumivara-fashion.drawdyx
```
