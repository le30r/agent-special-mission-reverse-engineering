# Save/Load identity contract for SCC State-created objects

Date: 2026-10-20. Branch: `fix/save-state-identities`, based on the user's current local `master` (`bd00847`). No upstream fetch, SCC edits, save-schema changes or merge.

## Root cause

`SceneView`'s SCC host implements `State name value` by updating an existing case-insensitively matched object, or creating a base `Object` if none exists. That object enters the normal persistent scene table. `SaveCodec` correctly serializes it, but `SceneSession.importSave()` previously required each explicitly typed saved identity to have an explicit `Object`/`Active`/`Light` declaration. Valid engine-produced saves could therefore fail their own restore. Conversely, an omitted `kind` bypassed the identity check entirely.

The supplied Level24 and Level29 files both contain `Object:Intarface`, created by the original Level24 Ball Program's `State Intarface 1`. Level29 also restores the visited Level24 scene, so it encounters the same rejection. This is evidence of the general contract mismatch, not a level-specific exception to implement.

Both files also contain the undeclared, untyped `Vedro_la` in visited Level17, created through `Cursor`. After closing the omitted-kind bypass it needs a semantic allowance too. The implementation therefore covers the actual create-if-missing hosts behind parsed `State`, `Cursor`, `Objzet` and valid `Fram` depth hooks; it does not merely move the asymmetry to the next producer.

## Allowed identities

- Explicit declarations remain authoritative, including their kind.
- `parseObjectCreationIdentities()` walks the Programs returned by the same `parseScc()` used by `SccRuntime`. A parsed `State`, `Cursor` or `Objzet` target in that scene is a possible dynamic identity, normalized with the host's uppercase comparison. `Fram` depth targets come from `definition.frameDepthEvents`, with an existing animation and an in-range frame, since those hooks use the same depth host as `Objzet`.
- Dynamic identities may only be base `Object`s and must not already be declared as another kind. `State` updates an existing `Active`/`Light`; it cannot retype it into an `Object`.
- `Click` selectors, `Lstate` targets, `Show`/`Hide` alone, comments, out-of-Program commands, and overwritten Case Programs do not create these identities. Included Programs do not widen the command target set: the current `SceneView` runtime executes `definition.scc`, not included Programs. Included `Fram` declarations do participate, matching the frame hooks the runtime actually executes.
- The allowlist is recomputed from trusted scene resources, never from the save. Each visited scene uses its own SCC, including inactive scenes.
- An omitted V1 `kind` means `Object`; it is not an exemption from identity validation.
- The existing Animation → Frame → Slot → Child → Object MULT chain check still applies to every saved MULT reference, declared or dynamic.
- Codec bounds, digest, contentId, scene IDs, duplicate identities, and the separate Lstate-placeholder representation are unchanged. This is a static set of possible creation targets, not a proof that a particular gameplay path ran.

Failure still occurs before the candidate is committed: the live loader/view are unchanged on identity/resource rejection.

## Regression coverage

`tests/save-state-identities.test.ts` uses real `SceneSession`, `SceneView`, `SccRuntime`, export, codec encode/decode and restore. Its synthetic SCC fixture is independent of Level24. The 21 regressions cover State/Cursor/Objzet creation, Cursor-created objects hidden without an explicit kind, a real Fram depth hook, case-insensitive identities, default kind, visited inactive scenes, repeated roundtrip, Init not replaying, foreign names, wrong kinds, declaration retyping, cross-scene leakage, invalid MULT references, missing animations and out-of-range Fram targets.

`scripts/e2e-browser-save-state-identities.mjs` executes the unchanged original Level24 Ball Program in Chromium, waits for its actual Goto/StartW/State completion, exports/encodes/decodes/restores, then rejects foreign identities atomically. Optional `E2E_SAVE_FILES` imports caller-owned original files through F3, the actual file input, metadata preview and load confirmation. It checks active level, inventory and dynamic state, and compares each source file's SHA-256 before/after. No private input files are committed.

```sh
pnpm test
pnpm build
pnpm e2e:browser:save-state-identities
E2E_SAVE_FILES='["/path/to/first.json","/path/to/second.json"]' pnpm e2e:browser:save-state-identities
pnpm e2e:browser:all
```

The full Chromium suite includes Save/Load core, UI and State identities. Explicit standalone package scripts still run only their named scenario; `E2E_SUITE_FROM` retains suite-resume semantics. The runner uses unique TestResources-owned profiles/artifacts and shuts down its children before deleting its owned directories; supplied save files are caller-owned and are never modified or cleaned up.

## Verification

- Unit: `pnpm test --maxWorkers=2 --minWorkers=1`, 24 files / 214 tests passed (21 new identity regressions). A default-worker run under concurrent browser/build load hit the existing audio test's 5-second timeout; the final full run used two workers without changing tests or timeouts. Worktree prerequisites (original game data, MULT verification JSON and installed dependencies) were read-only-linked from the main checkout. The lifecycle tests require unsandboxed `ps`; no real orphan sweep was run.
- Build: `pnpm build` passed; existing Vite >500 kB chunk-size warning only.
- Original files imported successfully through Chromium's real F3/file-input/preview/confirmation flow, without rewriting either file:

| Input | Restored level | Inventory items | `Level24.Intarface` | Whole-file SHA-256, unchanged before/after |
| --- | --- | --- | --- | --- |
| `agent-save-level24-2026-10-19.json` | 24 | 11 | 1 | `a488d0375180fe63d2d3be030482ffade524ff243cfb488ffee4c5c604b4b07a` |
| `agent-save-level29-2026-10-19.json` | 29 | 12 | 1 | `b056da982a32327b2d2d20eeebe8b94b6c8ec2fd11f2db2bbf98db35004c87e8` |

  The inventory arrays matched the input arrays exactly, not just their counts. The manifest and both saves retain contentId `sha256:0da15d45c7419d56a3ab5310ea4a7b1d531dda44edc2c6a6bf499014c66b447c`.
- `E2E_SAVE_FILES=… pnpm e2e:browser:save-state-identities` passed: original SCC roundtrip, atomic foreign-object rejection, and both original user files.
- Full `pnpm e2e:browser:all`: 13/13 scenarios passed, including Save/Load Core, UI, dynamic identities, scene transitions/interactions, restored SCC, WAV and unmuted Fault. Catalog: 47/47 scenes. Test-owned Chromium/Vite children and temporary profiles/artifacts were cleaned up; the worktree is retained for manual review/merge.
