# Task plan: official Moderado IDE v0.1.29 release

## Objective

Build and publish the official v0.1.29 release using the documented platform asset names, with complete README quickstart and macOS architecture guidance.

## Phases

1. Review release delta, repository state, and naming conventions — complete.
2. Update README macOS downloads and full quickstart — complete; changes pushed.
3. Remove the date prefix from the separate superpowers design and plan filenames — complete; pushed as `e69601d`.
4. Build and verify Windows x64, Linux x64, macOS arm64, and macOS x64 artifacts — in progress in Actions run 37961060432.
5. Download artifacts, verify manifests and hashes, and apply public release asset names — pending.
6. Tag the exact build commit and publish stable release notes/assets — pending.
7. Update release docs and handoff, verify clean pushed state — pending.

## Decisions

- Product release: `0.1.29`; build identifier used for this build: `v0.1.29+261009j` at commit `dad8515123e5d411a9805781661f50f5a99cd6ea`.
- Existing Actions workflow has publishing disabled; after verified builds, upload artifacts manually to the GitHub Release.
- Keep the existing unsigned Windows/Linux and ad-hoc-signed, non-notarized macOS caveats visible.
- Documentation commits after the build commit contain docs only; the release tag will target the build commit.
- The owner will test v0.1.29 before deciding whether to retire v0.1.28; preserve the older tag and release until requested otherwise.
