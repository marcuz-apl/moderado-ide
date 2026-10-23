# Project Handoff

Updated: 2026-10-23 10:08 UTC
Branch: `master`
Status: v0.1.44 release preparation is underway. v0.1.31 remains the latest published stable release. Release docs and the generated release-note template are prepared; no 0.1.44 build, tag, or publication has occurred.

## Current state

- The shared `~/.moderado/config.json` IDE-writer fix is committed and pushed.
  Concurrent IDE writers use owned locks, scoped conflict checks, and preserve
  unrelated provider entries. Other writers must adopt the lock protocol for
  cross-application write safety.
- The candidate changelog, product/install/roadmap/upstream status, and
  publisher-generated release notes now describe v0.1.44 and its known
  limitations. See `docs/planning/release-v0.1.44/readiness.md`.
- GitHub still reports v0.1.31 as latest stable. No v0.1.44 tag/release or
  build workflow is present. The all-platform workflow publishes when it
  succeeds, so dispatch requires explicit owner release authorization.
- The owner will run packaged-editor restart acceptance through GitHub Actions
  after release. MCP remains unimplemented and is disclosed in the candidate
  notes.

## Verification

- Extension focused suites: `npx vitest run test/profile.test.ts test/settings-host.test.ts` — 125 passed, 6 skipped.
- Extension suite excluding sandbox-blocked loopback Gateway login cases: `npx vitest run --exclude test/gateway-login.test.ts` — 25 files, 544 passed, 6 skipped.
- `npm run typecheck` — PASS.
- `npm run compile` — PASS, 616 KiB bundle.
- `git diff --check` — PASS after release-documentation edits.
- `node --check scripts/publish-release.mjs` — PASS after the release-note template update.
- An unfiltered local `npm test` could not open the loopback callback listener; 5 Gateway browser-login tests failed in this environment.

## Next action

Wait for explicit release authorization before dispatching the publishing
workflow. After an authorized all-platform run, verify the published
tag/assets and update the current release status. The owner will perform
packaged-editor restart checks through GitHub Actions after release.
