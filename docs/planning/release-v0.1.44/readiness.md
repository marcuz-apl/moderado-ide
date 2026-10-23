# v0.1.44 release readiness

**State:** preparation only. v0.1.31 remains the latest published stable release.
GitHub has no v0.1.44 tag or release, and no build workflow has run for this
candidate. Do not describe 0.1.44 as released or available to install until
the publishing workflow verifies and publishes its artifacts.

## Included since v0.1.31

- Session history improvements: rename/delete, prompt history, search, Markdown
  export, branching, and long-chat context compaction.
- Safer approval previews and fail-closed completion/cancellation behavior.
- Bounded, validated skills exposed through a read-only loader.
- Provider setup/model discovery updates, Markdown assistant replies, and
  clearer usage/workspace display.
- IDE-side shared `config.json` coordination with owned-field conflicts and
  ownership-safe lock recovery.

See `CHANGELOG.md` for the prepared release notes and `HANDOFF.md` for local
verification results.

## Before publishing

- [x] Push the release source candidate to `master`.
- [x] Update `CHANGELOG.md`, current release status, installation limitations,
  and the generated release-note template.
- [x] Review and push the final release-documentation commit; its final
  connected `VERSION` build identifier is used as the release tag suffix.
- [ ] Owner authorizes dispatch of `.github/workflows/build-and-release.yml`
  with `platform=all` and empty `source_ref`. This combination publishes; do
  not start it as a documentation or smoke build.
- [ ] Confirm all four platform builds and artifact checks pass, then verify the
  release tag, target commit, manifests, checksums, asset names, and GitHub
  release status against the build run.
- [ ] Update the published release status in current docs only after the remote
  release and assets have been verified.

## Known release limitations

Windows installers and Linux packages are unsigned. macOS artifacts are only
ad-hoc signed and are not notarized. Native Linux runtime installation and an
automatic update channel remain unavailable. MCP server discovery/trust is not
implemented. These limitations must remain visible in the release notes.

The owner plans to run packaged-editor close/reopen acceptance through GitHub
Actions after release. Record the actual run and outcome in `HANDOFF.md`; unit
tests and build completion do not substitute for that check.
