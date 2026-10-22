# Original action cursors

Verified 2026-10-22 by static inspection of shipped SCC/resources and Ghidra
decompilation of Agent.exe; no original Windows process was executed.

Agent.exe SHA-256:
`71065c571a9cd40f460458d766720c0a01954e0bef521aad675b4ea6b3186e85`.

## ID table

The eight pointers at `0x444a48` map object `+0x152` directly to these names:

| ID | Animation | Resource | Meaning |
| --- | --- | --- | --- |
| 0 | Arrow | arrown.mult | Default pointer |
| 1 | Arrow0 | arrow0n.mult | Directional pointer |
| 2 | Arrow1 | arrow1n.mult | Directional pointer |
| 3 | Arrow2 | arrow2n.mult | Directional pointer |
| 4 | Arrow3 | arrow3n.mult | Directional pointer |
| 5 | Eye | lookn.mult | Look |
| 6 | Hand | taken.mult | Take/interact |
| 7 | Lips | talk.mult | Talk |

Resources are in `agent-original/game-resources/block0/XSH/Interface`.
`Scripts/Cursor.scc` declares all eight as `Animc 20 … Casm …` and declares
`Object Interface 0 0`. Exact directions for Arrow0–3 are not established here.

## Native hover selection

`0x409f04` positions Interface at the pointer, accounting for scene scroll.
It walks the sorted object registry backwards, invokes each virtual hit-test,
and rejects zero absolute depth. With no selected inventory item (`scene+5=0`),
the frontmost hit object's `+0x152` selects the table entry; no hit selects ID 0.
When that ID differs from `scene+0x70a`, it stops the previous animation via
`0x404fb4(old,0)`, starts the new one via `0x404fb4(new,1)`, and stores the ID.
There is no Click-handler/Case check in this cursor-selection branch.

With a selected item, this function instead assigns `XSH\\Interface\\small.mult`
frame `scene+5`, record 0 to Interface via `0x404928`. This is an item-icon cursor,
not an additional ID in the eight-entry table. Full blocked-input and inventory
overlay behavior are not established by this function alone.

## Browser implementation

`SceneView.setObjectCursor()` stores SCC Cursor changes; declarations and saved
state also retain cursorId. Ordinary scene cursor rendering is implemented in
`src/scene/cursor-view.ts`: the existing unified hit picker selects the
frontmost target, and its original MULT animation is drawn in the top Pixi
overlay. Selected items use their matching frame in `small.MULT`. The map keeps
its separate `arrown` cursor. The cursor sprite is centered on the pointer,
matching the native Interface Object's center anchor. `pnpm build` passed after the implementation;
browser gameplay behavior has not been E2E-tested.
