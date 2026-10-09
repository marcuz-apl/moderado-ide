# Moderado IDE changelog

## Unreleased: v0.1.30 target

**Fix: Restore Moderado webview interactions**
- **Type**: `fix` / `webview` / `patch`
- **Scope**: Moderado chat and API Config webview; Windows, Linux, and macOS release builds
- **Key deliverables**:
  - Remove TypeScript-only annotations from the JavaScript emitted into the webview. The invalid syntax stopped the script from parsing and prevented its controls from responding.
  - Include Gateway endpoint selection, provider catalog refinements, and the refreshed About page.
  - Build Windows x64, Linux x64, macOS Apple Silicon arm64, and macOS Intel x64 packages from the same source revision.

## Published release progression

v0.1.28 (first multi-platform release)
  │
  └──▶ v0.1.30 (responsive Moderado webview controls)

## Milestones

### [v0.1.28] — 2026-10-09
**Release: Initial multi-platform packages**
- **Type**: `release` / `distribution` / `patch`
- **Scope**: Windows x64, Linux x64, and macOS Apple Silicon
- **Key deliverables**:
  - Publish Windows installers and portable archive, Linux DEB/RPM packages, and macOS Apple Silicon packages.
