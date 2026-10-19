# Level3 observational diagnostics

Run from the research worktree, with `node_modules`, original assets and prepared
`public/` available. These scripts use real Chromium CDP input, original SCC/MULT,
and optional in-memory method wrappers for logging. They never edit runtime files
or assign object State/inventory. Start a separate Vite and clean-profile Chromium:

```sh
pnpm exec vite --host 127.0.0.1 --port 5183 --strictPort
# Chromium: --headless=new --autoplay-policy=no-user-gesture-required
# --remote-debugging-port=9383 --user-data-dir=<new empty temporary profile>
node research/gameplay/diagnostics/level3/busy-trace.mjs
node research/gameplay/diagnostics/level3/history.mjs 'http://127.0.0.1:5183/?debug=scenes' 141bfed
node research/gameplay/diagnostics/level3/interruption-save.mjs /path/to/agent-save-level3-2026-10-19.json
node research/gameplay/diagnostics/level3/natural.mjs
node research/gameplay/diagnostics/level3/audit.mjs
node research/gameplay/diagnostics/level3/mult.mjs
```

`E2E_CDP` overrides the CDP endpoint, `E2E_URL` overrides the normal current-revision
boot URL. `history.mjs` takes URL and revision label as positional arguments. It
instruments `SceneView.prototype.dispatchStart` to expose a read-only view on
older revisions without `__sccDebug`; no old source file changes are needed.
`natural.mjs` uses debug ONLY to choose predecessor Level4, then actual `To3`,
`Lec_v` and canvas clicks for transitions/pickups. It is not a full plot walkthrough
from New Game. Diagnostics write to `research/gameplay/evidence/level3-regression/`.

Run one browser script at a time. Reload resets all observation wrappers; no
localStorage slots are used. `user-save.json` is the exact supplied envelope.
`history-*` compare identical direct-entry, click timing and logical coordinates;
`natural-*` separately exercise a genuine SCC portal path. Audit candidates are
conditional static matches, not confirmed failures or exhaustive reachability.
