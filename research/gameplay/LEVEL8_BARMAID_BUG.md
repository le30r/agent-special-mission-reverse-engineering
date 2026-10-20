# Level8 barmaid: same-name Active and Object identities

Level8 declares `Active Barm_click` (depth 50, hidden until the player climbs
upstairs) and `Object Barm_click` (depth 995). `Barmensha` is the separate quest
state selector. The visible barmaid raster is assigned to `Barm_click` by
`Barm_c` and `Barm_1`, not to `Barmensha`.

Previously, SceneLoader keyed both declarations only by name. Re-declaring the
Object retained the Active kind and discarded the drawable identity. MULT image
resolution then rejected the Active, leaving the barmaid invisible even though
the animation and image resource were present.

The browser now retains separate `(kind, name)` identities in declaration order.
Name-only SCC state and visibility lookups still select the first identity;
MULT image assignment selects the drawable Object. Sprite transforms, visibility
and image references never overwrite the same-name Active's hotspot fields.

The existing V1 save DTO already distinguishes kind/name pairs. Snapshot restore
now preserves both entries, and older Level8 saves containing only the Active
receive the missing Object on declaration. No schema or contentId change is
required. Internal map keys are not serialized as object names.

`tests/level8-barmaid.test.ts` covers the actual Level8 declarations and MULT:
initial visible raster, hidden hotspot, Show/Hide separation, independent depth,
re-entry, legacy snapshots, and codec/transactional session restore. Canvas
texture creation is replaced in these tests; they are runtime regressions, not
browser screenshot evidence.
