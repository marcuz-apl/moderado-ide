# Progress: v0.1.30 release

- 2026-10-09: Owner selected 0.1.30 and said they can remove the 0.1.29 release. Confirmed current workflow runs are platform-only 0.1.29 builds and cannot be reused as 0.1.30.
- 2026-10-09: Owner manually removed the v0.1.29 GitHub Release. Verified it no longer appears in `gh release list`; its source tag remains on origin and will be left intact.
- 2026-10-09: Canceled Linux run `37980869742` and macOS run `37980860696`; both cancellation requests completed. Confirmed no existing 0.1.30 release or tag.
- 2026-10-09: Reviewed release versioning, publisher, asset naming, and release workflow. Updated the publisher's release notes, current-version documentation, and release changelog; fixed pre-commit to read Git's `COMMIT_EDITMSG` and use prefix-aware bump detection.
- 2026-10-09: Shell verification confirmed the release subject resolves to a patch bump and predicts `v0.1.30+261009s` from the current version. Syntax, publisher parse, and whitespace checks passed. The first PowerShell-to-Bash verification command interpolated `$()` before reaching Bash; reran it via a literal here-string, which produced the expected result.
- 2026-10-09: Read-only release review found and corrected pre-publication wording. Docs temporarily identified v0.1.28 as latest while the full 0.1.30 build was pending; current release status is now finalized below.
- 2026-10-09: Release source commit `5432a4a88027bb0d3185dc528a9de78a371e6629` sets `VERSION` to `v0.1.30+261009t` and passes `GITHUB_TOKEN` to the Linux sysroot download step.
- 2026-10-09: Initial full run `37983190355` exposed anonymous GitHub API 403 responses while downloading the Linux sysroot; Linux then failed linking. Canceled the obsolete run, added the workflow token to the Linux build environment, and started corrected run `37985155914`.
- 2026-10-09: Corrected run `37985155914` passed Linux x64, Windows x64, macOS Intel x64, and macOS arm64 builds. Gated publisher completed successfully.
- 2026-10-09: Published stable release `v0.1.30+261009t` with 19 assets. Verified non-draft/non-prerelease status, release tag points to `5432a4a88027bb0d3185dc528a9de78a371e6629`, and Windows, Linux, and both macOS architectures have named installers and manifests.
