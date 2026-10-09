# Project Handoff

Updated: 2026-10-09
Branch: master
Release source commit: `5432a4a88027bb0d3185dc528a9de78a371e6629`
Status: v0.1.30 is published as the latest stable release. The owner withdrew the v0.1.29 GitHub Release; its source tag remains intact.

## Summary

The user tested the Windows v0.1.29 portable build from fix commit `37f494c` and confirmed the UI works. The fix removes TypeScript-only syntax from the plain JavaScript emitted into the shared Moderado webview. The owner manually deleted the v0.1.29 GitHub Release because that release was not runnable; its source tag remains on origin. Stable v0.1.30 is now published for Windows x64, Linux x64, macOS Apple Silicon arm64, and macOS Intel x64.

## Completed

- The shared fix was tested on Windows from the `moderado-ide-windows-x64` artifact of run `37971334294`.
- Canceled obsolete partial 0.1.29 macOS run `37980860696` and Linux run `37980869742` after the owner selected a new 0.1.30 release.
- Full release workflow publishes only after a successful all-platform default-source build; partial-platform builds remain build-only.
- Published stable release: [Moderado IDE v0.1.30](https://github.com/marcuz-apl/moderado-ide/releases/tag/v0.1.30%2B261009t), tag `v0.1.30+261009t`, source commit `5432a4a88027bb0d3185dc528a9de78a371e6629`.
- Release workflow run `37985155914` passed all four platform builds and the publisher. Linux sysroot fetching required passing `GITHUB_TOKEN` to the Linux build step; the release commit includes that fix.

## Release limits

- Windows installers are unsigned.
- Linux packages are unsigned; native Linux installation was not verified.
- macOS packages are ad-hoc signed, not Developer ID signed or notarized.
- There is no automatic update channel. No live provider request was used as release evidence.
- The owner removed v0.1.29 and asked for a new 0.1.30 release; do not recreate the 0.1.29 release or remove its source tag.

## Verification

- Windows fix build run `37971334294` completed successfully; user confirmed that app was responsive.
- `node --check scripts/publish-release.mjs`, hook syntax, connected patch-version prediction, and `git diff --check` passed for the preparation changes.
- Workflow run `37985155914` completed successfully; `gh release view` confirmed a non-draft stable release with 19 assets and platform-specific manifests.

## Next action

The next action is for the owner to test the v0.1.30 packages. The 0.1.29 GitHub Release is absent; keep its source tag and the v0.1.28 release intact.
