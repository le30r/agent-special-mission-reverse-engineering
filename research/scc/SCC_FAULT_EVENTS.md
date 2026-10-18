# SCC fallback speech and event contracts

Part of [SCC_MISSING_OPCODES](SCC_MISSING_OPCODES.md). Original EXE static
evidence, not observed Windows play. Reuses [AUDIO_RUNTIME](../audio/AUDIO_RUNTIME.md)
for Voice/Fram/StartW details; does not repeat WAV codec/mixer research.

## Fault

**Command / Syntax / Arguments:** top-level
`Fault <objectName:string> <count:int> <wavPath1> ... <wavPathN>`.
Not a Program instruction, click handler, Sound alias or generic “play voice”.

**Parsing — CONFIRMED:** hash `0x13cc6`, `0x4078a0–0x40795f`;
`%s %d` then N `%s` reads, crossing physical lines. Creates a new FaultList
even if an earlier list has the same name. `0x40ab4c` initializes count=0 and
name; each `0x40ac00` allocates a `0x92`-byte Voice (`0x402e34(path)`) and
appends its pointer. Scene count `+0x639`, pointers `+0x63d` (50 table slots
before `+0x705`). FaultList `0x12c` bytes: count +0, ten Voice pointers
+4..+0x28, objectName[256] +0x2c. Native append does not check these limits.
The resource paths are stored by Voice; underlying resource data preparation
follows the existing audio loader. N is not a WAV channel or repetition count.

**Execution / Conditions — CONFIRMED:** ordinary scene click `0x40a238`:

1. Must not be busy (`+0x709`) or blocked (`+0x73b`). Hit an eligible object
   with nonzero abs(depth) using existing sorted hit testing.
2. Cancel active Programs, dispatch its event with current selected item.
3. Only when selected item is **0**, no matching item/state Program executed,
   and blocked flag is still 0, try a same-name FaultList (`0x40aae8`).
   This searches in insertion order and compares names byte-for-byte;
   duplicate names select the **first**, not concatenate/overwrite.
4. No list: ordinary click-to-walk. List: `0x408350` patches synthetic
   Fault Program's Goto and two Setxy coordinates to clicked world XY,
   chooses a Voice, puts it in Speak's first Event; dispatches Fault with
   mode=0/item=0. A wrong selected item does not trigger Fault or walking
   merely because no Click branch matched.

Missing Click handler, missing Case and mismatching item are different reasons
for dispatch=false; item!=0 still suppresses fallback. Fault selection does not
read Object State directly; State already influenced Click selection.
The helper does not consume inventory or change Object State.

**Exact selection — CONFIRMED:** `0x40ac64` instructions:

```ts
const r = nativeRand15(); // 0..32767
const k = Math.floor((r * count + 0x3fff) / 0x7fff);
const chosen = voices[Math.min(k, count - 1)];
```

For valid positive N<=10 this is an integer rounding/clamp formula, **not**
`rand()%N`, round-robin, no-repeat selection or equal-probability floor(random*N).
For N=2, enumerating all possible r gives 8192 selections of index 0 and
24576 of index 1 (DERIVED). `0x43d52c` updates thread CRT RNG state as
`u32(seed*0x015a4e35+1)`, returns `(seed>>>16)&0x7fff`. Initial seed and all
other consumers/order are not recovered here: exact cross-session sequence is
UNKNOWN. An implementation can expose deterministic RNG input without falsely
claiming a matched native random sequence. Repetition of the same line is allowed.

**SCC/animation synchronization — CONFIRMED:** loader `0x4081c8` adds an Event
to existing Speak: frames 1..3, one target Mainhero. It appends synthetic Handler
`Click 0 Fault Interface` (stateScene=-1) with the **same Program pointer in all
50 Case slots**. Program is `Goto x y; Setxy x y; StartW Speak; Setxy x y`.
`0x408350` writes XY to Program instruction offsets `+8/+0xc`,
`+0x114/+0x118`, `+0x32c/+0x330`. `0x4055ac` writes borrowed Voice to
first Speak Event `+0x60e`; selection occurs before the synthetic Goto.
Normal Program/animation scheduler, including native alias-slot polling order,
then applies. Speak's positive Event uses normal speech volume/subtitles and
range barrier; StartW waits for Speak inactive, not a global audio promise.
Don't mark Fault busy at selection time: Goto comes before StartW.

**Path special case — CONFIRMED code / DERIVED outcome:** executor Goto's
no-path branch detects a StartW Speak two instructions ahead. It skips the
intervening Setxy and arms `DAT_00444691` so the following Setxy is suppressed.
This is the previously recovered `0x406084–0x4060ea` special case, not proof
that an unwalkable Fault point must always become a walk failure. Preserve it
through the ordinary Program model; see SCC_RUNTIME.md §§5–6.

**Persistence:** lists/Voices, synthetic handler and Event are per visit,
recreated on entry. Ordinary unload `0x407c14` frees FaultLists with
`0x40aba8 → 0x402edc(voice,3)`. Speak borrows the Voice; its destructor treats
Speak specially, so **do not double-own/free** the selected Voice. Save routines
do not serialize the chosen list index, event, Program PC or RNG state in the
traced game state. No established persistence of the chosen reply; load
rebuilds Fault and next selection uses then-current CRT RNG.

**Edge cases:** zero/negative N yields an empty list; selection has no valid
Voice contract (N=0's native clamp reads count slot, i.e. 0). N>10 overflows
the pointer area; do not emulate memory corruption. Missing name/paths and
failed scanf are unchecked, not defined automatic defaults. Duplicate paths
are preserved: `Level21:139` lists K002.wav twice, not two distinct replies.

**Real malformed example — DERIVED, not automatic repair:**
`Level17.scc:127 Fault New_janitor1 SOUND\scn_17\otboy\Sound042.wav`
omits N. Prior line 126 successfully read N=1 into the reused local int.
Parser neither resets that local nor checks scanf's return; assuming normal
CRT `%d` matching failure leaves the nonnumeric path unread and count=1,
its following `%s` consumes that WAV. Thus this specific declaration is
derived to load one Voice, **not** evidence of an optional count grammar.
The actual CRT scanf engine was not exhaustively replayed. Keep this case as
a golden parser-state regression, not a generic rule “missing N means 1”.

**SCC examples / Initial state / Expected observations:**

- Level1:123 `Fault Morda 1 SOUND\scn_01\otboy\otd_001.wav`; Morda is
  Active at line34 (700,230)-(800,330), must be shown by Init. With item0,
  no matching Click-Program and clear flags, click selects that exact path,
  executes synthetic movement/speech; no inventory change. Selected item1
  must not invoke this fallback. Full Init and Sound context is in resources.
- Level29:62 `Fault Janitor 2 Sound\scn_29\konst\002.wav
  Sound\scn_29\otboy\Sound065.wav` (one physical line). Supply r=0/8191/
  8192/32767: first/first/second/second respectively. Check actual resource,
  then frame barrier, rendered Mainhero speech and eventual Program resume.
  Do not just assert that some Voice was allocated.

**Original EXE evidence:** live `0x40ab4c/0x40ac00/0x40aae8/0x40ac64`,
`0x4081c8/0x408350/0x4055ac/0x40a238/0x43d52c`; assembly for selection,
complete parser; previous AUDIO_RUNTIME Voice and unload dossiers.
**Confidence:** valid-list selection/control flow CONFIRMED; concrete full
click sequence DERIVED; RNG seed, all failed-resource/modal paths UNKNOWN.

**Implementation considerations / Proposed tests:** reuse WAV Voice identity,
borrowed Event and cooperative Program, not a separate unsynchronized speech
player. Add click fallback and data declarations; preserve first-name match,
paths and counts. Test wrong item, state-selected handler suppressing Fault,
no handler/no Case, hidden/not-hit object, busy/blocked precedence, random
thresholds (N=1/2), repeated same reply, interruption during path vs speech,
no-path special case, replay and scene unload/load without stale callbacks.
Malformed data must be diagnosed with a documented browser policy where exact
native failure remains unknown. No application tests were added in this task.

## Fclick

**Command / Syntax:** independent **load-time directive** `Fclick <eventName>`;
in the corpus written as `Start <anim> Fclick <eventName>`. Not double click,
click filtering or a distinct Program opcode.

**Arguments / Parsing — CONFIRMED:** hash `0x13d8b`, parser
`0x407754–0x40778f` reads `%s` event into EBP-0x19c, then looks up animation
using previous operand buffer EBP-0x29c and `0x404e40` copies event+NUL into
`animation+0x211` (256-byte area up to `+0x310`). Start writes that buffer
at `0x4073d3`, regardless of whether its Program's Case will ever run.
Consequently this is **a property of the animation declaration for the visit**,
not a callback installed by executing Start.

The shared operand buffer is also written by Stop, Show/Hide, Setmsk/Setbck;
it is not a proper parser “last started animation” variable. **StartW uses
the other buffer EBP-0x19c**: extrapolating `StartW A Fclick B` as a valid
modifier of A would be wrong; it instead resolves stale EBP-0x29c. Missing
animation lookup is not null-checked before the copy. Prefer a safe diagnostic
for unsupported/malformed forms, not arbitrary emulation of a native crash.

**Execution / State mutations — CONFIRMED:** `0x405064` one-shot completion
after final MULT/event processing, with frame>frameCount and barrier==null:
`0x404fb4(anim,0)` first resets/deactivates animation; if `+0x211[0]!=0`,
`0x4079ac(scene,mode=0,item=0,event)` executes synchronously. Animc wraps
frame/barrier and does **not** take this completion branch. Manual Stop calls
the reset helper but not this event-dispatch branch. An explicit forced
`0x405064(...,-1)` update can also reach completion: the predicate is cursor/
barrier state, not exclusively elapsed wall time. Sound barrier therefore
can defer Fclick; it is not fired at final frame arrival while voice holds it.

**Dependencies:** standard handler/item/state selection, **without**
`SccRuntime.click()`-style cancel-active. Ignores currently selected inventory
ID because dispatched item is hardcoded 0. Receiver may change State or start
other animations while the outer animation iteration is in progress. Existing
StartW continuations normally see inactive on next SCC poll; a callback which
restarts that same animation can change what they see. Do not defer to an
unproven global FIFO or Promise callback. It is permitted while Block is set.

**Persistence / repeat:** Start/Stop `0x404fb4` does **not** clear +0x211;
every later natural one-shot finish fires again. Only declaration reconstruction,
replacement or another Fclick write changes the property. Animations are
rebuilt each entry and callback is not serialized; parsing re-establishes it.
Effect does not end when its enclosing Program/Case ends.

**SCC examples:** Level10:200 K_bandit→Name, receiver 214–222 Band_a Case1;
Level38:319 Bandit2_Lora→Bandit, receiver286–294 Interface Case0 (Ublock,
Start Bandit2_c, Cursor Pank/Gungster7, State Pank1). Second source was
misreported as Level10:319 by older coverage/BM; actual file is Level38.
Initial flags/state must match these Cases. Natural end must visibly unblock
and start the correct follow-up; parsing alone is insufficient.

**Confidence:** property/storage/completion path CONFIRMED, concrete sequence
DERIVED under entry conditions. **Proposed tests / Implementation:** declaration
metadata persists through starts; dispatch exact event/item0, no cancellation.
Test callback after alternate Start of the same anim, unreachable declaring
Case, manual Stop (no event), loop (no event), barrier delay, repeated natural
completion, selected item!=0, busy/blocked state, state changes since parsing,
callback starting another anim, and scene disposal. Don't clear property after
first use. Atomic BM: SCC Fclick; Git evidence in missing-opcodes JSON.

## Click stateScene

**Command / Syntax:** `Click <selectedItem:int> <event> <stateObject>
[stateScene:int] { Case ... }`; this is a handler parameter, not another opcode.

**Arguments / Parsing — CONFIRMED:** `0x407155–0x40725e` reads `%d %s %s`.
If third scanned token is `{`, substitutes stateObject=Interface and scene=-1.
Otherwise reads one more `%s`: `{` means scene=-1; any other token is passed
to `0x43d1ec` integer conversion, then the normal token loop will read `{`.
`0x408a48` stores stateScene at Handler+0, event+4, stateObject+0x104,
50 Program slots+0x208, item+0x2d0. No range checking here.
Invalid nonnumeric token converts through CRT integer helper (typically 0),
not an optional-name form; exact overflow/error behavior is not a safe language
feature. An explicit -1 selects current scene like omission.

**Execution / State mutations — CONFIRMED:** `0x408c8c` uses current Scene
if scene=-1; otherwise `(&DAT_0046851c)[stateScene]`, then
`0x40a8dc(stateObject)` and object+4. Missing named object returns state0.
State selects Program slot in `0x408cd8`; that Program still executes **in
the event's current scene**, not the state-source scene. Reading State does not
visit/reparse the other scene or create a placeholder. Event comparison in
`0x4079ac` is byte-exact; all matching handlers are considered in declaration
order, OR-ing success. Since execution is immediate, earlier handlers can
change State seen by later ones. Resume does not reselect the Case.

**Dependencies / Persistence:** cross-scene object table and Lstate
placeholders (existing 0x405b78/0x405c10 contract). Handler is per visit,
recreated from source; states may persist across visits/save via object
serialization. Effect is a dependency binding, not a permanent mutation.
No animation/sound wait is added; ordinary Program opcodes govern waiting.

**Edge cases:** missing object state0 differs from null/missing **scene**;
invalid scene index can dereference unrelated table memory, not silently
fall back to current scene. Case state outside 0..49 has unchecked native
indexing; safe port should diagnose. No observed corpus invalid scene indices.

**SCC examples:** Level12:151 `Click 0 Start Plocat_l_v 10`, Case1:
`Cursor Smoker 7`; requires state of Level10.Plocat_l_v==1, not local
Level12.Plocat_l_v. Change visible hover cursor on current Smoker, not source
object. Level12:181 `Click 0 Smoker Plocat_l_v 10` chooses different
movement/animation paths from same remote State. Level38:297 and305 read
Lampochka / **Lapm** from scene44 (preserve original spelling), Cases1/2
choose normal `Scn_38.tif`. If the remote object is absent, state0 and no
such Case, so another Start handler may leave `_no` mask selected.

**Confidence:** parser/lookup/execution scope CONFIRMED; resulting branch
choice under given remote state DERIVED. **Proposed tests / Implementation:**
store scene selector on handler; add scene-aware readState without moving
command execution to remote scene. Parse all 11 true source examples in
source-facts.json. Set local and remote states differently, verify current
scene action; missing remote object→Case0, -1/omission parity, remote Lstate
before first visit, save/load preserved State, later event reflects changed
remote state, suspended Program keeps its original selection. Do not implement
a new synthetic “Click stateScene” keyword.
