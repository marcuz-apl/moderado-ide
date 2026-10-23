# Project Handoff

Updated: 2026-10-23 11:56 UTC
Branch: `master`
Commit: release source `fe362d3421a22157f3b905c8d64c995dc0bae914`; release docs are current on `master`
Status: v0.1.44 published; post-release editor acceptance remains open

## Summary

GitHub Actions run 39943739959 successfully built and published stable release
`v0.1.44+2610236` for Windows x64, Linux x64, macOS arm64, and macOS x64.
GitHub reports 19 assets; the release tag resolves to source commit
`fe362d3421a22157f3b905c8d64c995dc0bae914`.

## Completed

- Verified the stable [GitHub release](https://github.com/marcuz-apl/moderado-ide/releases/tag/v0.1.44%2B2610236), its tag target, and asset inventory.
- Recorded the published state in `PRD.md`, `CHANGELOG.md`, `docs/INSTALL.md`, `docs/UPSTREAM.md`, `docs/ROADMAP.md`, and `docs/planning/release-v0.1.44/readiness.md`.

## In progress

- Real editor close/reopen acceptance for the packaged release has not been run. The owner plans to check the builds through GitHub Actions.

## Working tree

- The published release documentation is current on `master`; source artifacts remain tied to `fe362d3`.

## Checks

- `gh run view 39943739959 --repo marcuz-apl/moderado-ide --json status,conclusion,headSha,url` — PASS; conclusion `success`, source SHA matches `fe362d3`.
- `gh release view 'v0.1.44+2610236' --repo marcuz-apl/moderado-ide` — PASS; stable, published, not draft, 19 assets.
- `gh api repos/marcuz-apl/moderado-ide/commits/'v0.1.44+2610236' --jq .sha` — PASS; resolves to `fe362d3421a22157f3b905c8d64c995dc0bae914`.
- GitHub Actions — PASS; four platform builds, release artifact checks, and publisher completed successfully.
- Local tests after documentation updates — NOT RUN; documentation-only changes.

## Decisions and context

- IDE release `v0.1.44+2610236` is independent of the CLI release. Its pinned sources are recorded in `sources.lock.json`.
- Known limitations remain: unsigned Windows/Linux artifacts, ad-hoc signed and unnotarized macOS artifacts, no native Linux runtime verification, no update channel, and no MCP discovery/trust.
- Build completion is not evidence of real editor restart acceptance.

## Blockers

- None for publication. Real editor close/reopen acceptance is pending the owner's planned GitHub Actions check.

## Next action

1. Owner runs the packaged-editor close/reopen acceptance against the published release and records the run and result.

## Resume notes

- Release run: https://github.com/marcuz-apl/moderado-ide/actions/runs/39943739959
- Release assets: https://github.com/marcuz-apl/moderado-ide/releases/tag/v0.1.44%2B2610236
- Read `docs/planning/release-v0.1.44/readiness.md` for the current release record and limitations.
