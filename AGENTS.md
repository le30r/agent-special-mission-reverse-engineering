Basic Memory project: agent-reverse

## Git Worktrees

- Create all Git worktrees under `<repository>/.worktrees/`.
- Never create worktrees in `/tmp`, `/private/tmp`, or `/var/folders`.
- Never automatically merge branches.
- Never delete a worktree before the user explicitly approves its removal.
- The user performs all merges manually.

## Chromium E2E
All temporary files, Chromium profiles and test artifacts must be cleaned up after execution. Browser processes must be terminated before removing their profiles. Cleanup must not interfere with concurrent tests. Persistent browser profiles are allowed only when explicitly required.

## Test resource lifecycle

- Use `scripts/lib/e2e-resources.mjs` in Node E2E/research entrypoints; use `TestResources` directly in unit fixtures. Allocate unique directories with `resources.tempDir()` and launch owned children with `resources.spawn()`.
- Never use fixed/shared Chromium profiles, download directories, or temporary output paths. Default outputs are disposable. Retain evidence only at explicitly requested `E2E_OUTPUT_DIR`, `E2E_SCREENSHOT_DIR`, or `E2E_EVIDENCE_DIR` destinations; these are caller-owned and must not be deleted.
- Close CDP sockets first, stop scenario children before Chromium, terminate owned process groups, await actual exit, escalate SIGTERM to SIGKILL after a bounded timeout, then remove owned directories. If exit cannot be confirmed, retain directories and report failure.
- Cleanup must be idempotent and handle success, errors, SIGINT and SIGTERM. SIGKILL/crashes cannot run cleanup. Do not kill external CDP browsers or touch user Chrome profiles.
- `node scripts/cleanup-test-resources.mjs` is an explicit opt-in orphan sweep, never an E2E startup hook. It only considers marked resources in this checkout's namespace, at least 24 hours old, with dead owner/child process groups and no process command referencing the profile. Unknown/legacy directories and symlinks are retained. Never sweep arbitrary `/tmp`, `/private/tmp`, or `$TMPDIR` paths.
- Do not run the orphan sweep or delete pre-existing research artifacts without explicit user authorization. Test cleanup must affect only directories/processes allocated by that test run.
