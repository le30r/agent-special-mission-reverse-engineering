# Original Agent.exe game map

The original map is a game UI mode, not an SCC scene. `MapController` reads the existing `SceneLoader.game.map` (`banked-v1`) and owns only its temporary phase, selected zone, renderer and textures. SCC `Setmap`/`Setzon`, save/load, and new-game reset continue to use the existing `SceneLoader` model.

## Resources and controls

`pnpm prepare:assets` copies the original `block0/XSH/Interface/map.MULT` and `arrown.MULT` with the shared interface resources, and converts `block0/TZU/Interface/Map/Map.TIF` to `public/generated/interface/map.png`. The map loads these assets lazily when F1 is pressed. No replacement geometry or HTML map artwork is used.

F1 opens the map only from an idle game state: the scene must exist, SCC must not be busy or blocked, and there must be no pending scene load/transition, restore, inventory selection, or save/load modal. While open/loading, the game ticker and canvas scene input are suspended. F1 or Escape closes without changing the scene. A left click commits the currently hovered unlocked zone through `SceneSession.request(scene, portal, 'map')`; an outside/locked click and right click do nothing. F2/F3 are consumed while the map is open.

Zone coordinates and destinations are the tables recovered in [`research/map/README.md`](../research/map/README.md). Hit testing uses strict logical 800×600 coordinates without scene scroll. `map.MULT` frame `zone + 1` is shown on hover; `arrown.MULT` supplies the animated UI cursor.

## Verification

- Unit coverage: `tests/map-controller.test.ts` checks exact tables, strict edges, unlock bank isolation, lifecycle, errors/stale completion, transition targets, and persistent banked state.
- Chromium coverage: `pnpm e2e:browser:map` dispatches real F1/Escape/F2/F3 and canvas mouse events; it exercises suspension, transition to scene 39 portal 0, and banked-v1 slot save/restore.
- This browser reconstruction does not establish Windows executable audio/timing parity.
