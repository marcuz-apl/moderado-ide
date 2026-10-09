# Release plan: Moderado IDE v0.1.30

Goal: publish one new stable 0.1.30 release containing the shared webview responsiveness fix for Windows, Linux, macOS Apple Silicon, and macOS Intel. The owner removed the 0.1.29 GitHub Release; its source tag remains on origin.

## Phases

1. Cancel obsolete platform-only 0.1.29 builds and verify the 0.1.30 release/tag does not already exist. Status: complete.
2. Prepare release metadata: patch-increment VERSION to 0.1.30, update release notes, keep current docs accurate while building, and check public asset naming. Status: complete.
3. Commit and push the exact release source. Status: complete; `5432a4a88027bb0d3185dc528a9de78a371e6629` (`v0.1.30+261009t`).
4. Run the complete all-platform release workflow and let its gated publisher publish 0.1.30. Status: complete; run `37985155914` succeeded.
5. Verify the release tag, target commit, assets, checksums, and stable status; finalize current-version docs and handoff. Status: complete; stable release has 19 assets at https://github.com/marcuz-apl/moderado-ide/releases/tag/v0.1.30%2B261009t.

## Decisions

- Target version: 0.1.30, per owner preference.
- The owner removed the v0.1.29 GitHub Release manually. Its source tag remains on origin; leave it as source history and publish 0.1.30 under a distinct tag.
- The earlier Linux/macOS test runs were built from 0.1.29 and were not eligible for the 0.1.30 release. They were canceled; the 0.1.30 release was built from its versioned source.
- Publishing is authorized for the new 0.1.30 release after the full workflow succeeds.
