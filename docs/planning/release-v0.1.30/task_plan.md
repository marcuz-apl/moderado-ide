# Release plan: Moderado IDE v0.1.30

Goal: publish one new stable 0.1.30 release containing the shared webview responsiveness fix for Windows, Linux, macOS Apple Silicon, and macOS Intel. The owner removed the 0.1.29 GitHub Release; its source tag remains on origin.

## Phases

1. Cancel obsolete platform-only 0.1.29 builds and verify the 0.1.30 release/tag does not already exist. Status: complete.
2. Prepare release metadata: patch-increment VERSION to 0.1.30, update release notes, keep current docs accurate while building, and check public asset naming. Status: complete.
3. Commit and push the exact release source. Status: in progress.
4. Run the complete all-platform release workflow and let its gated publisher publish 0.1.30. Status: pending.
5. Verify the release tag, target commit, assets, checksums, and stable status; finalize current-version docs and handoff. Status: pending.

## Decisions

- Target version: 0.1.30, per owner preference.
- The owner removed the v0.1.29 GitHub Release manually. Its source tag remains on origin; leave it as source history and publish 0.1.30 under a distinct tag.
- The in-progress Linux/macOS test runs were built from 0.1.29 and are not eligible for the 0.1.30 release. Cancel them and rebuild from the versioned 0.1.30 source.
- Publishing is authorized for the new 0.1.30 release after the full workflow succeeds.
