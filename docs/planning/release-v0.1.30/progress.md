# Progress: v0.1.30 release

- 2026-10-09: Owner selected 0.1.30 and said they can remove the 0.1.29 release. Confirmed current workflow runs are platform-only 0.1.29 builds and cannot be reused as 0.1.30.
- 2026-10-09: Owner manually removed the v0.1.29 GitHub Release. Verified it no longer appears in `gh release list`; its source tag remains on origin and will be left intact.
- 2026-10-09: Canceled Linux run `37980869742` and macOS run `37980860696`; both cancellation requests completed. Confirmed no existing 0.1.30 release or tag.
- 2026-10-09: Reviewed release versioning, publisher, asset naming, and release workflow. Updated the publisher's release notes, current-version documentation, and release changelog; fixed pre-commit to read Git's `COMMIT_EDITMSG` and use prefix-aware bump detection.
- 2026-10-09: Shell verification confirmed the release subject resolves to a patch bump and predicts `v0.1.30+261009s` from the current version. Syntax, publisher parse, and whitespace checks passed. The first PowerShell-to-Bash verification command interpolated `$()` before reaching Bash; reran it via a literal here-string, which produced the expected result.
- 2026-10-09: Read-only release review found and corrected pre-publication wording that claimed v0.1.30 was already current. Transitional docs now identify v0.1.28 as the latest published release and label 0.1.30 as planned/unreleased.
