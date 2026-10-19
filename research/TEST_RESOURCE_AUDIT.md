# Test resource lifecycle audit

## Findings and fixes

- `scripts/e2e-browser-all.mjs`: profile removal previously followed a five-second wait even if Chromium was still alive. SIGINT/SIGTERM bypassed cleanup; Vite and scenario children were signalled without awaiting exit. The runner now owns process groups and unique profiles, stops scenarios (and their CDP connections) before Chromium, awaits termination, escalates TERM to KILL, and only then deletes directories. If termination cannot be confirmed, resources are retained and cleanup fails.
- Default Vite/CDP ports were shared by every runner. Both now use OS-assigned ports; explicit `E2E_DEV_PORT`/`E2E_CDP_PORT` overrides remain available. Profiles are always unique.
- `e2e-browser-save-load-ui.mjs`: the `agent-save-json-*` directory leaked, and the real browser download destination was not set. Downloads now use a managed directory; download behaviour is reset, CDP is closed, and temporary files are removed.
- All browser E2E entrypoints now register sockets from construction, including connections created before scenario `try/finally`, and clean up on normal completion, exceptions, rejected promises, SIGINT and SIGTERM.
- Screenshot/catalog/fault evidence and WAV reports default to disposable per-run paths, not shared research folders or `/private/tmp/wav-runtime-e2e`. Explicit `E2E_OUTPUT_DIR`, `E2E_SCREENSHOT_DIR`, and `E2E_EVIDENCE_DIR` are caller-owned retained destinations. Deliberately sharing one explicit destination is the caller's responsibility.
- `research/audio/browser-wav-audit/probe.mjs`: replaced fixed `/private/tmp/wav-audit` writes with a managed output directory (or explicit retained output); registered CDP sockets. Level3 diagnostics use the same socket lifecycle through their common CDP module. Their explicit repository evidence files remain research deliverables, not disposable scratch files.
- `research/navigation/probe_navigation.py`: `TemporaryDirectory` already handled normal exceptions. Added SIGTERM unwinding, a bounded converter invocation, and project ownership metadata so crash leftovers can be identified safely.
- SCC Python probes no longer write implicitly to shared `/tmp` JSON files; their explicit output arguments retain reports. Scene-manifest unit fixtures already had `finally`; now they also use marked project-owned resources.
- `prepare-assets.mjs` and `convert-wav-for-browser.mjs` use synchronous conversion subprocesses with intentional generated outputs, not temporary browser resources. Game/runtime/render/save code was not changed.
- Local ignored `research/mult/rea_client.mjs` also launches a long-lived REA server; its local lifecycle was switched to the shared process manager. It is intentionally excluded by `.gitignore` and is not part of the tracked patch.

## Orphan recovery

`node scripts/cleanup-test-resources.mjs` is an **explicit** recovery command, not an automatic startup action. It only scans `agent-revers-tests-<checkout hash>` under `os.tmpdir()`, accepts marked project-owned directories, rejects symlinks, requires 24 hours of age and dead owner/child process groups, and checks the process command list for both lexical and canonical resource paths. Process-inspection failure aborts deletion. PID reuse conservatively retains directories.

No pre-existing temporary directories were deleted for this audit. Legacy unmarked Chromium profiles (including the reported 16 GiB) are deliberately excluded. User browser profiles and externally launched CDP browsers are never terminated or removed.

SIGKILL, power loss and OS crashes cannot run cleanup; use explicit orphan recovery later. POSIX process-group cleanup targets macOS/Linux; Windows only has direct-child termination. Detached descendants that deliberately escape their process group are outside the manager's termination guarantee. The project namespace directory itself is retained empty for future allocations.

## Verification

Lifecycle tests cover success, exception, SIGINT, SIGTERM, a child ignoring SIGTERM (KILL fallback), socket/process/directory ordering, idempotence, failed spawn without signalling an uninitialised process handle, concurrent scopes, and conservative orphan selection with a live process using a profile.

Results (2026-10-19):

- `pnpm test`: 23 files, 193 tests passed (8 resource-lifecycle tests).
- `pnpm build`: passed; existing bundle-size warning remains.
- `pnpm e2e:browser:all`: all 10 scenarios passed.
- `pnpm e2e:browser:save-load-ui`: passed concurrently with the full suite.
- Two concurrent `pnpm e2e:browser:hitbox` runs on the final runner: both passed, distinct OS-assigned Vite ports (50975 and 50977), independent profiles.
- After completion, the checkout's temporary-resource namespace was empty. Only fixtures created by this task were cleaned; legacy directories were not swept.
- Python source syntax and `git diff --check`: passed. Python research probes were not re-executed against the original corpus.
