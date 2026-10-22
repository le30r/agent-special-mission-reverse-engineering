# SCC corpus audit: inventory and interpreter coverage

Date: 2026-10-18. Project: `agent-reverse` (Basic Memory).

> **Superseded implementation snapshot / confirmed research update:** this audit
> predates local master `e08f0f0`. Its source counts remain valid, but the current
> matrix and native contracts are in [SCC_MISSING_OPCODES](SCC_MISSING_OPCODES.md).
> All47 scenes (including6 null-layout overlays), recursive includes and WAV
> runtime are now implemented. Setzon is **PARTIAL/incorrect**, not “full”: native
> opcode0x21 unlocks a banked map slot; Setmap is opcode0x20 bank selection.
> Block/Ublock use a boolean click→Plane/map gate, not an identified-block API.
> Fclick is load-time animation metadata; its second use is **Level38:319**,
> not Level10:319. Setbcr/remStartW are ignored tokens in this EXE, not missing
> background/animation commands. Below, historical HYPOTHESIS/UNKNOWN statements
> and implementation proposals are retained as audit history, not current facts.

Scope: static audit of the complete extracted SCC corpus of «Агент: Особое
задание» (2001). No game resource was modified, no Ghidra session was started
for this audit — command semantics are cross-checked against the existing
documents ([SCC_RUNTIME](SCC_RUNTIME.md), [SCC_VISIBILITY_INIT](SCC_VISIBILITY_INIT.md),
[SCENE_TRANSITIONS](../transitions/SCENE_TRANSITIONS.md)) and against
`src/scc/runtime.ts` + the scene pipeline.

Conventions, matching the repo:
- **CONFIRMED** — established machine-code fact or observed original resource
  content (from prior REA evidence, cited documents).
- **DERIVED** — offline computation from those facts.
- **HYPOTHESIS** — incomplete chain, explicitly marked.
- **UNKNOWN** — not established; do not invent semantics.

The reproducible inventory script is
[`research/scc/scc_corpus_analysis.py`](scc_corpus_analysis.py); it writes its
JSON to `/tmp` only and prints the summary tables below.

---

## 1. Corpus inventory (Task A)

The original corpus lives in
`agent-original/game-installed/Program_Executable_Files/Scripts/` (gitignored,
not part of the tracked repo). **57 SCC files total.**

### 1.1 Categories

| Category | Files | Count | Notes |
|---|---|---|---|
| Scene scripts | `Level1..Level8`, `Level10..Level48` | **47** | `Level9.scc` does not exist in the corpus. |
| Shared animation script | `Mainhero.scc` | 1 | Hero Walk0-7 / Stop0-7 / Mstop0-7 / Speak declarations. |
| Interface script | `Cursor.scc` | 1 | `Object Interface 0 0` + cursor animations (Arrow, Arrow0-3, Eye, Hand, Lips). |
| Footstep sound banks | `Grav.scc`, `Grot.scc`, `Step1..Step5.scc`, `Ylisa.scc` | 8 | `Sound Walk0-7` blocks referencing `Mainhero` + `.wav`; selected per surface/character. |
| Character logic scripts | — | 0 | Character behaviour is embedded in the `Level*.scc` scenes; `Ylisa.scc` is only a footstep bank, not a logic script. |

**Not every SCC is a location.** The 47 `Level*.scc` files are the walkable
scenes; the other 10 files are `Inc`-ed resources (animations, cursor, and
footstep `Fram`/`Sound` tables).

### 1.2 Structural split of the 47 scenes

| Group | Scenes | Characteristic |
|---|---|---|
| Full walkable scenes | 41 scenes | Declare a `Startlevel` layout animation (`Anim 8 Startlevel Casm …`). This is what the browser loader requires today. |
| **Overlay / close-up scenes** | `26`, `42`, `43`, `45`, `46`, `48` | **No `Startlevel`.** `Object Mainhero 0 0` + `Active` hot-spots + `Light` + `Fault` over a static background; mostly dialogue/examination screens. A different layout mode. |

CONFIRMED (SCC): exactly these 6 files contain no `Startlevel` token.
DERIVED consequence: `buildSceneDefinition` in the port currently *throws* for
these scenes, so they cannot be added to the manifest without a new
"Active-only" layout mode.

### 1.3 Revisit structure (Levels 37–48 mirror earlier locations)

DERIVED, strong signal: the `Portal` tables (direction,x,y) of the high levels
repeat the geometry of earlier levels, while their `Back`/`Mask` are separate
files (evening/night variants):

| Revisit scene | Shares portal geometry with | Back | Mask |
|---|---|---|---|
| 37 | 1 | `scn_01.tif` | `scn_37.tif` |
| 38 | 2 | `scn_38.tif` | `scn_38_1.tif` |
| 39 | 5 | `scn_39.tif` | `scn_39.tif` |
| 40 | 6 | `scn_40.tif` | `scn_40.tif` |
| 41 | 10 | `scn_41.tif` | `scn_41.tif` |
| 42 | 11 | `scn_42.tif` | `scn_42.tif` |
| 43 | 13 | `scn_43.tif` | `scn_43.tif` |
| 44 | 18 (+1 portal) | `scn_44_1.tif` | `scn_44.tif` |
| 45 | 20 | `scn_45.tif` | `scn_45.tif` |
| 46 | 29 | `scn_46.tif` | `scn_46.tif` |
| 47 | 16 | `scn_47.tif` | `scn_47.tif` |
| 48 | — (2 new portals) | `scn_48.tif` | `scn_48.tif` |

This is consistent with the cross-scene `Lstate` flow: the "day" act
(Levels 1–36) writes state into the "evening" scenes (e.g. Level1 writes
`Lstate Goto_1 1 38`, `Lstate To_38 1 44`, `Lstate Naruch 1 37`), which those
revisits later read. It is **DERIVED** from portal geometry + resource naming,
not a claim about game narrative.

### 1.4 Per-scene declaration counts

Compact reference (Object / Active / Light / Anim+Animc / Portal):

| Lv | o/a/l | anim | port | Lv | o/a/l | anim | port |
|---|---|---|---|---|---|---|---|
| 1 | 23/7/1 | 14 | 5 | 25 | 14/4/0 | 15 | 2 |
| 2 | 12/9/0 | 19 | 2 | 26 | 1/1/0 | 0 | 2 |
| 3 | 18/9/0 | 34 | 2 | 27 | 16/5/0 | 16 | 2 |
| 4 | 10/5/0 | 3 | 1 | 28 | 7/4/0 | 7 | 2 |
| 5 | 13/9/0 | 16 | 3 | 29 | 9/7/0 | 8 | 4 |
| 6 | 13/7/0 | 16 | 2 | 30 | 11/10/0 | 9 | 2 |
| 7 | 6/7/0 | 10 | 2 | 31 | 8/3/0 | 12 | 3 |
| 8 | 27/6/0 | 13 | 3 | 32 | 11/6/0 | 14 | 1 |
| 10 | 21/6/0 | 16 | 4 | 33 | 19/10/0 | 14 | 3 |
| 11 | 3/5/0 | 6 | 2 | 34 | 10/7/0 | 15 | 2 |
| 12 | 10/7/0 | 12 | 1 | 35 | 15/6/0 | 14 | 3 |
| 13 | 4/8/0 | 14 | 2 | 36 | 23/6/0 | 18 | 2 |
| 14 | 13/6/0 | 9 | 2 | 37 | 27/4/0 | 18 | 5 |
| 15 | 7/6/0 | 21 | 1 | 38 | 22/5/1 | 31 | 2 |
| 16 | 10/4/0 | 9 | 3 | 39 | 12/7/1 | 5 | 3 |
| 17 | 15/8/0 | 17 | 2 | 40 | 10/6/1 | 3 | 2 |
| 18 | 10/6/0 | 14 | 3 | 41 | 13/5/1 | 6 | 4 |
| 19 | 24/4/0 | 23 | 4 | 42 | 1/5/1 | 0 | 2 |
| 20 | 6/5/0 | 7 | 4 | 43 | 1/5/1 | 0 | 2 |
| 21 | 16/6/0 | 22 | 3 | 44 | 6/5/1 | 9 | 4 |
| 22 | 27/6/1 | 26 | 1 | 45 | 1/5/2 | 1 | 4 |
| 23 | 19/9/0 | 34 | 1 | 46 | 1/4/1 | 1 | 4 |
| 24 | 16/1/0 | 9 | 1 | 47 | 3/5/1 | 3 | 3 |
| — | — | — | — | 48 | 1/1/0 | 0 | 2 |

---

## 2. Interpreter coverage (Task B)

The SCC pipeline is split across several parsers, all derived from the original
lexer `0x4066c8`:

| Layer | Parser (port) | Handles |
|---|---|---|
| Runtime programs | `src/scc/runtime.ts parseScc` | `Click` handlers + their command bodies |
| Scene declarations | `src/navigation/depth-sort.ts parseSceneDeclarations` | `Object` / `Active` / `Light` |
| Portals | `src/scene/scene-loader.ts parsePortals` | `Portal` |
| Focus | `src/scene/scene-definition.ts parseFocus` | `Focus` |
| Animations | `src/animation/player.ts parseAnimationDeclarations` + `parseAnimationPaths` | `Anim` / `Animc` |
| Frame depth events | `parseFrameDepthEvents` | `Fram <n> -1 <x> <obj> <depth>` inside `Sound` |

`Back`/`Mask` are resolved through the prepared asset manifest, not the SCC
text. `Inc` is **not** literally interpreted: only `Mainhero.scc` is merged
separately; `cursor.scc`/`grav.scc`/`step*.scc`/`Ylisa.scc` content (footstep
sound, cursor animations) is effectively ignored (sound is a no-op anyway).

### 2.1 Top-level statement coverage

| Statement | Uses | Files | Status |
|---|---|---|---|
| `Click` | 594 | 47 | ✅ implemented (see §2.3 for gaps) |
| `Object` | 566 | 48 | ✅ implemented |
| `Anim` | 552 | 44 | ✅ implemented |
| `Sound` | 507 | 51 | 🟡 partial — only `Fram … -1 …` depth events extracted; audio not played |
| `Active` | 273 | 47 | ✅ implemented (hit-test rect + visibility) |
| `Fault` | 143 | 40 | ❌ **not implemented** (documented) |
| `Inc` | 141 | 47 | 🟡 partial — only `Mainhero.scc` merged; other includes ignored |
| `Portal` | 119 | 47 | ✅ implemented |
| `Animc` | 64 | 26 | ✅ implemented |
| `Back` | 47 | 47 | ✅ via manifest |
| `Mask` | 47 | 47 | ✅ via manifest |
| `Focus` | 47 | 47 | ✅ implemented |
| `Fram` | 1291 (Level) + 128 (shared) | 51 | 🟡 partial — only the 159 `-1` depth-switch records are used; the ~1132 audio frames are ignored (sound is a no-op) |
| `Light` | 13 | 12 | 🟡 partial — visibility flag only; render no-op (matches original) |

### 2.2 Runtime command coverage (inside `Click { … }`)

Total 3267 command occurrences. Column "crit." = progression criticality.

| Command | Uses | Files | Status | Crit. |
|---|---|---|---|---|
| `StartW` | 525 | 43 | ✅ full | high |
| `Goto` | 389 | 42 | ✅ full | high |
| `Setxy` | 375 | 43 | ✅ full (mask-corrected) | high |
| `Show` | 309 | 47 | ✅ full | high |
| `State` | 306 | 39 | ✅ full | high |
| `Hide` | 214 | 33 | ✅ full | high |
| `Cursor` | 174 | 30 | 🟡 partial — writes cursor id, no cursor rendering | low |
| `Start` | 166 | 40 | 🟡 partial — see §2.4 (`Fclick` dropped) | high |
| `Level` | 121 | 47 | ✅ full (deferred switch) | high |
| `Lstate` | 120 | 35 | ✅ full (cross-scene state) | high |
| `Stop` | 84 | 20 | ✅ full | med |
| `Goport` | 77 | 39 | ✅ full | high |
| `Addtol` | 76 | 24 | ✅ full | high |
| **`Setmsk`** | 68 | 20 | ❌ **not implemented** | **critical** |
| `Objzet` | 65 | 18 | ✅ full | med |
| `Remtol` | 58 | 26 | ✅ full | high |
| `Smusic` | 50 | 44 | 🟡 stub (no-op) | low |
| **`Ublock`** | 25 | 13 | ❌ **not implemented** | **critical** |
| **`Block`** | 23 | 13 | ❌ **not implemented** | **critical** |
| `Setzon` | 15 | 14 | ✅ full (game-session int) | low |
| **`Setbck`** | 6 | 3 | ❌ not implemented | med |
| `SclipW` | 5 | 4 | ✅ original AVI playback + global session barrier | high |
| **`Shift`** | 5 | 3 | ❌ not implemented (semantics UNKNOWN) | med |
| **`StatrW`** | 5 | 3 | ❌ dropped; see §2.5 (hash collision) | med |
| **`Setbcr`** | 2 | 1 | ❌ not implemented | med |
| **`Egame`** | 2 | 1 | ❌ not implemented | med |
| **`Setmap`** | 1 | 1 | ❌ not implemented (semantics UNKNOWN) | low |
| **`remStartW`** | 1 | 1 | ❌ not implemented (semantics UNKNOWN) | low |

**Unsupported runtime commands: 138 occurrences (4.2% of all click commands),**
but concentrated in 20+ scenes and — for `Setmsk`/`Block`/`Ublock` — load-bearing
for progression (see §4).

### 2.3 Parser silently drops unknown commands — CONFIRMED

`parseScc` in `src/scc/runtime.ts` is an `if/else if` chain with **no `else`
branch**. Any first-token inside a `Click` block that is not one of the 19
supported words is silently discarded — no diagnostic, no `console.warn`, no
throw. The following commands are therefore **silently lost** by the port
(and would have real effects in the original engine):

| Command | Uses | Files | Presumed effect (from SCC context, not proven) |
|---|---|---|---|
| `Setmsk <mask>` | 68 | 3,7,10,13,16,17,18,19,22,23,24,27,28,29,31,35,36,37,38,44 | swap the active navigation mask |
| `Ublock` | 25 | 2,3,5,6,10,12,14,16,17,23,31,36,38 | release a `Block`-held input lock |
| `Block` | 23 | 2,3,5,6,10,12,14,16,17,23,31,36,38 | hold/disable input during a cutscene |
| `Setbck <bg>` | 6 | 22,23,25 | replace the background image in-scene |
| `Shift <int>` | 5 | 4,12,17 | UNKNOWN |
| `StatrW <anim>` | 5 | 10,18,25 | typo of `StartW`; **hash-collides** (see §2.5) |
| `Setbcr <bg>` | 2 | 28 | replace/restore background |
| `Egame` | 2 | 28 | end-game / exit trigger |
| `Setmap <int>` | 1 | 3 | UNKNOWN |
| `remStartW <anim>` | 1 | 23 | UNKNOWN |

Additionally, top-level `Fault` (143 declarations, 40 scenes) is not parsed:
the port falls back to click-to-walk for unhandled objects (documented in
IMPLEMENTATION_STATUS.md).

### 2.4 Two further parser-fidelity gaps — CONFIRMED (SCC) vs `parseScc`

1. **`Click` stateScene (4th token) is dropped.** The original
   `Click <itemId> <event> <stateObject> [stateScene]` reads the state object
   from `sceneTable[stateScene]` when the 4th token is present (`0x408c8c`
   via `0x46851c`). `parseScc` captures only 3 groups and ignores the 4th
   token, so these 11 handlers read state from the *current* scene instead:

   `Level12:151/181/201`, `Level17:333/368`, `Level22:288`, `Level29:120`,
   `Level33:177/241`, `Level38:297/305`.

   The `SccHandler` type has no `stateScene` field at all.

2. **`Start <anim> Fclick <event>` completion-event form is dropped.**
   Two occurrences — `Level10:200 Start K_bandit Fclick Name`,
   `Level10:319 Start Bandit2_Lora Fclick Bandit`. The original stores the
   event name at `anim+0x211` (`0x404e40`) and dispatches it when the
   animation ends (`0x4054eb → 0x4079ac`). `parseScc` reads only `tokens[1]`
   and silently discards `Fclick <event>`, so the follow-up handler (e.g.
   `Click 0 Name Band_a` → `Ublock`) never fires. This is load-bearing for
   Level10's cutscene sequencing.

### 2.5 `StatrW` — a real hash collision, not just a typo — DERIVED

The confirmed lexer hash `0x4058d8` weights a token's characters by
`1000,100,10,1,1,1` (and returns 0 for length ≥ 7). For length-6 strings the
last three weights are all 1, so positions 3–5 commute:

- `"StartW"` = S·1000 + t·100 + a·10 + **r** + **t** + W = `0x1768f`
- `"StatrW"` = S·1000 + t·100 + a·10 + **t** + **r** + W = `0x1768f`

So the original engine's hash-dispatch **does** treat `StatrW` as `StartW`,
and the animation is started. The port's exact-string matcher drops it.
This is a concrete, derivable fidelity bug: 5 `StartW` calls across
Levels 10/18/25 are silently ignored by the port but execute in the original.

---

## 3. Coverage matrix (Task B, per scene)

"Unsupported" = the scene contains at least one of the 10 unimplemented runtime
commands (`Setmsk`/`Block`/`Ublock`/`Setbck`/`Setbcr`/`Shift`/`StatrW`/`Egame`/
`Setmap`/`remStartW`). `Fault` is reported separately.

| Scenes | Unsupported commands present |
|---|---|
| 1, 8, 11, 15, 20, 21, 26, 30, 32, 33, 34, 39, 40, 41, 42, 43, 45, 46, 47, 48 | none (clean — full set of implemented commands suffices for their bodies) |
| 2 | Block, Ublock |
| 3 | Block, Setmap, Setmsk, Ublock |
| 4 | Shift |
| 5 | Block, Ublock |
| 6 | Block, Ublock |
| 7 | Setmsk |
| 10 | Block, Setmsk, StatrW, Ublock |
| 12 | Block, Shift, Ublock |
| 13 | Setmsk |
| 14 | Block, Ublock |
| 16 | Block, Setmsk, Ublock |
| 17 | Block, Setmsk, Shift, Ublock |
| 18 | Setmsk, StatrW |
| 19 | Setmsk |
| 22 | Setbck, Setmsk |
| 23 | Block, remStartW, Setbck, Setmsk, Ublock |
| 24 | Setmsk |
| 25 | Setbck, StatrW |
| 27 | Setmsk |
| 28 | Egame, Setbcr, Setmsk |
| 29 | Setmsk |
| 31 | Block, Setmsk, Ublock |
| 35 | Setmsk |
| 36 | Block, Setmsk, Ublock |
| 37 | Setmsk |
| 38 | Block, Setmsk, Ublock |
| 44 | Setmsk |

`Fault` declarations exist in 40 scenes; only 7 scenes (10, 18, 26, 28, 31, 44,
48) have none.

Item-requiring interactions (`Click <itemId> …` with `itemId != 0`) exist in
35 scenes; `itemId=45` (26 uses) and `itemId=46` (29 uses) are the two most
common, consistent with dedicated "talk"/"look" cursor modes (HYPOTHESIS —
these IDs are UI verbs, not physical items).

---

## 4. Prioritization (Task D)

### 4.1 Top-10 blocking gaps

Ranked by how many scenes they gate and how hard the blockage is.

| # | Gap | Scenes affected | Why it blocks |
|---|---|---|---|
| 1 | **`Setmsk`** — dynamic mask swap | 20 | Navigation uses only the initial mask; doors/opened paths never become walkable. |
| 2 | **`Block`/`Ublock`** — input lock | 13 | Multi-handler cutscenes cannot hold/release input; sequencing desyncs. |
| 3 | **`Start … Fclick <event>` completion events** | 10 (and any reused pattern) | Cutscene follow-up handlers never dispatch. |
| 4 | **`StatrW` hash-collision alias** | 10, 18, 25 | 5 `StartW` calls silently skipped; animations/cutscenes never start. |
| 5 | **Scene asset coverage** — only `{1, 39}` prepared | 45 more scenes | The biggest *practical* blocker: adding a scene = Back/Mask/MULT + manifest. |
| 6 | **Cross-scene `Click` stateScene** | 12, 17, 22, 29, 33, 38 | State read from the wrong scene breaks cross-scene logic. |
| 7 | **`Fault`** | 40 | Unhandled clicks lose their dialogue/sound; falls back to walk. |
| 8 | **Overlay scenes (no `Startlevel`)** | 26, 42, 43, 45, 46, 48 | Need a separate "Active-only hotspot" layout mode before these can load. |
| 9 | **`Setbck`/`Setbcr`** | 22, 23, 25, 28 | In-scene background swap (visual; lower priority). |
| 10 | **`Shift` / `Setmap` / `Egame` / `remStartW`** | 4, 12, 17 / 3 / 28 / 23 | Rare; semantics UNKNOWN — needs Ghidra before implementation. |

### 4.2 Minimal set to pass the maximum number of scenes

1. **`Setmsk`** — highest value. Requires: a runtime-addressable mask list
   (`NavigationMask` per named file), nav re-init, and re-evaluation of the
   hero's current `depthAt`/`scaleAt`/`correctPosition` after the swap.
2. **`Block`/`Ublock`** — add a manual input-lock flag distinct from
   `StartW.busy` (the original holds it across handlers; `StartW` only holds it
   for one animation). Must be released by the matching `Ublock` or by scene
   teardown so the player is never soft-locked.
3. **`Start <anim> Fclick <event>`** — store the completion-event name on the
   animation and dispatch it when a one-shot animation reaches its end; plus
   **alias `StatrW` → `StartW`** (a one-line lexer fix that is byte-faithful to
   the original hash-dispatch).
4. **Cross-scene `Click` stateScene** — add `stateScene` to `SccHandler` and
   resolve `readState` against `sceneTable[stateScene]` (the loader already
   keeps long-lived `SceneState` per scene, so this is mostly plumbing).
5. **Prepare the next vertical slice of scenes** in the manifest. Because the
   revisit scenes (37–48) depend on `Lstate` written by the day scenes, expand
   the manifest outward from the already-verified `1 ↔ 39` spine rather than
   adding scenes randomly.

### 4.3 Concrete chains the port must end-to-end support next

- **Level1 → Level38 (after cutting the hammock):** `Click 1 Slip Flag1`
  (`item 1` selected, `Flag1.state==0`) → `Stop Slip; StartW Razres; …;
  State Lec_v 1; Lstate Goto_1 1 38; Lstate To_38 1 44; Lstate Interface 1 44`.
  Then `Click 0 Lec_v Lec_v` (`Case 1`) → `Goto 240 440; StartW Goto2; Level 38 0`.
  This path needs only **implemented** commands — the blocker is scene 38 being
  added to the manifest, not a missing opcode.
- **Level39 → Level40 / 47:** `Click 0 Goto_40 Goto_40` → `…; Lstate Goto_5 1 6;
  Level 40 0; Objzet Col_all 1010; Objzet Col_vaz 1000`; and
  `Click 0 Goto_1 Interface` → `Goport 2; Level 47 2`. Again implemented
  commands only; requires scenes 40/47 assets.
- **Re-entry persistence** is already covered: `Lstate`, `State` in long-lived
  `SceneState`, inventory, and `visible` flags survive transitions (verified
  `1→39→1` in the existing tests).

---

## 5. Exact Ghidra questions (do not guess semantics)

Dispatch table `0x405ea1`, lexer hash `0x4058d8`, parser `0x4066c8`.

1. **`Setmsk`** — which opcode in `0x405ea1`? Does it replace the nav buffer
   `scene+0x72a`/mask `scene+0x705` and recompute the hero's current
   `depth`/`scale` (via `0x405968`/`0x4059c0`) immediately, or only on the next
   `Goto`? Is the old mask resource released?
2. **`Block` / `Ublock`** — which opcodes? Which field do they write —
   `scene+0x709` (shared with `StartW.busy`) or a separate lock? Does `Block`
   suspend the *Program* or only *input*? What releases it besides `Ublock`
   (scene teardown `0x407c14`, new game)?
3. **`Start <anim> Fclick <event>`** — how does the parser store the second
   string (`0x404e40` → `anim+0x211`)? Confirm `0x4054eb` dispatches it through
   `0x4079ac` and whether it also runs for `StartW`.
4. **`StatrW`** — confirm `0x4058d8("StatrW") == 0x1768f == 0x4058d8("StartW")`
   and that the dispatch branch is identical (static check suffices; already
   DERIVED, but worth a readback of the branch).
5. **`Fault`** — `0x40aae8`/`0x408350` + `0x4081c8`: exact behaviour on an
   unhandled object click (dialogue, sound, animation, item consumption), and
   whether it consumes the selected item (`scene+5`).
6. **`Setbck` vs `Setbcr`** — opcodes and the difference between the two
   background operations (replace vs. restore/root?).
7. **`Shift <int>`** — opcode and semantics (camera/scroll offset? hero shift?).
8. **`Egame`, `Setmap <int>`, `remStartW <anim>`** — opcodes and semantics.
9. **`Light`** — the full field layout of the extra declaration arguments
   (`Light Light0 15 1000 70 100 500 0.4 1`), beyond cursor/depth.
10. **Cross-scene `Click` stateScene** — confirm `0x408c8c` resolves
    `handler.stateObject` against `sceneTable[stateScene]` (table `0x46851c`)
    and the `-1`/`{` default behaviour.

Recommended dynamic check (read-only, Windows/x86, breakpoints only): set
breakpoints on `0x405e5c` (opcode dispatch), `0x4058d8` (lexer hash) and
`0x409964` (Goto/nav entry); step any `Setmsk`/`Block` sequence in Level10 or
Level36 and record the opcode numbers and the fields they write.

---

## 6. What to implement first

1. `Setmsk` (unblocks 20 scenes).
2. `Block`/`Ublock` (unblocks 13 scenes).
3. `Start … Fclick <event>` + `StatrW` alias (unblocks Level10 sequencing).
4. Cross-scene `Click` stateScene (correctness for 6 scenes).
5. Expand the scene manifest along the `1 ↔ 39` spine → `38/40/47` → outward,
   and add an "Active-only" layout mode for the 6 overlay scenes.
6. `Fault` after progression is stable (interaction fidelity, not progression).

Do **not** invent semantics for `Shift`/`Setmap`/`Egame`/`remStartW`/`Setbcr`
before the Ghidra questions above are answered.
