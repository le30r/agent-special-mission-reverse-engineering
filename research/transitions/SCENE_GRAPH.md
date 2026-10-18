# Scene transition graph (SCC `Level` / `Goport` / `Portal`)

Date: 2026-10-18. Project: `agent-reverse` (Basic Memory).

This is the transition graph recovered **statically from the SCC corpus** only
(`agent-original/game-installed/Program_Executable_Files/Scripts/*.scc`).
No Windows process was run; the game is not claimed to have been played.

Legend:

- **Confirmed transition** — an SCC `Level <target> <portal>` command in a
  `Click` handler. The original dispatcher will switch scenes when the handler
  is selected and its `Goto`/`Goport` wait (if any) completes.
- **Conditional transition** — every `Level` is conditional: the event object
  must be visible/hit, the selected item must equal `Click.itemId`, the
  `Case N` branch must match `stateObject.state == N`, and a preceding
  `Goto`/`Goport` path must finish. Conditions are listed where known.
- **Possible (unconfirmed)** — an edge that only exists through a
  cross-scene `Lstate`/`State` precondition, or through the map-screen
  `0x40d2a4` / save-load `0x40c7c4` (NOT in SCC); these are marked explicitly
  and are **not** claimed as SCC-verified transitions.

Semantics of the three commands (CONFIRMED, from
[SCENE_TRANSITIONS](SCENE_TRANSITIONS.md)):

```text
Portal <stopDirection:int> <worldX:int> <worldY:int>   # entry table of THIS scene
Level  <targetScene:int>  <targetPortalIndex:int>      # switch scene; -1 = keep saved pos
Goport <sourcePortalIndex:int>                         # walk to Portal[i] of THIS scene
```

`Goport` walks to the **current** scene's portal; it does not select a target
scene by itself. `Level` with `portal == -1` does not update the target scene's
saved entry index (the target reuses its previously saved position/direction).

---

## 1. Full confirmed edge table

`src → target@portal`. Source = scene containing the `Level` command.

| Src | Edges (`→ target@portal`) |
|---|---|
| 1 | → 38@0 · 39@0 · 41@0 · 46@0 |
| 2 | → 3@0 · 18@0 · 37@0 |
| 3 | → 2@1 · 4@0 |
| 4 | → 2@1 · 3@1 |
| 5 | → 6@0 · 16@2 · 37@1 |
| 6 | → 5@1 · 7@0 |
| 7 | → 6@1 · 8@0 |
| 8 | → 7@1 · 34@0 |
| 10 | → 11@0 · 13@0 · 16@0 · 37@4 |
| 11 | → 10@1 · 12@0 |
| 12 | → 11@1 |
| 13 | → 10@2 · 14@0 |
| 14 | → 13@1 · 15@-1 · 15@0 |
| 15 | → 14@1 |
| 16 | → 5@2 · 10@3 · 17@0 · 17@1 |
| 17 | → 16@1 |
| 18 | → 2@1 · 19@0 · 20@0 |
| 19 | → 18@1 · 25@-1 · 27@0 |
| 20 | → 18@2 · 21@0 · 24@0 · 29@2 |
| 21 | → 20@2 · 22@0 · 23@-1 · 23@0 |
| 22 | → 21@1 |
| 23 | → 21@2 |
| 24 | → 20@2 |
| 25 | → 19@1 · 19@3 |
| 26 | → 19@3 |
| 27 | → 19@2 · 28@0 |
| 28 | → 27@1 |
| 29 | → 20@3 · 30@0 · 31@0 · 37@3 |
| 30 | → 29@1 |
| 31 | → 29@3 · 32@0 · 33@0 |
| 32 | → 31@1 |
| 33 | → 31@2 · 32@0 |
| 34 | → 8@2 · 35@1 |
| 35 | → 34@1 · 36@0 |
| 36 | → 35@2 |
| 37 | → 2@0 · 5@0 · 10@0 · 29@0 |
| 38 | → 1@0 · 3@-1 · 44@1 |
| 39 | → 1@1 · 40@0 · 47@2 |
| 40 | → 39@1 |
| 41 | → 1@4 · 42@0 · 43@0 · 47@0 |
| 42 | → 41@1 |
| 43 | → 41@2 |
| 44 | → 38@-1 · 45@0 |
| 45 | → 44@3 · 46@2 |
| 46 | → 1@3 · 45@3 |
| 47 | → 39@2 · 41@3 |
| 48 | → 34@-1 |

`-1` portal (keep saved position) is used in: 14→15, 19→25, 21→23, 38→3,
44→38, 48→34.

---

## 2. Portal tables (entry geometry per scene)

Each row is the `Portal` table of the target scene; `Level <s> <i>` enters
scene `s` at portal `i` (direction, x, y). `-1` = keep saved position.

| Scene | Portals `(dir, x, y)` |
|---|---|
| 1 | 0:(5,250,450) 1:(6,1400,280) 2:(6,110,330) 3:(4,1677,560) 4:(6,118,340) |
| 2 | 0:(5,910,425) 1:(7,135,440) |
| 3 | 0:(5,1100,560) 1:(0,130,565) |
| 4 | 0:(5,935,465) |
| 5 | 0:(4,1100,570) 1:(5,475,395) 2:(0,100,403) |
| 6 | 0:(0,50,425) 1:(5,986,408) |
| 7 | 0:(7,175,345) 1:(6,790,430) |
| 8 | 0:(5,26,560) 1:(0,450,560) 2:(6,465,360) |
| 10 | 0:(0,50,590) 1:(6,310,416) 2:(5,1065,450) 3:(4,1065,590) |
| 11 | 0:(4,785,585) 1:(0,506,530) |
| 12 | 0:(0,93,580) |
| 13 | 0:(0,50,425) 1:(6,445,478) |
| 14 | 0:(0,285,590) 1:(7,100,485) |
| 15 | 0:(7,330,430) |
| 16 | 0:(0,40,560) 1:(5,655,420) 2:(4,820,580) |
| 17 | 0:(0,15,390) 1:(0,45,385) |
| 18 | 0:(0,50,580) 1:(4,521,468) 2:(5,260,345) |
| 19 | 0:(6,20,550) 1:(5,1060,410) 2:(7,175,400) 3:(5,870,300) |
| 20 | 0:(0,845,570) 1:(6,524,440) 2:(6,450,510) 3:(0,50,560) |
| 21 | 0:(6,400,425) 1:(0,113,460) 2:(5,795,453) |
| 22 | 0:(5,825,515) |
| 23 | 0:(6,530,375) |
| 24 | 0:(0,50,425) |
| 25 | 0:(0,245,585) 1:(0,900,580) |
| 26 | 0:(0,750,580) 1:(0,230,230) |
| 27 | 0:(0,1411,580) 1:(0,100,280) |
| 28 | 0:(0,780,420) 1:(0,290,400) |
| 29 | 0:(3,225,580) 1:(6,624,259) 2:(4,775,460) 3:(6,195,255) |
| 30 | 0:(6,965,380) 1:(6,625,265) |
| 31 | 0:(3,749,585) 1:(6,540,360) 2:(6,280,380) |
| 32 | 0:(0,355,430) |
| 33 | 0:(0,20,465) 1:(2,585,580) 2:(4,760,490) |
| 34 | 0:(4,730,542) 1:(6,88,541) |
| 35 | 0:(0,480,454) 1:(0,775,450) 2:(0,474,460) |
| 36 | 0:(5,1099,238) 1:(0,20,465) |
| 37 | 0:(5,250,450) 1:(6,1400,280) 2:(6,110,330) 3:(4,1677,560) 4:(6,118,340) |
| 38 | 0:(5,910,425) 1:(7,135,440) |
| 39 | 0:(4,1100,570) 1:(5,475,395) 2:(0,100,403) |
| 40 | 0:(0,50,425) 1:(5,986,408) |
| 41 | 0:(0,50,590) 1:(6,310,416) 2:(5,1065,450) 3:(4,1065,590) |
| 42 | 0:(4,765,585) 1:(0,506,530) |
| 43 | 0:(0,50,425) 1:(0,445,478) |
| 44 | 0:(0,230,530) 1:(0,50,580) 2:(4,521,468) 3:(5,260,345) |
| 45 | 0:(0,845,570) 1:(6,524,440) 2:(6,450,510) 3:(0,50,560) |
| 46 | 0:(3,250,580) 1:(6,630,250) 2:(4,775,460) 3:(6,195,255) |
| 47 | 0:(0,40,560) 1:(5,655,420) 2:(4,820,580) |
| 48 | 0:(4,550,755) 1:(6,75,500) |

Note (DERIVED): the portal tables of 37–47 repeat the geometry of earlier
scenes (37↔1, 38↔2, 39↔5, 40↔6, 41↔10, 42≈11, 43≈13, 44≈18+1, 45↔20,
46↔29, 47↔16), while their Back/Mask are separate evening/night files. See
`SCC_COVERAGE.md` §1.3.

---

## 3. Graph structure

### 3.1 Reachability — DERIVED (BFS over confirmed `Level` edges)

- **45 of 47** scenes are reachable from Level1 by following `Level` edges.
- **Level26 and Level48 are NOT reachable** via any SCC `Level` (no incoming
  edge). They are entered through the map-screen (`0x40d2a4 → DAT_0046851c`)
  or save-load (`0x40c7c4`), i.e. **possible-but-unconfirmed by SCC**.
- The reverse is much smaller: only the revisit hub scenes can *reach* Level1
  back (`{38,39,40,41,42,43,44,45,46,47}`), consistent with the evening act
  funneling back to the starting courtyard.

### 3.2 Hub topology (day act)

The strongly connected "day" core is Levels **1–36** plus the revisit hub
**37**. Level37 is a second courtyard hub (same portal geometry as Level1)
that re-links the graph at 2/5/10/29, closing the loop.

```
           ┌────────── day act (1..36) ──────────┐
  L1 ──▶ {38,39,41,46}          L37 ◀── 2 / 5 / 10 / 29
                                    ▲
        L2→3,18,37   L5→6,16,37   L10→11,13,16,37
        L18→2,19,20  L20→18,21,24,29   L29→20,30,31,37
        … linear chains 11-12, 14-15, 16-17, 27-28,
          30-31-32-33, 34-35-36 …
```

### 3.3 Evening / revisit act (37–48)

The evening scenes form a second, shorter spine that returns to Level1:

```
  37 ─▶ 2 / 5 / 10 / 29            (hub, mirrors L1 geometry)
  38 ─▶ 1@0 · 3@-1 · 44@1
  39 ─▶ 1@1 · 40@0 · 47@2
  40 ─▶ 39@1
  41 ─▶ 1@4 · 42@0 · 43@0 · 47@0
  42 ─▶ 41@1      43 ─▶ 41@2
  44 ─▶ 38@-1 · 45@0
  45 ─▶ 44@3 · 46@2
  46 ─▶ 1@3 · 45@3
  47 ─▶ 39@2 · 41@3
  48 ─▶ 34@-1   (ending scene; entered via map/save, not SCC)
```

---

## 4. Key confirmed chains (the ones the audit was asked to verify)

### 4.1 Level1 → Level39 (confirmed, conditional)

`Click 0 Goto_5 Goto_5` (`Case 0` or `Case 1`) →
`Goto 1250 150; Level 39 0`.

Conditions: `Goto_5` visible (its `Active` was `Show`n by Init), selected item
0, `Goto_5.state ∈ {0,1}`, path to `(1250,150)` completes. Enters Level39 at
`Portal[0] = (4, 1100, 570)`.

### 4.2 Level1 → Level38 (confirmed, conditional — the hammock gate)

Two handlers:

1. Cut the hammock — `Click 1 Slip Flag1` (`Case 0`):
   `Goto 350 470; Stop Slip; StartW Razres; Setxy 345 470; Remtol 1;
   State Lec_v 1; Lstate Goto_1 1 38; Lstate To_38 1 44; Lstate Interface 1 44;
   Cursor Lec_v 2; Cursor Slip 5; State Slip 3; State Flag1 1`.

   Conditions: item **1** selected, `Flag1.state == 0`. This is the only thing
   that sets `Lec_v.state = 1`.

2. Exit to 38 — `Click 0 Lec_v Lec_v` (`Case 1`):
   `Goto 240 440; StartW Goto2; Level 38 0`.

   Conditions: `Lec_v.state == 1` (set by step 1). Enters Level38 at
   `Portal[0] = (5, 910, 425)`.

Both handlers use **only implemented commands**; the blocker for the port is
scene 38 not being in the manifest, not a missing opcode.

### 4.3 Level39 → Level40 (confirmed, conditional)

`Click 0 Goto_40 Goto_40` (`Case 0`) →
`Goto 460 405; Objzet Col_all 5; Objzet Col_vaz 6; StartW Verx;
Lstate Goto_5 1 6; Level 40 0; Objzet Col_all 1010; Objzet Col_vaz 1000`.

Conditions: `Goto_40.state == 0`. The trailing `Objzet` restores the column
depths *after* `Level` (because `Level` does not yield). Enters Level40 at
`Portal[0] = (0, 50, 425)`. `Lstate Goto_5 1 6` pre-arms the revisit of
scene 6 (Level40 is the evening revisit of Level6).

### 4.4 Level39 → Level47 (confirmed, conditional)

`Click 0 Goto_1 Interface` (`Case 0` or `Case 1`) →
`Goport 2; Level 47 2`.

Conditions: `Interface.state ∈ {0,1}`; `Goport 2` walks to Level39's own
`Portal[2] = (0, 100, 403)` first, then switches. Enters Level47 at
`Portal[2] = (4, 820, 580)`.

### 4.5 Level39 → Level1 (confirmed, conditional — the verified return)

`Click 0 Goto_11 Interface` (`Case 0` or `Case 1`) →
`Goport 0; Level 1 1`. Enters Level1 at `Portal[1] = (6, 1400, 280)`
(mask-corrected to `(1396,269)` in the port). Already exercised end-to-end by
the existing tests and browser E2E.

---

## 5. State and item gating summary

- **`State`/`Lstate` are the primary gates.** A `Level` edge lives inside a
  `Case N`; the branch is taken only when `stateObject.state == N`. The audit
  found 120 `Lstate` writes across 35 scenes, arming later scenes' state before
  the player arrives (see the full table in `SCC_COVERAGE.md` §2 / the analysis
  script).
- **Item gating** uses `Click <itemId> …`. 475 of 594 handlers take `itemId 0`
  (no item); 119 require an item, with `itemId 45` (26) and `itemId 46` (29)
  the most common (HYPOTHESIS: talk/look cursor verbs, not physical items).
- **Re-entry persistence** is already implemented: `State`, `Lstate`, inventory
  and `Active`/`Light` visibility survive transitions (verified `1→39→1`).

## 6. What is NOT a transition (avoid over-attributing)

- **`Goport <i>` alone is not a transition.** It only walks to the current
  scene's portal `i`; a following `Level` is what switches scenes. Do not
  report a `Goport` edge as a scene change.
- **`Portal` is a data table, not an edge.** It is never a "trigger area".
- **`Setmsk` is not a transition** — it swaps the navigation mask within the
  same scene (doors/paths), not the scene itself.
- **`Fault`/`Active`/`Light` are not transitions.**
- **Level26 / Level48 have no incoming SCC edge** — the graph does not claim
  they are entered from a scene; they are map-screen/save entries
  (possible-but-unconfirmed).

## 7. Reproduce

```sh
cd agent-original/game-installed/Program_Executable_Files/Scripts
# edge table + portal tables are derived by:
python3 ../../../../.dsh/worktrees/scc-audit/research/scc/scc_corpus_analysis.py /tmp/scc_audit.json
```

(The corpus analysis script is also checked in as
`research/scc/scc_corpus_analysis.py`; it reads the gitignored `agent-original`
directory and writes only to `/tmp`.)
