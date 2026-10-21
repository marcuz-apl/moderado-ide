# Moderado IDE changelog

## [Unreleased] — 2026-10-21

**Fix: Approval previews, session isolation, and auto-approve categories**
- **Type**: `fix` / `agent` / `patch`
- **Key deliverables**:
  - `write_file` approvals show a complete unified diff; `apply_patch` accepts the generated multi-file diff as a complete preview.
  - New Session starts a distinct chat instead of reopening the workspace's latest session.
  - Automatically approved requests and requests refused before prompting no longer leave an unanswerable approval card.
  - Turning off Read files or Fetch web content now really requires a human decision for those tools; Plan mode still permits reads.
  - MCP server discovery and trust remain unimplemented (PRD F8).

## [v0.1.31] — 2026-10-10

**Release: Moderado CLI v0.4.10 baseline and unified Gateway access**
- **Type**: `release` / `provider` / `patch`
- **Scope**: Windows x64, Linux x64, macOS Apple Silicon arm64, and macOS Intel x64
- **Key deliverables**:
  - Advance the pinned Moderado contracts/core/tools baseline from v0.4.8 to v0.4.10.
  - Keep Gateway access in the unified Settings → API Config provider flow, with Gateway tagged in the provider list and labeled for public paid access, browser website key, and manual website key.
  - Preserve the free/paid route contract: model listing and paid routes can work without a website key, free routes require one, and Gateway AUTO is labeled unknown cost.
  - Publish 19 assets from source commit `f9e4632939d13ec392cbeb9635ffd1806ab782f3` (tag `v0.1.31+2610102`); all four platform builds and the release publisher passed.

## [v0.1.30] — 2026-10-09

**Fix: Restore Moderado webview interactions**
- **Type**: `fix` / `webview` / `patch`
- **Scope**: Moderado chat and API Config webview; Windows x64, Linux x64, macOS Apple Silicon arm64, and macOS Intel x64
- **Key deliverables**:
  - Remove TypeScript-only annotations from the JavaScript emitted into the webview. The invalid syntax stopped the script from parsing and prevented its controls from responding.
  - Include Gateway endpoint selection, provider catalog refinements, and the refreshed About page.
  - Build Windows x64, Linux x64, macOS Apple Silicon arm64, and macOS Intel x64 packages from the same source revision.

## Published release progression

v0.1.28 (first multi-platform release)
  │
  ├──▶ v0.1.30 (responsive Moderado webview controls)
  │
  └──▶ v0.1.31 (CLI v0.4.10 baseline and unified Gateway access)

v0.1.29 was withdrawn after a webview startup error.

## Milestones

### [v0.1.28] — 2026-10-09
**Release: Initial multi-platform packages**
- **Type**: `release` / `distribution` / `patch`
- **Scope**: Windows x64, Linux x64, and macOS Apple Silicon
- **Key deliverables**:
  - Publish Windows installers and portable archive, Linux DEB/RPM packages, and macOS Apple Silicon packages.
