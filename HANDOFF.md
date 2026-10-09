# Project Handoff

Updated: 2026-10-09 16:38 UTC
Branch: master
Commit: 1fd82a5
Status: v0.1.28 is the official release. Maintained docs now reflect published assets, naming conventions, and remaining verification limits.

## Summary

Moderado IDE v0.1.28 is published as an official release. Windows, Linux x64, Apple Silicon, and Intel macOS assets are attached. The latest Settings changes add the Gateway Dev/Prod endpoint selector and the requested provider/About refinements. The current development `VERSION` is `v0.1.29+261009h`.

## Completed

- Renamed the three Windows release assets to use `0.1.28`; verified their published SHA-256 digests match the original binaries exactly. No Windows rebuild was used.
- Published the Linux x64 DEB/RPM packages and the Intel macOS x64 DMG/ZIP. Intel workflow run [37950430528](https://github.com/marcuz-apl/moderado-ide/actions/runs/37950430528) completed successfully from source commit `96ab8562ec80472d71d656ffac88ba7c33671127`.
- Updated the v0.1.28 release notes with all platform sections, current Windows filenames, artifact checksums, and platform signing/runtime limits.
- Documented release asset and manifest naming conventions in `docs/INSTALL.md`; clarified in README, PRD, UPSTREAM, PROFILE, and ROADMAP that v0.1.28 is released while several readiness gates remain open.
- Committed and pushed the release naming documentation as `1fd82a5` (`docs: document release asset naming`); the version hook advanced the development identifier.
- Added a Gateway-only Dev/Prod selector. It updates the existing Base URL field; the URL remains the persisted setting and drives model discovery.
- Removed the `Free Models` provider-name suffix, improved OrcaRouter free-suffix classification, and restyled the About page with inline metadata, an intro, and copyright.

## In progress

- Documentation updates from the release audit are complete but remain uncommitted; the requested prior changes were already pushed as `1fd82a5`.

## Working tree

- Documentation edits from the release audit are in progress. Temporary audit notes under `.planning/` are untracked and will be removed when the audit is complete.

## Checks

- `npm run typecheck --prefix extensions/moderado-agent` — PASS.
- `git diff --check` — PASS.
- Tests — NOT RUN in this change.
- Intel macOS workflow — PASS; artifact SHA-256 values match its manifest and checksum file.

## Decisions and context

- Gateway environment is inferred from the selected URL; no new profile schema field was introduced. Unknown/custom URLs leave both environment buttons unselected.
- The Windows files were renamed only. Their bytes and hashes are unchanged.
- Linux runtime installation was not verified on a native Linux distribution. macOS artifacts are ad-hoc signed and not notarized.

## Blockers

- None.

## Next action

1. Confirm release is stable, stale documentation claims are removed, and `git diff --check` passes.

## Resume notes

- Release: https://github.com/marcuz-apl/moderado-ide/releases/tag/v0.1.28%2B261009d
- Linux DEB metadata was inspected under WSL; Linux packages are also described in the release notes.
