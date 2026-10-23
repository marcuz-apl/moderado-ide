# Project Handoff

Updated: 2026-10-23 09:52 UTC
Branch: `master` (Git metadata is read-only here)
Base commit: `7673251` (`v0.1.44+2610233 feat: integrate bounded skills and profile checks`)
Status: the IDE-side shared `~/.moderado/config.json` write-coordination fix is implemented and verified in the working tree; changes are uncommitted. IDE writers coordinate. Other applications must use the same lock protocol for a cross-application guarantee.

## Current state

- Config locks record owner PID and a unique token. Age alone never evicts a
  lock; recovery requires a dead owner plus an exclusive recovery claim. Bad or
  unverifiable lock metadata fails closed and gives manual recovery guidance.
- Config read errors other than `ENOENT` and corrupt JSON fail closed without
  overwriting the profile. Unknown config fields continue to be preserved.
- Conflict checks compare only fields an operation owns. Settings saves,
  connection selection/removal, and model selection provide expected values;
  removing a connection patches only its ID so sibling updates survive.
- Isolated tests cover concurrent child-process writes, stale/live/dead and
  malformed locks, unreadable/corrupt config, and settings write scopes. No test
  writes the real user's profile.
- Design and task plan: `docs/superpowers/specs/2026-10-23-ide-config-coordination.md`
  and `docs/superpowers/plans/2026-10-23-ide-config-coordination.md`.
- `PRD.md`, `docs/PROFILE.md`, and `docs/INSTALL.md` now state the IDE writer
  guarantee and its boundary. The sibling CLI was not modified.
- Packaged editor close/reopen acceptance will be run by the owner through
  GitHub Actions after release; it has not been performed locally. MCP remains
  deferred unless the owner reopens that scope.

## Verification

- `npx vitest run test/profile.test.ts test/settings-host.test.ts` — PASS,
  125 passed, 6 skipped.
- `npx vitest run --exclude test/gateway-login.test.ts` — PASS, 25 files,
  544 passed, 6 skipped. The excluded Gateway tests require a loopback listener;
  an unfiltered run in this sandbox failed 5 listener-dependent cases.
- `npm run typecheck` — PASS.
- `npm run compile` — PASS, 616 KiB bundle.
- `git diff --check` — PASS.

## Next action

Review the uncommitted IDE patch. The only remaining validation for this task is
cross-application safety if other config writers are later brought into the
same lock protocol; the owner will perform packaged editor restart acceptance
through GitHub Actions after release.
