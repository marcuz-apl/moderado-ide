# v0.1.44 release status

**State:** published stable release. `v0.1.44+2610236` is the latest
published version; its all-platform GitHub Actions build and publication
completed successfully.

## Published release

- Release: [v0.1.44+2610236](https://github.com/marcuz-apl/moderado-ide/releases/tag/v0.1.44%2B2610236)
- Source commit: `fe362d3421a22157f3b905c8d64c995dc0bae914`
- Workflow: [run 39943739959](https://github.com/marcuz-apl/moderado-ide/actions/runs/39943739959)
- Result: all four platform builds and the stable release publisher passed.
- Published assets: 19, including platform installers, per-platform build
  manifests, provenance, release verification, checksums, and third-party
  notices.
- Verification: the tag resolves to the source commit; GitHub reports the
  release as published, stable, and not a draft.

## Release contents

- Session history improvements: rename/delete, prompt history, search, Markdown
  export, branching, and long-chat context compaction.
- Safer approval previews and fail-closed completion/cancellation behavior.
- Bounded, validated skills exposed through a read-only loader.
- Provider setup/model discovery updates, Markdown assistant replies, and
  clearer usage/workspace display.
- IDE-side shared `config.json` coordination with owned-field conflicts and
  ownership-safe lock recovery.

See `CHANGELOG.md` for the full release notes.

## Publication checks

- [x] Push the release source candidate to `master`.
- [x] Update and push the final release documentation before dispatch.
- [x] Owner authorized `.github/workflows/build-and-release.yml` with
  `platform=all` and empty `source_ref` on 2026-10-23.
- [x] All four platform builds and artifact verification passed in run
  39943739959.
- [x] Verify the stable release, tag target, and 19 published assets.
- [x] Update current docs with the published release state.

## Known release limitations and follow-up

Windows installers and Linux packages are unsigned. macOS artifacts are only
ad-hoc signed and are not notarized. Native Linux runtime installation and an
automatic update channel remain unavailable. MCP server discovery/trust is not
implemented. These limitations are disclosed in the release notes.

Packaged-editor close/reopen acceptance in a real editor remains open. The
owner plans to run this through GitHub Actions after release. Record the actual
run and outcome in `HANDOFF.md`; unit tests and build completion do not
substitute for that check.
