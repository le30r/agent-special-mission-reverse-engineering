# Unified hit-testing implementation

Implementation branch: `fix/unified-hit-pipeline`, based on `master@22aa587`.
The native behavior contract and static reverse-engineering evidence are in
`.worktrees/hit-pipeline-agent-exe/research/hit-testing/{README.md,LUNA_SPEC.md,EXE_EVIDENCE.md}`
in the main checkout. The research branch remains unmerged.

## Runtime behavior

`SceneView.sceneHitCandidates()` builds candidates from live `SceneState.objects`
and current runtime Object sprites. The picker orders the three candidate kinds
together by ascending `abs(depth)` and stops at the first geometric hit with a
non-zero depth. `Object` keeps the existing image/pixel test, `Active` keeps its
existing strict rectangle test with one scroll translation, and `Light` always
misses. Runtime visibility and depth are consulted; cursor ID and SCC handler
availability are deliberately not picker filters. Objects without an assigned
runtime image remain in the registry but cannot geometrically hit.

Left-click dispatch uses the selected candidate name only after picking. An
unhandled target remains selected: existing `Fault`, `selectedItem`, SCC busy,
Block/Plane, and click-to-walk behavior run after target selection as before.
The right-click path was not changed. `hitboxSnapshot()` calls the same picker,
and the Hit-Test Inspector displays that winner alongside ordered candidates.

## Explicit compatibility boundaries

- Existing Object/pixel geometry is intentionally preserved. It is **not**
  claimed to be pixel-equivalent to Agent.exe.
- Equal-depth ties use the browser's deterministic stable insertion order. The
  native unstable sort was recovered in the static EXE evidence, but exact sort
  emulation is explicitly deferred.
- Native x87 rounding and its exact geometry are explicitly deferred.
- No level-specific exceptions or SCC/MULT edits are part of this change.

## Regression coverage

Unit tests exercise mixed-kind painter/hit order, early stop without Click
metadata, Light/no-image/depth-zero misses, Active visibility, and scroll.
Chromium E2E covers Level34 Ognet pickup and Chit Fault, Level3 overlap and all
three pickups with `Interface.state` preconditions, hitbox/hover consistency,
busy input, and existing Block/Plane integration. Final command results are
recorded in `docs/IMPLEMENTATION_STATUS.md` after execution.
