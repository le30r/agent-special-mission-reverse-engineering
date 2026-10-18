# Inventory combination — curated REA/Ghidra evidence

Target: `agent-original/game-installed/Program_Executable_Files/Agent.exe`
SHA-256: `71065c571a9cd40f460458d766720c0a01954e0bef521aad675b4ea6b3186e85`
Provider: Ghidra 12.1.4, analysis-profile digest
`4f6212bfe31448a7b96743a449e91c35890105cedd34e1d9951e9467d284e0a5`.
Addresses are VA with image base `0x00400000`. Static-only: the original Windows
process was never run; every "CONFIRMED" below is a direct observation of the
machine code / original resources, not a dynamic trace.

## Inventory structure (global `DAT_00468518`, allocated 0x4b8 bytes in 0x40c5a4)

| offset | meaning |
|---|---|
| `+0x000` | scratch accumulator used by the slot scan |
| `+0x004 … +0x190` | 100 item slots, `int` each; empty sentinel `-1` (`0xffffffff`) |
| `+0x194` | combination-entry count |
| `+0x198 …` | combination entries, `{int key; int value}` pairs (8 bytes each) |

`FUN_0040ebec` initialises the 100 slots to `0xffffffff`; `FUN_0040ec2c`
(Addtol) writes an id into the first slot `< 0`; `FUN_0040ec50` (Remtol) sets
every slot equal to the id to `-1`.

## Item on item — the native dispatch (`0x40cb84`, mode 2)

`FUN_0040cb84(ui, mode, x, y)` is the pointer-down UI-mode switch
(`ui` base holds the mode at `+4`, the pending selection at `+0x11`).
`param_1[1]` (`ui+4`) selects the mode; `case 2` is the inventory panel:

```c
case 2:
  iVar1 = FUN_0040ed08(DAT_00468518, param_3, param_4);   // slot hit-test -> item id
  if (0 < iVar1) {
    if (*(int *)((int)param_1 + 0x11) < 1) {               // no pending selection
      *(int *)((int)param_1 + 0x11) = iVar1;               // SELECT (panel stays open)
    } else {                                               // item already selected
      iVar2 = FUN_0040ec74((int)DAT_00468518, iVar1, *(int *)((int)param_1 + 0x11));
      if (0 < iVar2) {                                     // recipe hit
        FUN_0040ec50(DAT_00468518, iVar1);                 // Remtol clicked
        FUN_0040ec50(DAT_00468518, *(int *)((int)param_1 + 0x11)); // Remtol selected
        FUN_0040ec2c(DAT_00468518, iVar2);                 // Addtol result
        *(undefined4 *)((int)param_1 + 0x11) = 0;          // clear pending selection
      }
    }
  }
  break;
```

Key observations:
- First click **selects** (`ui+0x11 = id`) and the panel **stays open**.
- Second click calls `FUN_0040ec74(inventory, clicked, selected)`; only on a
  positive result are both ingredients removed, the result added, and the
  pending selection cleared. On a miss the selection is left untouched.
- This is a **native** mechanism; no SCC handler participates.

## Combination lookup (`0x40ec74`) and recipe table

```c
undefined4 FUN_0040ec74(int inv, int a, int b) {
  int i = 0;
  int *p = (int *)(inv + 0x198);
  for (; i < *(int *)(inv + 0x194) && (a * 1000 + b != *p); p += 2) i++;
  if (i < *(int *)(inv + 0x194)) return *(undefined4 *)(inv + 0x19c + i * 8);
  return 0;
}
```

Assembly confirms the key arithmetic `key = a*1000 + b` (0x40ec8d–0x40ec9b) and
the `{key, value}` interleave: key at `inv+0x198+i*8`, value at `inv+0x19c+i*8`.

`FUN_0040eccc(inv, a, b, result)` appends one entry and encodes `a*1000+b`:

```c
int i = *(int *)(inv + 0x194);
*(int *)(inv + 0x194) = i + 1;
*(int *)(inv + i * 8 + 0x198) = a * 1000 + b;
*(undefined4 *)(inv + i * 8 + 0x19c) = result;
```

## Hard-coded recipe table (`FUN_0040eacc`, inventory constructor)

The constructor is called from `FUN_0040c5a4` at engine init and registers the
table directly — it is **not** loaded from any resource file:

```c
param_1[0x65] = 0;                            // count = 0
FUN_0040eccc(param_1, 5, 2, 0x27);            // 5 + 2  -> 39
FUN_0040eccc(param_1, 2, 5, 0x27);            // 2 + 5  -> 39
FUN_0040eccc(param_1, 9, 10, 0x28);           // 9 + 10 -> 40
FUN_0040eccc(param_1, 10, 9, 0x28);           // 10 + 9 -> 40
FUN_0040eccc(param_1, 0x22, 0x21, 0x31);      // 34 + 33 -> 49
FUN_0040eccc(param_1, 0x21, 0x22, 0x31);      // 33 + 34 -> 49
FUN_0040eccc(param_1, 0x31, 0x1f, 0x32);      // 49 + 31 -> 50
FUN_0040eccc(param_1, 0x1f, 0x31, 0x32);      // 31 + 49 -> 50
FUN_0040eccc(param_1, 0x31, 0x20, 0x33);      // 49 + 32 -> 51
FUN_0040eccc(param_1, 0x20, 0x31, 0x33);      // 32 + 49 -> 51
FUN_0040eccc(param_1, 0x2d, 0x2a, 0x2e);      // 45 + 42 -> 46
FUN_0040eccc(param_1, 0x2a, 0x2d, 0x2e);      // 42 + 45 -> 46
FUN_0040ebec(param_1);                         // slots = -1
```

Every pair is registered in both orders, so the recipes are commutative.

## Inventory open/close and the selected item (`scene+5`)

`FUN_0040e9f0(ui)` toggles the panel. Called from `0x40c974` (UI tick) and
`0x40f204` (WM_LBUTTONDOWN). Relevant branches:

```c
if (iVar1 == 2) {                               // closing the panel (mode 2)
  if (0 < *(int *)(param_1 + 0x11))             // pending selection present
    FUN_0040a194(DAT_004686b0, *(int *)(param_1 + 0x11)); // commit -> scene+5
  *(undefined4 *)(param_1 + 4) = 0;             // mode = 0
}
else if (*(char *)(DAT_004686b0 + 0x740) != '\0') {   // opening (mode 0, available)
  if (*(int *)(DAT_004686b0 + 5) == 0) {       // scene+5 == 0
    *(undefined4 *)(param_1 + 0x11) = 0;        // clear pending
    *(undefined4 *)(param_1 + 4) = 2;           // open panel
  } else {
    FUN_0040a194(DAT_004686b0, 0);              // scene+5 != 0 -> cancel selection
  }
}
```

`FUN_0040a194(scene, id)` writes `scene+5 = id` (the item for the next scene
click), guarded by `FUN_0040a1f0` which only blocks the write when some handler
accepting this id already has an **active** Program:

```c
bool FUN_0040a194(int scene, int id) {
  bool running = FUN_0040a1f0(scene, id);
  if (!running) *(int *)(scene + 5) = id;
  return !running;
}
```

`FUN_0040a1f0(scene, id)` iterates handlers (`scene+0x571`), returns true if
`handler.itemId == id` (`handler+0x2d0`) and any of its 50 Program slots
(`handler+0x208`) is non-null with `active != 0` (`program+0x29e4`).

## Slot hit-test (`0x40ed08`) and draw (`0x40ed88`)

`FUN_0040ed08(inv, x, y)` only answers inside `x ∈ (487, 727)`, `y ∈ (18, 518)`;
it counts non-empty slots and returns the id whose ordinal equals
`((y-18)/100)*4 + (x-487)/60 + 1`. Otherwise `-1`. `FUN_0040ed88` draws the
non-empty slots from `XSH\Interface\large.mult` using the id as the frame number
(hence item id == large.MULT frame id, as the browser already assumes).

## SCC corpus anchors for knife + crowbar + door

- `Level38.scc:24` `Object Nozhik 6 500`; `Level38.scc:468-477`
  `Click 0 Nozhik Pank` Case 2 → `Addtol 5`, `State Nozhik 1`. Item **5 = нож**.
- `Level1.scc:306-316` `Click 0 Car_click Interface` → `StartW Mant`,
  `Addtol 2`. Item **2 = монтировка** (the `Mant`/`K_mont` prying animation
  naming is the supporting evidence; the recipe 5+2→39 confirms the pair).
- `Level38.scc:525-540` `Click 39 Door Lamp_t` Case 1 → `StartW K_mont`,
  `Remtol 39`, `Addtol 5`, then `Goport 1`/`Level 3 -1`. Item **39** is the
  combined tool applied to Lora's door.
- `Level38.scc:542-547` `Click 0 Goto_44 Goto_44` Case 40 → `Addtol 39`
  (story path that grants the combined tool; not the combination itself).

## Evidence status

| fact | status |
|---|---|
| mode-2 select-then-combine dispatch | CONFIRMED (0x40cb84) |
| `key = a*1000 + b` recipe encoding | CONFIRMED (0x40ec74 / 0x40eccc) |
| hard-coded 12-entry recipe table | CONFIRMED (0x40eacc) |
| Addtol first-empty-slot / Remtol clear-all | CONFIRMED (0x40ec2c / 0x40ec50) |
| pending selection `ui+0x11` vs `scene+5` | CONFIRMED (0x40cb84 / 0x40e9f0 / 0x40a194) |
| knife=5, result=39, door handler | CONFIRMED (SCC + recipes) |
| crowbar=2 | DERIVED (Level1 Mant + recipe 5+2→39 + K_mont) |
| exact UI affordances (tab/close hit boxes, cursor) | UNKNOWN (not traced) |
