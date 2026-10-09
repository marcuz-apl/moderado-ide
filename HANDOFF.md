# Project Handoff

Updated: 2026-10-09
Branch: master
Commit: release preparation based on `37f494c`
Status: v0.1.28 is the latest published stable release after the owner withdrew v0.1.29. The full v0.1.30 release is being prepared.

## Summary

The user tested the Windows v0.1.29 portable build from fix commit `37f494c` and confirmed the UI works. The fix removes TypeScript-only syntax from the plain JavaScript emitted into the shared Moderado webview. The owner manually deleted the v0.1.29 GitHub Release because that release was not runnable; its source tag remains on origin. Current official release is therefore v0.1.28. The 0.1.30 release-preparation changes are in the working tree and must be committed before dispatching the full release workflow.

## Completed

- The shared fix was tested on Windows from the `moderado-ide-windows-x64` artifact of run `37971334294`.
- Canceled obsolete partial 0.1.29 macOS run `37980860696` and Linux run `37980869742` after the owner selected a new 0.1.30 release.
- Full release workflow publishes only after a successful all-platform default-source build; partial-platform builds remain build-only.

## Release limits

- Windows installers are unsigned.
- Linux packages are unsigned; native Linux installation was not verified.
- macOS packages are ad-hoc signed, not Developer ID signed or notarized.
- There is no automatic update channel. No live provider request was used as release evidence.
- The owner removed v0.1.29 and asked for a new 0.1.30 release; do not recreate the 0.1.29 release or remove its source tag.

## Verification

- Windows fix build run `37971334294` completed successfully; user confirmed that app was responsive.
- `node --check scripts/publish-release.mjs`, hook syntax, connected patch-version prediction, and `git diff --check` passed for the preparation changes.
- No 0.1.30 platform jobs have run yet.

## Next action

Commit and push the 0.1.30 release preparation, then dispatch the full `all` build. The publisher will create the stable release after all four platform jobs and release evidence checks succeed.
