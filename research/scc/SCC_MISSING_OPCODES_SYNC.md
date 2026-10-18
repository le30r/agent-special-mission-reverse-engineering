# SCC missing-opcode research — synchronization and review ledger

Date2026-10-18; baseline local master e08f0f0. This is a completion ledger for
[SCC_MISSING_OPCODES](SCC_MISSING_OPCODES.md), not another semantic authority.

## Intermediate persistence

Results were recorded by logical blocks: initial live parser/executor evidence
and Block note; mask/input/camera contracts and Setmsk/Shift notes; Fault/events
contracts and their notes; map/misc contracts and seven notes; existing-index
corrections and readback/search verification. No application implementation or
merge was performed. The user's later instruction changed workspace selection
to the current checkout; a separate branch is still used for the final commit.

## Basic Memory scope and note inventory

Only existing project **agent-reverse**,
UUID `c2845f27-4e49-4c4f-9b1f-41e073f1acc1`, was modified. Initial BM inventory
preceded EXE analysis. Title search checked for atomic-note duplicates before
new notes were created; initial SCC index covered these topics collectively.

**13 new atomic mechanism/command notes** (Block/Ublock share one mechanism):

- SCC Block Ublock
- SCC Setmsk
- SCC Shift
- SCC Fault
- SCC Fclick
- SCC Click stateScene
- SCC Setmap
- SCC Setzon
- SCC Setbck
- SCC Setbcr
- SCC remStartW
- SCC StatrW
- SCC Egame

**8 pre-existing notes updated**, counted uniquely, not edit operations:

- SCC_COMMAND_INDEX: original dispatch mapping, recovered semantics, dispositions,
  actual implementation status, contract links and Fclick source correction.
- SCC_VISIBILITY_INIT: explicit correction of the wrongly identified Setzon
  opcode/field and withdrawn scalar/no-op recommendation.
- IMPLEMENTATION_STATUS: Setzon PARTIAL/wrong abstraction; old WAV findings
  marked pre-fix, not current verified bugs.
- WAV_RUNTIME_AUDIT: historical pre-fix status distinguished from e08f0f0;
  native audio evidence retained, link to Fault selector/borrowed Voice contract.
- ANIMATION_CONTRACTS: load-time Fclick property/lifetime, callback conditions,
  source-file correction; historical audio defect status clarified.
- AGENT-REVERSE PROJECT INDEX: links to all atomic notes/contracts and open questions.
- SCENE_STATE_CONTRACTS: map persistence, serialized-but-reset Block, visit
  resource lifetimes,26/48 map-entry speculation withdrawn.
- NAVIGATION_SCALE: Setmsk/Shift joined to existing mask/camera consumers.

Some newly created notes were refined again while reviewing addresses/lifetime;
these are still counted as13 created, not extra pre-existing-note updates.
All13 atomic notes were read back successfully through BM MCP after writing.
No failed write is being represented as a successful synchronization.

## Retrieval verification

Five searches executed through BM MCP, exact project UUID, after updates:

| User question/topic | Actual indexed text query | Retrieved relevant result |
|---|---|---|
| What does Setmsk do? | Setmsk | SCC Setmsk (first), SCC_COMMAND_INDEX |
| Where is Block handler? | Block | SCC Block Ublock (first), dispatch addresses in note |
| Which SCC commands remain unimplemented? | UNSUPPORTED | SCC_COMMAND_INDEX (first), command notes |
| How does Fault interact with WAV? | Fault AND Speak | SCC Fault (first), WAV_RUNTIME_AUDIT |
| What remains for complete progression? | UNKNOWN OR Setzon | project index (first), Setzon and open-question notes |

These are **normalized keyword/text searches**, not a claimed successful
natural-language semantic-vector search. Full returned titles/permalinks are
in `evidence/missing-opcodes/bm-search-verification.json`. Repeated search hits
for the same old UUID (e.g. WAV audit) are preexisting search/index behavior,
not new duplicate notes created by this work.

## Git/research verification

Performed read-only resource and evidence checks, not application tests:

- Baseline and initially clean checkout recorded; other worktrees/branches left alone.
- 58 identities checked: original EXE +57 SCC SHA-256s.
- All298 recorded target source occurrences/contexts matched exact original lines.
- All11 remote-scene Click lines rechecked.
- All39 unique referenced image names resolve, no duplicate path matches;
  original image hashes checked. All74 actual Setmsk/Setbck occurrences use
  resources matching initial background dimensions. Native mismatch validation
  is still absent; corpus compatibility does not prove a runtime guard.
- 13 distinct target-name dispatch paths replayed over the **whole bounded
  CMP/SUB/JG/JZ tree**. Includes both ignored tokens' operands and StartW alias.
- Eight command-handler entry pointers independently read from original jump
  table0x405ea1 and checked: mask7→0x406245, Block8→0x4063df,
  Ublock9→0x4063ee, Shift0xb→0x4063fd, Setbck0x1d→0x406269,
  Setmap0x20→0x40659b, Setzon0x21→0x4065a9, Egame0x22→0x4065be.
- All persisted REA records inspected for matching original EXE digest;
  address/field claims cross-checked against assembly where decompilation loses
  arguments/arithmetic (camera, parser operand buffers, random division, reset).
- Setmsk observable fixture independently replays native-algorithm routing over
  original TIFFs, not TypeScript runtime. No claim of running Windows original.
- Markdown links and document contradictions reviewed; detailed source examples
  corrected against originals rather than trusting prior audit names/line numbers.
- Historical SCC_COVERAGE marked superseded where current implementation differs;
  Setzon errors in SCC_VISIBILITY_INIT fixed; speculative26/48 map entry and old
  manifest blocker in SCENE_GRAPH corrected with explicit evidence.
- Runtime/source/resources untouched. Evidence JSON is deliberately included
  despite raw-evidence ignore rules: user explicitly requires substantive proof
  in Git, not solely ignored local files or Basic Memory.

Proposed unit/integration/browser regressions are specifications only. No new
application tests, stubs, resource modifications, Windows execution or merge.
Final Git scope/whitespace checks and branch commit are recorded by Git history;
this file intentionally does not embed its own future commit SHA.
