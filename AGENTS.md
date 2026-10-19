## Git Worktrees

- Create all Git worktrees under `<repository>/.worktrees/`.
- Never create worktrees in `/tmp`, `/private/tmp`, or `/var/folders`.
- Never automatically merge branches.
- Never delete a worktree before the user explicitly approves its removal.
- The user performs all merges manually.

## Chromium E2E
All temporary files, Chromium profiles and test artifacts must be cleaned up after execution. Browser processes must be terminated before removing their profiles. Cleanup must not interfere with concurrent tests. Persistent browser profiles are allowed only when explicitly required.
