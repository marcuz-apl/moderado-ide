# Project Handoff

Updated: 2026-10-09 17:55 UTC
Branch: master
Commit: see `git log`
Status: v0.1.29 is the current stable release. The workflow now publishes only after a successful full default-source build; its changes are being committed and pushed.

## Summary

Moderado IDE v0.1.29 is published at [GitHub Releases](https://github.com/marcuz-apl/moderado-ide/releases/tag/v0.1.29%2B261009j). The release includes Windows x64, Linux x64, macOS arm64, and macOS x64 packages. Build run [37961060432](https://github.com/marcuz-apl/moderado-ide/actions/runs/37961060432) passed all four platform jobs from source commit `dad8515123e5d411a9805781661f50f5a99cd6ea` (`v0.1.29+261009j`).

## Completed

- Published stable release `v0.1.29+261009j` with 19 documented-name assets; tag target is `dad8515123e5d411a9805781661f50f5a99cd6ea`.
- Verified all platform build manifests and recorded artifact hashes in their manifests/checksum files. The publisher checked uploaded asset names, sizes, and GitHub SHA-256 digests where available.
- Updated README Mac download links for Apple Silicon and Intel, the quickstart, and release workflow instructions.
- Updated PRD, installation guide, upstream policy, and roadmap to identify v0.1.29 as current.
- Enabled full-build publishing in `.github/workflows/build-and-release.yml`; partial-platform and custom-source builds do not publish.
- Moved release audit notes into `docs/planning/release-audit/` with undated filenames.

## Release limits

- Windows installers are unsigned.
- Linux packages are unsigned; native Linux installation was not verified.
- macOS packages are ad-hoc signed, not Developer ID signed or notarized.
- There is no automatic update channel. No live provider request was used as release evidence.
- Keep v0.1.28 available until the owner tests v0.1.29 and explicitly requests any retirement.

## Verification

- All four build jobs in run `37961060432` completed successfully.
- The publisher's prepare-only pass matched all platform manifest hashes and produced 19 assets; the publishing pass verified the resulting stable release.
- `node --check scripts/publish-release.mjs` passed. The focused workflow tests were not run during this post-build change.

## Next action

Install and test the v0.1.29 Windows x64 installer or portable ZIP from the release page, then report any issues. The locally downloaded Windows artifact bundle is in `build/release-v0.1.29/windows/`.
