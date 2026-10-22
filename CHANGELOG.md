# Moderado IDE changelog

## [Unreleased] - 2026-10-21

**Fix: code in the chat is monospace**
- **Type**: `fix` / `chat` / `patch`
- **Key deliverables**:
  - Code in a reply and in the approval preview now uses the editor's code font instead of the interface font. The chat previously set `font-family: inherit` on `pre`, so every snippet was rendered in the proportional interface font.

**Feature: the chat transcript tells the request from the reply**
- **Type**: `feat` / `chat` / `patch`
- **Key deliverables**:
  - The user's own message is now tinted and carries its own accent border, so it reads as the request being answered rather than as part of the answer.
  - The user's message is inset from the left, so the request and the reply are visually distinct without the reply losing reading width in the narrow sidebar.
  - Moderado's reply keeps the panel canvas, and the tool and error rows keep their existing accents. The `YOU` / `MODERADO` labels remain, so the distinction is never carried by colour alone.

**Chore: retire the "Moderado Cloud" product name**
- **Type**: `chore` / `provider` / `patch`
- **Key deliverables**:
  - The old product name no longer appears in any IDE-owned surface. The provider picker, the Settings pane, the chat surface, and the Gateway rejection messages are covered by `test/branding.test.ts`.
  - The IDE-owned base URL constant is now `MODERADO_BASE_URLS`.
  - The `moderado-cloud` connection id and the `moderado/provider/moderado-cloud` Credential Manager reference are unchanged: both are the shared profile contract with the Moderado CLI.
  - The old name still exists in the vendored CLI snapshot (`vendor/moderado/**`). That snapshot is a hash-pinned copy of the pinned upstream commit and changes only when the pinned revision is advanced. The CLI repository is a separate project and is never edited from this one.
  - "Moderado Gateway" names the gateway service and is unchanged.

**Feature: the Moderado Gateway serves free routes only**
- **Type**: `feat` / `provider` / `patch`
- **Key deliverables**:
  - API Config drops the `Paid` tab for the Moderado Gateway and never offers it a paid route, because Moderado does not handle paid models. The `Free` tab and `AUTO` remain, and the `Allow paid models` preference still applies to the other providers.
  - The Gateway key note reads "Free Gateway models need a website API key. Sign in with browser to get API Key".
  - The selected model no longer shows the `Provider:` and `Owner:` rows. Capabilities and the route's own note remain.

**Fix: token usage beside the title, and clearer local runtime labels**
- **Type**: `fix` / `provider` / `patch`
- **Key deliverables**:
  - The task token usage (`In: … | Out: … | Total: … | Rate: … tok/s`) now sits on the left of the top bar, directly beside the `MODERADO` title, at a larger font. The session, history, and settings buttons stay right-aligned.
  - The API Provider menu lists the local runtimes as `Ollama - Local` and `LM Studio - Local`.

**Feature: auto-approve toggles sit in the row**
- **Type**: `feat` / `provider` / `patch`
- **Key deliverables**:
  - The `Auto-approve:` row now carries each privilege toggle directly, in front of its category, so the user reaches the approval settings without clicking to open a panel first. The row is no longer a click-to-expand control.
  - The caveat that enabled actions run without asking is a popup on a warning mark beside the label, so it takes no room in the row. The popup is drawn by the webview itself, because a webview renders no native title tooltip.

**Feature: Moderado provider rename and production gateway endpoint**
- **Type**: `feat` / `provider` / `patch`
- **Key deliverables**:
  - The built-in provider menu lists the Gateway connection as `Moderado` (previously `Moderado Gateway`), without a redundant `Gateway` tag.
  - Agnes AI and OrcaRouter are no longer shipped presets; identically named custom or saved connections remain the user's own profile data.
  - The production Moderado API base URL is `https://modr.alfazen.org/v1`, and browser website-key sign-in plus token exchange use `https://modr.alfazen.org`. The development endpoint stays selectable in API Config.

**Fix: Gateway key retention, an accurate 401 message, and a simpler key box**
- **Type**: `fix` / `provider` / `patch`
- **Key deliverables**:
  - Saving a model choice no longer drops a stored Gateway credential from the shared profile. The access-method control and the key box could disagree, and the profile kept the access method while losing the key reference, so the next run sent no key and failed with a misleading error.
  - A Gateway 401 now distinguishes a rejected key from a missing one, and a free Gateway route selected without a key is reported by name before the request is sent.
  - API Config offers one editable, masked API key box. Type or paste a key, save, and it is stored in Credential Manager; browser website-key sign-in remains a separate action.
  - `Moderado: Remove Saved Connection` deletes a stale connection from the shared profile, so an entry left by an earlier build no longer lingers in the provider menu.

**Fix: Approval previews, session isolation, and auto-approve categories**
- **Type**: `fix` / `agent` / `patch`
- **Key deliverables**:
  - `write_file` approvals show a complete unified diff; `apply_patch` accepts the generated multi-file diff as a complete preview.
  - New Session starts a distinct chat instead of reopening the workspace's latest session.
  - Automatically approved requests and requests refused before prompting no longer leave an unanswerable approval card.
  - Turning off Read files or Fetch web content now really requires a human decision for those tools; Plan mode still permits reads.
  - MCP server discovery and trust remain unimplemented (PRD F8).

**Performance: Streamed render coalescing and cached session recents**
- **Type**: `perf` / `webview` / `build`
- **Key deliverables**:
  - Streamed assistant tokens are painted at most once every 60 ms, and only the streaming transcript row is replaced instead of rebuilding every row and re-reading the session list per token.
  - The RECENT list is cached and invalidated on session create, rename, delete, resume, and show-all, so streaming no longer rescans session files.
  - The brand welcome state is removed as soon as the transcript has content.

**Fix: Windows credential bridge timeout**
- **Type**: `fix` / `provider` / `build`
- **Key deliverables**:
  - Windows Credential Manager bridge operations are bounded by a 5 s timeout; a stalled `powershell.exe` child is killed and the caller receives the sanitized failure message instead of waiting forever.
  - A non-numeric, zero, negative, or over-5 s bridge timeout is rejected at construction.

## [v0.1.31] — 2026-10-10

**Release: Moderado CLI v0.4.10 baseline and unified Gateway access**
- **Type**: `release` / `provider` / `patch`
- **Scope**: Windows x64, Linux x64, macOS Apple Silicon arm64, and macOS Intel x64
- **Key deliverables**:
  - Advance the pinned Moderado contracts/core/tools baseline from v0.4.8 to v0.4.10.
  - Keep Gateway access in the unified Settings → API Config provider flow, with Gateway tagged in the provider list and labeled for public paid access, browser website key, and manual website key.
  - Preserve the free/paid route contract: model listing and paid routes can work without a website key, free routes require one, and Gateway AUTO is labeled unknown cost.
  - Publish 19 assets from source commit `bc1500eb485522088a2fbb855ca6862d511843c2` (tag `v0.1.31+261021c`, rebuilt from the withdrawn `v0.1.31+2610102` release); all four platform builds and the release publisher passed.

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
