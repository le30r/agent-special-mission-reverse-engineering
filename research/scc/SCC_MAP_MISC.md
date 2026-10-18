# SCC map, background and exceptional-token contracts

Part of [SCC_MISSING_OPCODES](SCC_MISSING_OPCODES.md); static original binary,
same evidence identity and confidence labels. Browser code is not changed.

## Setmap

**Command / Syntax / Arguments:** `Setmap <bank:int>`; bank, not a navigation
mask/resource, map hotspot number or scene index.

**Parsing / Execution / State mutations — CONFIRMED:** hash `0x17172`,
`0x407846–0x40786e` reads `%d`, appends opcode 0x20 with A=bank.
`0x40659b–0x4065a7` writes `UI(DAT_00468788)+0x21=A`; no yield, resource
load, immediate scene transition or implicit destination unlock. Scene/session
ownership is global UI, not the current Scene object.

**Dependencies — CONFIRMED:** pairs at `0x4456b4` form **2 banks × 7**
(sceneId, portalIndex), stride 0x38/bank and 8/zone. Readback:

| Zone | Bank 0 target@portal | Bank 1 target@portal |
|---|---|---|
| 0 | 47@0 | 16@0 |
| 1 | 45@0 | 20@0 |
| 2 | 39@0 | 5@0 |
| 3 | 1@0 | 37@0 |
| 4 | 41@0 | 10@0 |
| 5 | 46@0 | 29@0 |
| 6 | 44@0 | 18@0 |

`0x40d420` checks 7 strict rectangular map areas using `map.mult` frame
dimensions and fixed positions `0x44576c`, selecting UI+0x15 only when
`unlocked[bank*7+zone]!=0`. `0x40d2a4` uses selected zone/UI+0x21 to request
the table's scene and portal, plays UI sound, returns UI mode to 0 and disposes
map background. `Setmap` only selects which destination/unlock bank is used.
Map-open `0x40d370` separately checks scene busy/blocked.

**Persistence — CONFIRMED:** new game `0x40c6e4→0x40d1ec` sets bank=0 and
all 14 unlock ints=0. `0x40d220` serializes bank (4 bytes) plus table (14×4),
`0x40d250` restores them. These are called by game save/load, including load
`0x40c7c4`. Ordinary scene transitions do not reset them. A later Setmap
replaces the global bank; Object State/animation/Program completion do not.

**Edge cases:** no native bounds check; valid table indices are 0/1, but arbitrary
negative/large ints are stored. Subsequent table accesses can read unrelated
memory. Browser must diagnose invalid bank rather than invent modulo/clamp.
Repeated bank assignment does not clear either bank's unlocks. Save-load must
restore bank **before** entry Start, which can write further commands.

**SCC example:** Level3:210–226 `Click 0 Init Interface`, Case0:
`Start Startlevel; Start Startlevel1; Setmap 1; Show Truba; ...`.
It switches only on the first scene visit (Init), not every re-entry. Precondition
Interface.state=0 at Init. Existing bank0 unlocks stay stored but no longer control
bank1's hit-test; subsequent Setzon commands unlock the active bank.

**Original EXE evidence:** parser/executor assembly, `0x40d280`,
`0x40d1ec/0x40d220/0x40d250/0x40d420/0x40d2a4`, raw map-bytes.json.
**Confidence:** table/layout/branches CONFIRMED; gameplay outcome DERIVED.
**Implementation considerations / Proposed tests:** global bank plus unlock
matrix and actual map UI/selection, not just a stored integer. Test bank0 zone2
→39@0 versus bank1 zone2→5@0; locked region has no selection; preserve the other
bank's flags, repeated Setmap, new game reset, save/load, Init once, Block
prevents opening. Scene26/48 are absent from both recovered banks: do not claim
this map path reaches them (corrects older SCENE_GRAPH speculation).

## Setzon — newly discovered implementation defect

**Command / Syntax / Arguments:** `Setzon <zone:int>`, valid slots 0..6.

**Parsing — CONFIRMED:** hash `0x1718b`; parser `0x407873–0x40789b`
reads `%d`, appends **opcode 0x21**. It is not opcode0x20.
**Execution / State mutations — CONFIRMED:** `0x4065a9–0x4065bc` calls
`0x40d280(UI,A)`, which writes
`*(int*)(0x445724 + 4*(UI.bank[+0x21]*7 + zone))=1`.
No wait, toggling, current-zone assignment, scene state change or path effect.

**Dependencies / Persistence:** same 2×7 map availability table as Setmap;
current bank determines the row. Idempotent repeated Setzon; no SCC inverse
found in the observed dispatch/corpus. Flags survive scene transitions and
save/load; reset together with bank on new game. Setmap alone doesn't copy or
clear them. No argument range guard; invalid indices overwrite other memory
in native, not an established port feature.

**SCC example:** Level1:127–145 Init Interface Case0 executes `Setzon 3`
before Start Startlevel, Show commands and initial AVI. In bank0 this enables
map destination1@0; Level37:121 uses Setzon3 to enable **37@0** in bank1 if
that bank is active. `Level39:86 Setzon 2` opens39@0 in bank0. All 15 uses /
14 scenes, exact locations in source-facts.json.

**Implementation status:** **PARTIAL, semantically wrong**, not SUPPORTED:
`SccRuntime.zone`/`SceneLoader.game.zone` stores the number but the engine does
not maintain map bank/unlocks or provide original map travel. The old coverage
and BM statement “game-session int, full” conflated Setzon with Setmap's field.

**Confidence:** CONFIRMED original; mapping to visible map behavior DERIVED.
**Implementation considerations / Proposed tests:** implement with Setmap as a
functional travel feature, retain bank+table globally. Test zone3 under both
banks visibly enables different destinations; repetition stays enabled, switching
bank hides locked zone, save/load preserves both rows, new game resets them;
normal scene transitions and Program completion do not erase flags. Replace the
single-int browser abstraction; do not add a no-op just to count support.

## Setbck

**Command / Syntax / Arguments:** `Setbck <backgroundResource:string-token>`.
**Parsing — CONFIRMED:** hash0x17164, `%s` branch0x407493–0x4074be,
opcode0x1d, string operand; no optional rectangle/transition type.
**Execution / State mutations — CONFIRMED:** executor case0x1d at0x406269
(call0x406280) calls
`0x405af0(scene,path)`, then clears `UI+0x269` (cached displayed background).
Helper destroys old `Scene+0x73c` background wrapper via0x403500(old,3),
allocates0xdac bytes, constructs0x4033c8(new,path), writes new wrapper pointer,
sets wrapper+0xd9c/+0xda0=1. It does **not** call Back/0x405a44 and does not
update scene+0x75e/+0x762 or allocate scene+0x72a.

**Dependencies:** image resource manager, renderer/background cache. The next
UI game update0x40c974 takes the new scene background when cache is null.
No navigation mask change; SCC often pairs Setmsk explicitly. No State or
inventory change, animation wait, fade or Program termination in this handler.

**Persistence:** per-visit resource; regular scene unload destroys it. Entry
reparses Back then Start may select a replacement from persistent State.
No background path/wrapper serialization in0x407d44/0x407e14. Existing object
MULT images are separate and may persist; don't flatten them into background.

**Edge cases:** repeated same path still reconstructs wrapper and invalidates
UI cache; native helper frees old wrapper first (failure isn't atomic rollback).
Unchecked construction/resolution failures not a defined safe fallback. Different
size background leaves scene navigation W/H unchanged; don't automatically resize
world or mask. All referenced paths resolve in available resources (source-facts).

**SCC example:** Level22:240–247 lamp interaction:
`Goto 470 500; StartW K_lamp1; Setbck BACKGRD\Scn_22.tif; Hide Corob_vxt;
Hide Zercalo_t; ...`; Level22:206 Start Case1 re-applies the lit background and
mask on entry. Initial matching Case must hold; replacement follows completed
lamp animation, subsequent Hide removes separate foreground parts.
Level23:250/255/265 and Level25:170 provide additional entry-state variants.

**Original EXE evidence:** complete parser/executor, live0x405af0 versus
0x405a44,0x40c974. **Confidence:** CONFIRMED static; visible sequence DERIVED.
**Implementation considerations / Proposed tests:** alternate background
manifest, cache replacement at correct SCC position, no world-size/nav change,
same-path repeat, paired mask swap, scene revisit Start reapplication and
save/load. E2E assert actual changed background pixels and retained foreground
visibility; successful resource fetch alone is not an observable result.

## Setbcr — not an opcode in this EXE

**Command / Syntax / Arguments / Parsing:** observed source text
`Setbcr BACKGRD\Scn_28.tif`; **not a recognized command grammar**.
Hash0x1716b enters original decision tree0x40693b:
subtract0x17125, test; subtract0x3f (therefore recognizes0x17164=Setbck),
test; at0x40694f jump to scanner0x407984. Neither recognizes0x1716b.
Following filename has length>=7, hash0, also ignored by the independent next
scan. This is verified by complete instructions and bounded decision-tree
replay in probe_missing_opcodes.py, not merely absent string literals.

**Execution / State mutations / Dependencies / Persistence:** none for these
two source tokens in the examined binary. No internal representation, handler,
background restore, wait or lifetime. Author intent “misspelled Setbck” is
HYPOTHESIS; native ignoring is CONFIRMED code with DERIVED exact token traversal.

**SCC examples:** Level28:133/152, Click53 Doscaa Doscaa Cases0/3, after
Goto600410 and before StartW Dosca_f. Item53 is removed later; states and mask
are changed by subsequent real commands. Background does not change **from
Setbcr**; MULT itself may change visuals. Browser drops it too; implementation
status UNSUPPORTED token, but no missing native feature to add for parity.

**Edge cases / Implementation considerations / Proposed tests:** do not alias
Setbcr→Setbck. Test these exact two lines contribute zero instructions and do
not replace background, while following StartW/Remtol/State still execute.
Do not extend claim to arbitrary strings or another game build: operand tokens
that collide with real hashes could have independent effects. No regression
should assert the author's hypothesized intention as native behavior.

## remStartW — ignored tokens, not a comment grammar or alias

**Observed syntax:** Level23:261 `remStartW Babka_talke_1`, Start Babka Case5.
**Arguments / Parsing:** length9 keyword and length13 operand both hash0,
independently reach scanner0x407984; no instruction is emitted. No generic
REM-prefix/comment-line facility was established. **Execution / State mutations /
Dependencies / Persistence:** none for these exact tokens. Next line
`Start Babka_gorec` remains a genuine instruction; previous `Stop Babka_tea`,
Show/Hide and background/mask replacement still operate.

**Original EXE evidence / Confidence:** hash0x4058d8 + full dispatch/replay,
exact SCC source hashes: CONFIRMED / traversal DERIVED. “Commented-out call”
is author-intent HYPOTHESIS, not an engine feature. Browser drops it; no command
implementation required for original parity. **Edge cases / Proposed tests /
Implementation considerations:** zero emitted command and no Babka_talke_1
start/wait; following Babka_gorec starts. Do not strip arbitrary `rem` or silently
turn this into StartW. The state of Babka_talke_1 from other calls is unaffected.

## StatrW — collision alias, not an additional opcode

**Command / Syntax / Arguments:** source typo `StatrW <anim>`; same grammar
and runtime representation as StartW, one whitespace animation token.
**Parsing — CONFIRMED:** `0x4058d8`: strings length>=7 return0; shorter ASCII
bytes weighted1000,100,10,1,1,1. StartW/StatrW swap two equally weighted bytes:
both0x1768f; decision path goes to0x4073a3→opcode1, not exact string compare.
Case is significant; the browser's lowercasing exact-name matcher differs.

**Execution / State mutations / Dependencies / Persistence:** precisely
existing StartW/animation/WAV contract: resolve anim, first entry sets waiting,
Scene+0x709 busy, starts animation, stores PC and yields; later polls wait on
anim+0xbb9, then clear waiting/busy and advance. It is not a separate alias
with different voice/loop/persistence policy. Callback properties, if already
installed by Fclick, are animation properties and not erased by this start.
Normal StartW behavior including unknown-animation unsafe native lookup and
Animc waiting applies; do not invent typo-specific failure behavior.

**SCC examples:** Level10:184 `StatrW Speak_tl` in prior Case1 before Setxy;
other calls Level18 and25 are listed in source-facts.json (5 uses,3 files).
**Confidence:** hash function and dispatch CONFIRMED; equivalence DERIVED.
**Implementation considerations / Proposed tests:** normalize documented
collision or implement bounded original hash dispatch; do not indiscriminately
correct spelling. Real-source parse must emit opcode1-equivalent commands,
wait on animation/positive WAV ranges and resume Setxy only afterwards.
Test exact case, ordinary StartW parity, repeated invocation and disposal.

## Egame

**Command / Syntax / Arguments:** `Egame`, no args.
**Parsing — CONFIRMED:** hash0x13a60, branch0x407961–0x407975,
opcode0x22, A=B=0. **Execution / State mutations — CONFIRMED:**
0x4065be–0x4065c8 clears byte `UI(DAT_00468788)+0xc` and continues the Program.
No ExitProcess/PostQuitMessage, scene switch, save/new-game reset, inventory
clear, video invocation or SCC wait occurs in this command.

**Dependencies / delayed effect — CONFIRMED:** in UI game mode0,
0x40c974 first updates the scene, then seeing +0xc==0 calls0x40cd14 instead
of ordinary deferred scene-switch processing. When scene busy==0 and
DAT_0044569c==0, helper saves prior mode, clears cached background, calls
0x40d1cc→mode1/main menu background, sets music manager+0x20b pause, calls
0x402878. When busy or modal gate remains set it postpones this transition.
UI menu update0x40d64c suppresses menu slot2 when +0xc==0; escape/resume
0x40cd6c in menu mode likewise returns to game only when that byte is nonzero.
Thus native ending goes to a non-resumable main-menu state, not browser close.
Naming every menu-slot action beyond this predicate is outside this command's
contract; no speculative browser shutdown API is needed.

**Persistence:** global UI-session gate, not scene state or Object State. It
survives Program completion and affects following UI updates; game save/map
serialization0x40d220 contains no such byte. New-game menu action0x40e200
case0 recreates world via0x40c6e4 and explicitly sets byte=1; Egame itself
does not destroy world state. A subsequent load/menu path's entire policy is
not reconstructed as a new save format requirement.

**SCC examples:** Level28:174–184 Door_a Case3 and194–204 Door Case3:
Goto370400; Hide several scene parts; SclipW0 Final.avi; Egame. Initial
Door_a/Door state3 must match. The AVI barrier is separate and precedes Egame;
after its completion, main menu becomes observable when busy/modal conditions
permit. Repeating Egame leaves gate0; it must not instantly open menu during
an earlier still-running blocking animation in a synthetic concurrency test.

**Confidence:** flag/consumer/menu predicates CONFIRMED; visible valid ending
sequence DERIVED. **Implementation considerations / Proposed tests:** implement
with actual AVI completion and UI game/menu lifecycle. Assert Final.avi completes
before gate effect, menu is rendered and ordinary resume disabled, scene switch
not applied by the skipped branch; new game restores session. Browser retaining
a recoverable debug scene is a separate affordance, not original behavior.
