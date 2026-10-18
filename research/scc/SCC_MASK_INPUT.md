# SCC mask, input routing and camera contracts

Part of [SCC_MISSING_OPCODES](SCC_MISSING_OPCODES.md), same binary/profile and
confidence convention. No original process execution. Normal valid resource
behavior below is implementation-ready; unsafe malformed-native behavior is not
a requirement to corrupt memory in the port.

## Setmsk

**Command / Syntax:** `Setmsk <path:string-token>`.

**Arguments / Parsing — CONFIRMED:** hash `0x1717f`; branch
`0x407463–0x40748e` reads `%s` into EBP-0x29c and appends opcode 7,
A=B=0, string=path (`0x407486 → 0x405cac`). No quoted names, optional
parameters, rectangle, block ID or numeric mask index. The original lexer
is a whitespace-token scanner, not a line parser.

**Execution / State mutations — CONFIRMED:** executor case 7 calls
`0x405a08(scene,path)`. The same helper serves the top-level `Mask` declaration:

```text
0x401c6c(0)                  disable surface conversion
resource = 0x40bc5c(manager, path)
0x401c6c(1)                  enable surface conversion
scene.rawMask[+0x705] = resource.rawBytes[+0x10]
```

This replaces a pointer to raw **8-bit grayscale navigation/depth scanlines**.
It does not edit TIFF pixels, swap a MULT hit-test alpha mask, touch the
Object/Active list, allocate/free route scratch, reset a Program or yield.
There is no new W/H assignment and no immediate hero correction/depth/scale
update. `scene+0x72a` is a separate `uint16[backgroundW*backgroundH]` distance
label buffer allocated by `Back → 0x405a44`, not the mask being replaced.

**Dependencies — CONFIRMED:** resource resolver and TIFF conversion already
documented in [NAVIGATION_SCALE](../navigation/NAVIGATION_SCALE.md) §§2–5.
`0x405924`: in-bounds `q=uint8(255-mask[y*W+x])`, walkable iff q!=0;
out-of-bounds q=0. W/H are scene background dimensions `+0x75e/+0x762`.
`0x408dc4` route builder reads q through this helper; `0x409874` corrects
targets against it; `0x405968`/`0x4059c0` derive depth/scale from the same mask.
Thus it affects navigation and perspective, **not object pixel hit-testing**.
Pointer-consumer evidence is in existing navigation dossiers, not inferred
from the word “mask”.

**Existing route — DERIVED:** Setmsk itself neither rebuilds nor clears the
waypoint array/count/index. Movement `0x4099c0` still uses the stored route,
but calls depth/scale and `0x409708 → 0x409874` against the newly selected mask
as it advances. Therefore “continue old route completely unchanged” and
“immediately recompute the whole path” are both inaccurate simplifications.
No SCC-animation completion or State command restores the pointer automatically.

**Persistence — CONFIRMED:** `0x407ffc` clears `+0x705` on every entry,
then reparses `Mask`, includes and handlers. Start may select another mask;
Init executes only first visit. `0x407c14` ordinary cleanup frees route scratch
and scene-scope resources via `0x40c04c(manager,1)`; Setmsk does not directly
release the old cached resource. `0x407d44/0x407e14` serialize no mask path or
pointer. Load reparses SCC. Consequently a changed world State can cause Start
to reapply a mask, but the Setmsk effect is not itself persistent world state.
New game recreates scenes. Error-scene `+0x741!=0` skips ordinary cleanup;
do not generalize cache-release guarantees to that branch.

**Edge cases:** repeated valid path resolves again; no toggle semantics. A new
valid path replaces the previous one; no stack. Dimensions mismatch is not
checked here and native indexing continues with background W/H. Failed resolver
is dereferenced without a local null guard; complete modal/error behavior is
UNKNOWN (not permission to silently use the initial mask). Missing `%s` return
is unchecked, so stale-token/EOF behavior is not a well-defined fallback.

**SCC example:** `Level16.scc:103–116`, `Click 0 Start Boy`, Case 1:

```text
Setmsk Masks\scn_16_m.tif
Block
Goto 585 595
Goto 580 565
Ublock
StartW Boy_a
Setmsk Masks\scn_16.tif
Setxy 580 565
StartW Speak_boy
Setxy 580 565
State Boy 0
```

Requires Boy.state=1 on entry; uses the alternate mask for both Gotos and
Boy_a, restores the regular mask **before** Setxy. State does not restore it.
Full exact excerpts/file hashes: `evidence/missing-opcodes/source-facts.json`.

**Observable evidence / Proposed tests:** original TIFFs both 1000×600. The
actual `(585,595)→(580,565)` route happens to match in both masks (30 samples);
it is **not** a distinguishing assertion. Read-only native-algorithm replay
finds `(581,554)` has q=72 in regular mask and q=0 in `_m`; requested movement
there is uncorrected in the former and snapped to `(580,555)` in the latter.
Path lengths 41/40 respectively; target itself is not included in native route
samples. These are DERIVED offline results, not observed Windows/browser motion.
Future E2E must use those distinct reachable/corrected locations, check the
character's actual route/pose, then restore the mask and repeat. Also cover
swap while walking, repeated swap, unload/re-entry with Boy State 0/1,
save/load with Start selecting its mask, and failed/mismatched assets with an
explicit browser policy. Do not assert immediate hero teleport on Setmsk.

**Implementation considerations:** visit-owned active raw mask selector;
asset manifest/resolver must expose every referenced alternative (not just
top-level Mask); navigation/depth/scale/correction must consult that selector.
Keep background geometry and route scratch separate. Browser asynchronous
preparation must not reorder visible SCC effects; prefetch or explicit prepare
barrier is an adaptation, not evidence that original Setmsk yielded.

## Block / Ublock

**Command / Syntax:** `Block` and `Ublock`; **no arguments or identifier**.

**Parsing — CONFIRMED:** hashes `0x13124` / `0x177c5`, parser
`0x4069f3` / `0x407388` appends opcodes 8 / 9. The stale int copied into
instruction A is immaterial: neither executor case reads it. An extra token
is scanned independently; it is not a named block argument.

**Execution / State mutations — CONFIRMED:** `0x4063df–0x4063f8`
sets byte `Scene+0x73b=1/0` and continues. Separate from StartW busy
`Scene+0x709`; no SCC yield, refcount, stack, target object, route edit or
navigation region. Block twice then Ublock yields 0. Ublock without Block
also writes 0; there is no “unknown block” lookup.

**Dependencies / input — CONFIRMED:** `0x40a238` first checks busy. If busy,
it attempts narrow sync-range interruption on all animations (`0x404ff4(anim,0)`)
regardless of blocked flag. If not busy, it does normal hit testing but a set
blocked flag redirects **any** scene click to `dispatch(scene,0,selectedItem,
"Plane")`, even if no object was hit. This path does not cancel active Programs,
reset selected item or request click-to-walk. If Plane has no matching Program,
nothing runs; it is not a queued click. With flag clear, normal hit/cancel/Fault
fallback rules resume. `0x40d370` also refuses to open the map from normal UI
mode when either busy or blocked. The flag does not suspend background SCC,
animations, movement or completion-event dispatch.

**Persistence — CONFIRMED, with important distinction:** the byte survives
Program completion and StartW completion; StartW only clears busy. It survives
Object State writes. `0x407d44` serializes the byte, `0x407e14` reads it back,
**but `0x407ffc` immediately clears it on scene entry, including after load**.
Thus serialized presence does not imply effective restoration in the active
loaded visit. Start may set it again. Re-entry starts clear before SCC Start;
there is no permanent per-world block ID. Save/load does not resume Programs.

**SCC example:** `Level10.scc:196–222`: entry requires Band_a.state=1;
`Start K_bandit Fclick Name; Block; Goto 700 575`. The Program may finish its
route while blocked stays 1. K_bandit's natural end dispatches Name; matching
`Click 0 Name Band_a` Case 1 executes Ublock then StartW K_band_talke and finally
State Band_a 0 / regular mask restoration. Block does not prevent this internal
event. `Level38.scc:286–319` is a second end-to-end completion/unblock case.

**Confidence:** branches, storage, entry/serialization CONFIRMED; claimed
gameplay sequence DERIVED from the stated entry state and normal completion.

**Proposed tests / Implementation considerations:** implement a visit-owned
input-routing byte, not another busy counter. Check Plane with and without a
matching item/state handler; ordinary hit/miss while blocked must not start a
walk or cancel an unrelated active Program. Test Block×2/Ublock, lone Ublock,
Block→StartW→completion (flag stays), map-open suppression, Fclick release,
scene re-entry and save/load clearing. Browser safety UI may offer recovery,
but automatic Ublock at Program end would be non-native behavior. Full
inventory-open restrictions outside the traced map/scene-click paths remain
UNKNOWN; do not invent a universal UI lock.

## Shift

**Command / Syntax / Arguments:** `Shift <targetScrollX:int>`; absolute world
camera offset, not a delta, hero displacement, animation speed or inventory ID.

**Parsing — CONFIRMED:** hash `0x171cc`, `%d` branch
`0x40735b–0x407383`, opcode 0xb, A=value; no optional parameter.
**Execution / State mutations — CONFIRMED:** `0x4063fd–0x406409` assigns
`scene+0x75a` and continues synchronously. Camera updater `0x4087ec`, called
after SCC, animation and movement in `0x40a76c`, consumes it:

```ts
if (shiftTarget !== 0) {
  const delta = shiftTarget - scrollX;
  if (delta <= -10) scrollX -= 10;
  else if (delta >= 10) scrollX += 10;
  else { scrollX = shiftTarget; shiftTarget = 0; }
} else {
  // Existing follow-camera branch; includes its previous global velocity.
}
```

**Edge cases — CONFIRMED:** exactly ±10 moves 10 but keeps target set until
the next update (delta then 0). Shift 0 **cancels override**, cannot force a
pan to world X=0; ordinary follow runs on the next camera update. No clamp in
the nonzero override branch, even for negative/out-of-range targets. Ordinary
follow later clamps using background width-800. Step is **10 pixels per scene
update**, not 10 px/s and not multiplied by delta time. Assignment replaces
an unfinished target. Completion clears only target; it does not yield/resume SCC.

**Dependencies:** camera/scroll and world-to-screen interaction coordinates;
no mask or object-state mutation. Existing `DAT_004449d8` follow velocity is not
reset by Shift, so after override the previous velocity may affect the first
normal camera update. Arithmetic overflow remains native unsafe input behavior.

**Persistence — CONFIRMED:** target reset by constructor `0x407a80` and entry
`0x407ffc`, absent from scene serialization `0x407d44/0x407e14`; not linked to
Program/animation completion. Position/camera may be recomputed on entry;
do not persist the transient override as world state.

**SCC examples:** `Level4.scc:74–86`, Click 0 Iachik Interface Case 0:
`Goto 380 585; Shift 240; StartW Stat_J; ...; Level 2 1`.
Initial scroll is whatever preceding Goto/follow left, not an assumed 0.
While Stat_J plays the camera tends toward 240; later commands do not wait for
that pan. `Level12:205/223/247` uses 100; `Level17:325` uses 0 to cancel.

**Original EXE evidence:** parser/executor assembly, live `0x4087ec` plus its
assembly (including omitted x87 computation of hero X), caller `0x40a76c`.
**Confidence:** normal integer branch CONFIRMED; narrative intent DERIVED.
**Implementation considerations / Proposed tests:** add visit camera target,
consume once per native-equivalent update. Visible camera assertions: both
directions, |delta|=9/10/11, overwrite mid-pan, Shift 0, nonzero invalid target,
StartW concurrency, entry reset and save/load. Don't “await pan complete” or
clamp in the override merely for convenience.
