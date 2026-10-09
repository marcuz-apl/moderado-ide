# Findings: v0.1.30 release

- Shared source fix is committed at `37f494c`; Windows 0.1.29 test build passed.
- Release version is `v0.1.30+261009t`; release source commit is `5432a4a88027bb0d3185dc528a9de78a371e6629`.
- `.github/workflows/build-and-release.yml` publishes only for `platform=all` with an empty `source_ref`; platform-only runs are build-only.
- `scripts/publish-release.mjs` verifies all platform manifests and digests, applies the documented Windows/Linux/macOS names, and publishes a stable tag from the connected version in manifests.
- The publisher release notes now describe the webview fix, Gateway endpoint selection, provider refinements, About page, and all package targets.
- `.githooks/prepare-commit-msg` prefixes the commit subject before `.githooks/pre-commit` runs. Git passes no message path to `pre-commit`, but the hook only read `$1`, so release bump detection never saw the commit message. Read `COMMIT_EDITMSG` by default and use `detect_bump_type`, which strips the connected prefix, to ensure `release(patch):` advances the semantic patch.
- A root `CHANGELOG.md` was added and finalized with the v0.1.30 release entry.
- The owner removed the v0.1.29 GitHub Release; the source tag `v0.1.29+261009j` remains on origin. Do not delete the tag.
- The Linux sysroot setup uses GitHub's API to fetch pinned toolchain assets. The initial v0.1.30 workflow failed because its Linux build step omitted `GITHUB_TOKEN`; passing the workflow token fixed the fetch and the final Linux build completed.
- The final stable release has 19 uploaded assets and is available at https://github.com/marcuz-apl/moderado-ide/releases/tag/v0.1.30%2B261009t.
