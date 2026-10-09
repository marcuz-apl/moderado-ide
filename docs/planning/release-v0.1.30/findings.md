# Findings: v0.1.30 release

- Shared source fix is committed at `37f494c`; Windows 0.1.29 test build passed.
- `VERSION` currently reads `v0.1.29+261009r`; `release(patch):` triggers the repository hook to advance the semantic patch to 0.1.30.
- `.github/workflows/build-and-release.yml` publishes only for `platform=all` with an empty `source_ref`; platform-only runs are build-only.
- `scripts/publish-release.mjs` verifies all platform manifests and digests, applies the documented Windows/Linux/macOS names, and publishes a stable tag from the connected version in manifests.
- The publisher release notes now describe the webview fix, Gateway endpoint selection, provider refinements, About page, and all package targets.
- `.githooks/prepare-commit-msg` prefixes the commit subject before `.githooks/pre-commit` runs. Git passes no message path to `pre-commit`, but the hook only read `$1`, so release bump detection never saw the commit message. Read `COMMIT_EDITMSG` by default and use `detect_bump_type`, which strips the connected prefix, to ensure `release(patch):` advances the semantic patch.
- At the start of this release preparation there was no root `CHANGELOG.md`; an unreleased v0.1.30 entry has since been added.
- The owner removed the v0.1.29 GitHub Release; the source tag `v0.1.29+261009j` remains on origin. Do not delete the tag.
