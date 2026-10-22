# SCC missing opcodes — original-engine specification

Date: **2026-10-18**. Baseline: **local master
`e08f0f05c75f96def508905aea0aff184f0bd2aa`**, not the older origin/master.
Research only: no application code, original resources, tests or runtime stubs
changed. Work is in the current checkout per subsequent user instruction,
overriding the initial separate-worktree requirement; commit belongs to a
separate research branch, no merge.

## 1. Result and evidence boundary

**14 command names/constructions investigated:** Setmsk, Block, Ublock, Fault,
Fclick, Click stateScene, Setbck, Setbcr, Shift, Setmap, Setzon, Egame,
remStartW, StatrW. Valid-input contracts/dispositions are implementation-ready:
11 independent recognized directives/forms, 1 hash alias, 2 ignored-token
constructs. These are **not 14 new opcodes**. No named construction in this
set remains wholly UNKNOWN; residual failure/seed/timing questions are listed
in §9 and must not be mistaken for established behavior.

Most important corrections:

- Setmsk replaces raw navigation/depth mask pointer, not MULT hit mask; no
  immediate route rebuild/hero relocation.
- Block redirects normal scene clicks to **Plane** and prevents map opening;
  it is a separate boolean from StartW busy, with no block identifier.
- Fclick is a **load-time persistent animation property**, not a callback
  installed each time Start executes. Actual second occurrence is Level38:319.
- Fault uses biased integer random selection and a synthetic movement/StartW
  Speak Program; it is not a bare Sound request.
- **Setzon was incorrectly marked implemented**: native unlocks a slot in a
  global 2×7 map matrix; Setmap selects its bank. A stored zone integer is not
  equivalent.
- Setbcr and remStartW do not produce commands in this binary. Do not implement
  their presumed author intent. StatrW **does** execute as StartW via hash collision.
- Egame clears a global resume/game gate and eventually opens non-resumable
  main menu, not process exit. Shift controls camera target, not navigation.

### Evidence identity

Agent.exe: `agent-original/game-installed/Program_Executable_Files/Agent.exe`,
PE32/x86, SHA-256
`71065c571a9cd40f460458d766720c0a01954e0bef521aad675b4ea6b3186e85`.
REA MCP provider **Ghidra 12.1.4**, profile
`4f6212bfe31448a7b96743a449e91c35890105cedd34e1d9951e9467d284e0a5`.
Addresses are **VA**, image base0x400000; field offsets are **bytes** (decompiler
int-pointer subscripts must be multiplied by4). No original Windows process
was executed. REA initially reported no open document; opening the known binary
gave an ephemeral imported Program, same binary/profile as existing dossiers.
No persistent Ghidra project was exposed by the available REA session; it was
not falsely claimed to have been reused. Existing primary research was reused.

Confidence is independent of port status:

- **CONFIRMED:** directly read original code/instructions/bytes/resources.
- **DERIVED:** stated result follows from those facts under named conditions;
  offline integer/route replay is not a dynamic native trace.
- **HYPOTHESIS:** plausible intent/interpretation without sufficient evidence.
- **UNKNOWN:** not established; no invented expected result or recovery policy.

## 2. Knowledge inventory and current implementation audit

BM project discovered before EXE research: **agent-reverse**, UUID
`c2845f27-4e49-4c4f-9b1f-41e073f1acc1`. No new project and no other project's
notes used or edited. Initial recent_activity and SCC/mask/click/WAV/save searches
located 15 indexed notes. Read project index, SCC_COMMAND_INDEX, SCC_RUNTIME,
SCC_VISIBILITY_INIT, SCENE_TRANSITIONS, SCENE_STATE_CONTRACTS,
ANIMATION_CONTRACTS, WAV_RUNTIME_AUDIT, IMPLEMENTATION_STATUS, NAVIGATION_SCALE,
MULT_FORMAT, AGENT_REVERSE_RESEARCH. BM was an index, not proof of native facts.

### Map of established knowledge

| Subsystem | Existing Git primary research / BM index | Reuse / new investigation |
|---|---|---|
| Architecture/resources/MULT | MULT_FORMAT, AGENT_REVERSE_RESEARCH | reused format/resolver, no fresh EXE-wide search |
| SCC scanner/parser/Program/dispatch | SCC_RUNTIME + parser/executor dossiers | localize missing hash branches, compare instructions |
| Object State/Show/Hide/Init | SCC_VISIBILITY_INIT | reused object layouts and visibility; correct obsolete Setzon advice |
| Click/scene state/transitions | SCENE_TRANSITIONS, SCENE_STATE_CONTRACTS, SCENE_GRAPH | remote state selector, blocked input, serialization-versus-entry reset |
| Navigation/depth/camera | NAVIGATION_SCALE, navigation evidence | mask replacement, existing-route effect, Shift consumer |
| Animation/SCC/audio | ANIMATION_CONTRACTS, AUDIO_RUNTIME | Fclick property, Fault borrowed Voice/selector; no repeat codec RE |
| Save/load/previous unknowns | object serializers and scene lifecycle notes | scene record, map bank/unlocks, UI ending gate; whole save format not claimed |

For **each** target, preexisting BM coverage was in SCC_COMMAND_INDEX, not an
atomic note; Git coverage existed in SCC_COVERAGE. Prior address/semantic status:

| Target | Previously indexed primary address | Prior semantic evidence | New action/result |
|---|---|---|---|
| Setmsk | helper0x405a08 already in navigation; command branch unindexed | raw Mask confirmed, command mapping HYPOTHESIS | joined opcode7 branch to same helper/consumers |
| Block/Ublock | none indexed | input lock HYPOTHESIS | op8/9, Plane routing, map gate, save/entry nuance |
| Fault | parser0x4078a0, selector0x40ac64, AUDIO_RUNTIME | sound path researched, click/selection contract incomplete | explicit conditions, biased RNG, synthetic Program, malformed source |
| Fclick | setter0x404e40, completion0x405064 | event field known, start-time interpretation incomplete | load-time shared-buffer binding, restart/loop/Stop semantics |
| Click stateScene | parser0x407155, read0x408c8c | largely restored | verified arguments/scope/persistence, real examples |
| Setbck/Setbcr | no indexed branch | background swap/restore HYPOTHESIS | real swap vs unrecognized typo separated |
| Shift | no indexed branch | UNKNOWN | camera target + exact update rule |
| Setmap | no indexed branch | UNKNOWN | global map bank/save/load/table |
| Setzon | browser “session int” claimed | wrong/incomplete mapping | opcode0x21 unlock matrix; implementation defect |
| Egame | no indexed branch | UNKNOWN | deferred main-menu/no-resume gate |
| StatrW |0x4058d8 and StartW branch | collision DERIVED | original instruction-tree path verified |
| remStartW | none indexed | UNKNOWN | both tokens ignored, no comment grammar inferred |

### Browser sources actually reviewed

`src/scc/runtime.ts` parseScc/SccRuntime, `src/scene/scene-view.ts`,
`scene-session.ts`, `scene-loader.ts`, `scene-definition.ts`, `scene-source.ts`,
`mask.ts`, `src/navigation/router.ts`, `src/animation/player.ts`,
`src/audio/scc-audio.ts`; docs/IMPLEMENTATION_STATUS, SCC research, SCENE_GRAPH,
SCENE_TRANSITIONS, AUDIO_RUNTIME and navigation/visibility evidence.
Core parser silently drops unknown first words, drops Click scene selector and
Start Fclick suffix; case-insensitive line matching is not native hash scanning.
Current WAV code includes inline Repeat, owner/replay/disposal and per-step
sound handling fixes; old audit findings are historical, not fresh failures.
No application tests were rerun as part of native-semantic research.

## 3. Current coverage matrix

Counts are **source occurrences/files**, not successful native parses. Recount
of all57 SCC agrees with old source inventory:47 scenes,3267 Click-body command
lines. Fault malformed count and modifier tokens require separate treatment.

Status: **SUPPORTED** normal implemented behavior with existing verification;
**PARTIAL** incomplete semantics/behavior; **NO-OP** parsed but no execution;
**UNSUPPORTED** missing parsing/execution; **UNKNOWN** insufficient implementation
evidence. Supported does not mean every malformed native input or all story
routes are byte-identical. “Research ready” is separate from that status.

| Command/form | Uses/files | Port status | Research ready | Confidence, original | Next action |
|---|---:|---|---|---|---|
| StartW |525/43|SUPPORTED normal form|yes, existing|CONFIRMED|keep WAV/animation barrier, add alias |
| Goto |389/42|SUPPORTED normal path|yes, existing|CONFIRMED|preserve special Speak/no-path case and modes |
| Setxy |375/43|SUPPORTED normal correction|yes, existing|CONFIRMED|retain correction, numerical boundary caveats |
| Show |309/47|SUPPORTED type-specific|yes, existing|CONFIRMED|retain base Object no-op |
| State |306/39|SUPPORTED|yes, existing|CONFIRMED|retain persistent object field |
| Hide |214/33|SUPPORTED type-specific|yes, existing|CONFIRMED|retain Object vs Active distinction |
| Cursor |174/30|PARTIAL, ID only|field + native name-table use known|CONFIRMED|render cursor/UI verbs |
| Start |166/40|PARTIAL, Fclick lost|yes|CONFIRMED|add declaration-time completion property |
| Level |121/47|SUPPORTED normal deferred switch|yes, existing|CONFIRMED|retain command tail execution |
| Lstate |120/35|SUPPORTED|yes, existing|CONFIRMED|expose remote read for Click |
| Stop |84/20|SUPPORTED|yes, existing|CONFIRMED|no synthetic Fclick on manual Stop |
| Goport |77/39|SUPPORTED normal path|yes, existing|CONFIRMED|preserve current-scene portal meaning |
| Addtol |76/24|SUPPORTED normal inventory|yes, existing|CONFIRMED|fixed-capacity/native overflow separate |
| **Setmsk** |68/20|**UNSUPPORTED**|**yes**|CONFIRMED|mask asset selector + navigation consumers |
| Objzet |65/18|SUPPORTED|yes, existing|CONFIRMED|no automatic State/hide inference |
| Remtol |58/26|SUPPORTED normal inventory|yes, existing|CONFIRMED|retain all-match removal |
| Smusic |50/44|**NO-OP**|yes, AUDIO_RUNTIME|CONFIRMED|separate music manager, not WAV |
| **Ublock** |25/13|**UNSUPPORTED**|**yes**|CONFIRMED|same boolean as Block, no counter |
| **Block** |23/13|**UNSUPPORTED**|**yes**|CONFIRMED|Plane + map gating, separate busy |
| **Setzon** |15/14|**PARTIAL, wrong abstraction**|**yes**|CONFIRMED|replace zone int with map availability |
| **Setbck** |6/3|**UNSUPPORTED**|**yes**|CONFIRMED|background wrapper/cache replacement |
| SclipW |5/4|**SUPPORTED, prepared AVI + global media barrier**|yes, VIDEO_RUNTIME|CONFIRMED|Native EXE/Windows parity still requires Windows run |
| **Shift** |5/3|**UNSUPPORTED**|**yes**|CONFIRMED|absolute camera target, 10 px/update |
| **StatrW** |5/3|**UNSUPPORTED spelling**|**yes, alias**|CONFIRMED hash/branch; DERIVED equivalence|same StartW |
| **Setbcr** |2/1|UNSUPPORTED token|**yes, ignored natively**|CONFIRMED branch; DERIVED traversal|do not alias to Setbck |
| **Egame** |2/1|**UNSUPPORTED**|**yes**|CONFIRMED|UI ending with real video |
| **Setmap** |1/1|**UNSUPPORTED**|**yes**|CONFIRMED|map bank + travel feature with Setzon |
| **remStartW** |1/1|UNSUPPORTED token|**yes, ignored natively**|CONFIRMED hash; DERIVED traversal|do not implement StartW |
| **Fault** declaration |143/40|**UNSUPPORTED**|**yes, valid N**|CONFIRMED|fallback click + synthetic Speak Program |
| **Fclick** directive |2/2|**UNSUPPORTED modifier**|**yes, corpus form**|CONFIRMED|load-time property, natural end event |
| **Click stateScene** |11/6|**PARTIAL, dropped selector**|**yes**|CONFIRMED|scene-aware state lookup, current execution |
| Click (all) |594/47|PARTIAL selector/abbreviation/scanner fidelity|yes|CONFIRMED|event/cancel/Fault routing |
| Case / Break |842 /756|SUPPORTED normal shared lists|yes, existing|CONFIRMED|native alias-slot scheduler order remains a fidelity issue |
| Sound / Fram |507/51;1419/51|PARTIAL overall scanner/fallback; WAV works|yes normal events, existing|CONFIRMED|keep fixed WAV; add Fault borrowing |
| Repeat |8/6, inline|SUPPORTED existing parser fix|yes, existing|CONFIRMED|retain event modifier, not Program opcode |
| Inc |141/47|SUPPORTED recursive source closure|yes, existing|CONFIRMED|don't resurrect old “ignored includes” claim |
| Object / Active / Light |566/48;273/47;13/12|SUPPORTED declarations; unified hit-order partial|yes, existing|CONFIRMED|resolve sorted hit-order/compositor separately |
| Anim / Animc |552/44;64/26|SUPPORTED normal playback, Fclick absent|yes, existing|CONFIRMED|callback metadata rather than new Start opcode |
| Portal / Focus |119/47;47/47|SUPPORTED|yes, existing|CONFIRMED|retain per-scene indexed geometry/scale |
| Back / Mask |47/47 each|SUPPORTED initial manifest|yes, existing|CONFIRMED|add runtime alternatives, not same declaration lifetime |

No further unknown first-word construct was found by the complete source-line
inventory. This is not a claim that every possible native hash branch occurs
in shipped SCC, or that arbitrary unknown tokens are harmless: operands are
scanned independently and can collide with recognized words. **Original hash
is case-sensitive**; browser lowercasing/exact matching differs even for known
names. Do not use138 “unsupported lines” as new-opcode count: it includes3
ignored lines and5 collision aliases, and excludes Fault/modifiers/Setzon defect.

## 4. Dispatch and internal representation

All new paths connect source → `%s` scanner0x438e6c → hash0x4058d8 →
parser0x4066c8 → (Program append0x405cac, when applicable) → activation0x405d30
→ cooperative executor0x405e5c. Instruction stride0x10c: opcode+0, A+4,
B+8, string[256]+0xc. Handler Case binds Program pointers at load time.
Program active/wait/mode/PC at+0x29e4/+0x29e5/+0x29e6/+0x29e7.

| Construct | Hash | Parser entry | Representation | Runtime handler / consumer |
|---|---|---|---|---|
| Setmsk |0x1717f|0x407463|7,string|0x406245→0x405a08 |
| Block |0x13124|0x4069f3|8|0x4063df→Scene+0x73b=1 |
| Ublock |0x177c5|0x407388|9|0x4063ee→Scene+0x73b=0 |
| Fault |0x13cc6|0x4078a0|FaultList, not opcode|0x40a238→0x408350→0x40ac64→Speak |
| Fclick |0x13d8b|0x407754|Anim+0x211, not opcode|0x404e40 setter;0x4054eb completion dispatch |
| Click selector |0x134d0|0x407155|Handler+0|0x408c8c remote read;0x408cd8 select Program |
| Setbck |0x17164|0x407493|0x1d,string|0x406269→0x405af0,clear UI cache |
| Shift |0x171cc|0x40735b|0xb,A|0x4063fd→Scene+0x75a;0x4087ec camera |
| Setmap |0x17172|0x407846|0x20,A|0x40659b→UI+0x21 |
| Setzon |0x1718b|0x407873|0x21,A|0x4065a9→0x40d280→0x445724 matrix |
| Egame |0x13a60|0x407961|0x22|0x4065be→UI+0xc=0;0x40c974→0x40cd14 |
| StatrW |0x1768f|0x4073a3|1,string, same StartW|0x405f7c StartW |
| Setbcr |0x1716b|0x407984 scanner|none|none |
| remStartW |0|0x407984 scanner|none|none |

The hash tree includes **cumulative SUB/JZ**, not just CMP constants. Probe
replays those branches over stored instructions; literal-comparison membership
alone would not be adequate proof of recognition/absence. Ignored constructs'
following operands were checked separately and also reach scanner0x407984.

## 5. Full contracts, examples and proposed tests

Each linked section specifies syntax, argument decoding, state mutation,
dependencies, persistence, edge cases, primary addresses, real source context,
confidence, implementation considerations and observable regression scenarios:

| Group | Contract document |
|---|---|
| Setmsk; Block/Ublock; Shift | [SCC_MASK_INPUT](SCC_MASK_INPUT.md) |
| Fault; Fclick; Click stateScene | [SCC_FAULT_EVENTS](SCC_FAULT_EVENTS.md) |
| Setmap/Setzon; Setbck; ignored Setbcr/remStartW; StatrW; Egame | [SCC_MAP_MISC](SCC_MAP_MISC.md) |

Every target occurrence, handler/Case context, cross-scene Click line,57 SCC
SHA-256s,39 referenced alternative resource paths/dimensions/hashes, hash-tree
traces and selected TIFF route results are in
[source-facts.json](evidence/missing-opcodes/source-facts.json).
Resources were read only; all39 referenced image names resolve in extracted
data. A source occurrence count is not a promise of scanf success: notably
Level17:127 Fault lacks an integer count and relies on preceding parser state
under the derived normal-CRT interpretation.

### Functional regression slices (proposals, not executed tests)

1. **Level10 arrival cutscene:** Band_a=1, Start selects alternate mask,
   starts K_bandit, Block then Goto; natural completion Name invokes Ublock,
   waits K_band_talke, State0 and restores mask. Assert real navigation,
   no cancelled Program on blocked click, correct completion event and eventual
   interaction availability, not simply nonzero active-animation count.
2. **Level38 remote-state/animation chain:** differing local/remote states
   Lampochka/Lapm in44 affect Start mask; Pank0 uses Bandit2_Lora→Bandit
   completion and unblocks/StatePank1. Assert actual follow-up and mask-selected
   walking. Original declaration order matters when multiple Starts write mask.
3. **Level16 mask replacement:** actual two-Goto slice, plus read-only
   distinguishing point(581,554): regular mask q72 vs alternate q0, corrected
   target(580,555). Check visible movement/correction and restored-mask behavior.
4. **Level29 Fault Janitor:** inject rand15 values0/8191/8192/32767 to verify
   exact selected WAV, not generic source.start; positive-range Speak animation
   and Program wait follow. Wrong selected item must not trigger Fault.
5. **Map travel progression:** Level1 Init Setzon3 under bank0, Level3 Init
   Setmap1, later Setzon3 under bank1. Assert different enabled destination and
   actual scene/portal travel; bank/14 flags persist through transitions/save,
   new game clears. Merely checking a “zone” scalar misses the feature.
6. **Level22 lighting:** selected item7, Lamp.state0; mask selected before
   Goto/K_lamp1, background changes after animation, foreground Hides apply;
   re-entry State reselects background. Assert image and route, no world resize.
7. **Level4 camera:** Shift240 concurrent with Stat_J; visible10px/update
   override, edge±10 and Shift0 cancel. No invented wait for camera completion.
8. **Level28 ending and typo:** item53 Doscaa branch ignores Setbcr but performs
   later native commands; Door state3 plays Final.avi then Egame opens menu
   without Resume. Do not “fix” the ignored typo into background replacement.
9. **Persistence/clearing across all groups:** Program/animation completion
   does not clear Block, mask, callback or map flags. Entry reparses visit
   resources and clears Block/Shift even though Block is serialized; saved
   object state/map flags survive separately. No old Program/Voice callbacks
   revive after visit disposal.

## 6. Structures and lifetime summary

| Owner / field | Meaning | Lifetime / serialization |
|---|---|---|
| Scene+0x705 |raw nav/depth mask pointer|visit; cleared/reparsed, not serialized |
| Scene+0x72a |uint16 route-distance scratch|background-sized allocation, not changed by Setmsk |
| Scene+0x73b |blocked→Plane routing byte|through Program/animation; serialized but entry clears |
| Scene+0x709 |StartW busy|separate flag, not Block storage |
| Scene+0x75a |camera override target|cleared on arrival/entry, not serialized |
| Scene+0x766 |current horizontal scroll|camera state, not Shift argument delta |
| Scene+0x73c |background wrapper pointer|per visit, UI cached pointer+0x269 invalidated on Setbck |
| Scene+0x639/+0x63d |FaultList count/pointers|per visit, ordinary unload owns Voices |
| FaultList+0/+4/+0x2c |count/10 Voice pointers/name|0x12c bytes; not a reusable global dialogue queue |
| Anim+0x211 |completion event string|set while parsing, retained through Start/Stop, reconstructed on entry |
| Speak first Event+0x60e |borrowed Fault Voice|selection replaces pointer; FaultList owns release |
| Handler+0 |state-source scene|handler per visit; referenced world Object State may persist |
| UI+0x21 |map bank|global session, saved/restored |
|0x445724,14 ints|availability[2][7]|global session, saved/restored, reset new game |
|0x4456b4,14 pairs|map scene/portal destinations|static immutable table |
| UI+0xc |game/resume gate|global UI mode lifecycle; Egame clears; new game sets1 |

Newly joined mechanisms are map bank/unlock/destination tables, camera override
state, blocked→Plane/map routing and callback load-time binding. Fault/Scene/
Program layouts were already partly known; this report refines their ownership
and connections rather than pretending they were all newly discovered.

## 7. Evidence files and reproducibility

| File in evidence/missing-opcodes/ | Primary contents |
|---|---|
| live-pseudocode.json |mask/background helpers, click, Fault selector/synthetic setup, callback setter/update |
| dispatch-assembly.json |complete live parser/executor instruction listings |
| lifecycle-pseudocode.json |entry/unload/load/new-game, Fault lookup/Voice binding, camera |
| state-map-pseudocode.json |scene restore, map bank/unlock save-load/selection, constructor/UI tick |
| consumers-pseudocode.json |scene save, map hit test/menu, RNG, animation init/reset/tick |
| consumers-assembly.json |camera, entry, scene serializers, Fault random arithmetic, map gate, executor |
| map-bytes.json |224 bytes from0x4456b4, includes14 destination pairs and unlock array |
| fault-dispatch-pseudocode.json |remote-state selection, dispatch, Fault ctor, scanf wrapper |
| ui-pseudocode.json;menu-click.json |UI click/menu/resume/new-game relationships |
| cleanup-save-pseudocode.json;save-writer.json |Fault/Speak ownership cleanup and actual game save call chain |
| reused-primary-excerpts.json |selected earlier hash/Program/navigation/cleanup evidence, promoted into Git for a self-contained proof chain |
| source-facts.json |original source hashes/excerpts/occurrences, dispatch replay, TIFF facts |

Each REA record retains evidence_id, binary digest, Ghidra profile, operation,
normalization and limitations. Existing navigation/audio/object dossiers remain
the primary supporting evidence for previously recovered consumers; citations
in detailed contracts point to them. No BM-only evidence dependency.

Reproduce read-only resource and bounded original-instruction analysis:

```sh
python3 research/scc/probe_missing_opcodes.py --navigation --output /private/tmp/scc-missing-facts.json
python3 research/scc/scc_corpus_analysis.py /private/tmp/scc-corpus.json
```

Navigation option reuses the established instruction-derived navigation probe
and libtiff tiffcp. It does not call the TypeScript port or execute Agent.exe;
native x87 trig rounding boundary parity is not guaranteed. The script's hash
tree replay is intentionally bounded to scanner dispatch, not a new full EXE emulator.

## 8. Contradictions resolved / confirmed documentation updates

| Old claim | Better-confirmed evidence / resolution |
|---|---|
| Setzon fully supported as session integer | original opcode0x21→0x40d280 unlocks banked slot; PARTIAL/wrong abstraction |
| Block “all input off”, guessed id/refcount | byte+0x73b and Plane/map predicates; no args/counter, busy separate |
| Serialized Block means restored after load | scene read is followed by entry resetting flag |
| Fclick installed/executed as Start modifier | parser0x407754 updates animation before gameplay; affects all starts |
| second Fclick Level10:319 | exact original file is Level38:319 |
| Setbcr background restore | no recognized branch, both tokens ignored |
| remStartW unknown or StartW/comment facility | both tokens hash0; no command/comment rule |
| Setmsk must immediately correct hero/reinit nav | helper only changes pointer; consumers read on later use |
| Shift/Setmap/Egame unknown from names | located handler→camera/map/menu chains; no name-based inference |
| overlays unsupported, only2 scenes prepared, includes ignored | current source/status:47 scenes, null-layout overlays, recursive Inc |
| Sound/Fram audio all no-op; old WAV audit defects current | current WAV code and merged fix history supersede that implementation snapshot |
| map may enter26/48 via recovered selection path | fixed14-pair table excludes both; their entry mechanism remains UNKNOWN |

SCC_COVERAGE is a historical corpus audit; confirmed corrections are explicitly
appended there rather than silently rewriting its entire dated analysis.
SCENE_GRAPH's map-entry speculation is corrected in place with the table evidence.
SCC_VISIBILITY_INIT's old Setzon advice is explicitly superseded; its visibility
RE remains valid. BM index/status notes are updated with these distinctions.

## 9. Residual unknowns and limits

- Exact initial CRT RNG seed and all draw ordering; therefore exact native
  Fault sequence across sessions/save/load is UNKNOWN. Selection formula is not.
- Full error/modal behavior for missing resources, failed allocations, invalid
  bank/zone/scene/Case, missing/overlong tokens and overflow. Native paths are
  frequently unchecked. Safe browser validation is a policy, not native proof.
- Level17 missing Fault count: specific stale-count1 interpretation is DERIVED
  under normal scanf matching behavior, not a verified optional grammar or
  complete CRT replay. Other malformed Fram behavior remains existing audio
  research's boundary, not silently repaired here.
- Exact x87/trig/FPU numeric equivalence, wall-clock sampling and dynamic
  simultaneous event timing were not observed in Windows. Callback/order
  statements are static branch facts, not a running-game video trace.
- Whole inventory/menu input-mode machine, all cursor image/verb actions,
  unified sorted hit-test ties and native compositor parity remain separate
  incomplete features; map/scene-click block gates alone don't prove every UI gate.
- Error-scene+0x741 special lifetime and every alternate save/menu path are not
  fully reconstructed. No promise of restoring active Programs/Voices from save.
- Entry mechanism for26/48: neither SCC Level edges nor recovered map pairs
  establish it. Do not label them “map reachable” or “ending” from speculation.
- Native parser contains additional hashes/opcodes absent from shipped command
  inventory. This scope covers all **confirmed corpus gaps**, not every possible
  unexercised internal command branch.

## 10. Recommended implementation order

1. **Functional cutscene/navigation group:** remote Click selector + native
   StatrW alias + declaration-time Fclick + Block/Ublock + active Setmsk asset
   selection. Validate Level10/38 cutscene/unblock and Level16 navigation as
   complete scenarios. Shared prerequisites are event dispatch and visit-scoped
   state; no independent “block counter” shortcut. Mask alone affects20 scenes
   but without callbacks/remote gates can still leave progression stuck.
2. **Map travel group:** Setmap **and corrected Setzon**, 2×7 persistent table,
   actual locked-region selection and scene/portal dispatch, save/load/new-game.
   Unlocks repeatable travel from visited hubs rather than adding a fake zone int.
3. **Fault group:** hit/cancel/fallback routing, synthetic Program/Speak Event,
   deterministic selector seam and borrowed WAV ownership; cover40 scenes with
   correct resource choice and no wrong-item fallback. Depends on stable WAV
   runtime already present, not a repeat of codec implementation.
4. **Scene presentation group:** Setbck + Shift, lighting/camera story slices,
   foreground separation and entry-state reapplication; pair asset preparation
   with Setmsk infrastructure, but don't delay high-value cutscene work for it.
5. **Ending/media group:** real SclipW video barrier + Egame/menu/resume gate;
   Smusic music lifecycle separately via existing AUDIO_RUNTIME contract. Actual
   Final.avi→menu is the criterion, not counting Egame as “recognized”.

Setbcr/remStartW need **negative compatibility regressions**, not implementations.
Remaining Cursor/UI/compositor fidelity should be tackled by observable scenario,
not by inflating the number of supported opcode names.

## 11. Knowledge synchronization and review

Confirmed results were saved by logical block to Git evidence/contracts and
atomic BM notes, not held until the end. See
[SCC_MISSING_OPCODES_SYNC](SCC_MISSING_OPCODES_SYNC.md) for exact note inventory,
existing-note corrections, search verification and final document checks.
No merge, game execution or application implementation is part of this report.
