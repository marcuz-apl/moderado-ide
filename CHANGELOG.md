# Moderado IDE changelog

## [v0.1.44] — Release candidate; not yet published

**Release summary**
- Extend chat history with rename/delete, recent sessions, search, Markdown export, branching, and prompt-history navigation.
- Keep long conversations usable with a bounded context budget and automatic prompt compaction that preserves the full saved transcript.
- Improve review safety with complete change previews, affected-path lists, fail-closed approval handling, and direct auto-approve category controls.
- Refresh provider setup and model discovery, including the production Moderado Gateway, credential retention/redaction, local-provider guidance, and endpoint-scoped model caching.
- Add bounded, validated skill loading and safer concurrent IDE writes to shared `config.json`.
- Render assistant replies as safe Markdown and show clearer usage and workspace context.

Build scope: Windows x64, Linux x64, macOS Apple Silicon (arm64), and macOS Intel (x64). This candidate still requires a successful all-platform GitHub Actions build and artifact verification. It has not been tagged or published.


**Feature: branch a chat**
- **Type**: `feat` / `chat` / `patch`
- **Key deliverables**:
  - `Moderado: Branch This Chat`, or the branch button in the top bar, copies the current conversation into a new chat and opens it.
  - The original is left exactly as it was, so a different direction can be explored without losing the chat it came from.
  - A branch starts its own cost accounting at zero; the history it carries has already been paid for, so counting it twice would inflate both chats.
  - Branching is refused while a run is active.

**Feature: search recorded chats by name or text**
- **Type**: `feat` / `chat` / `patch`
- **Key deliverables**:
  - `Moderado: Search Chats`, or the `Search` button in the RECENT header, asks for a term and lists every recorded chat in this workspace whose name or messages contain it, newest first.
  - Each result shows the line that matched, so a chat is recognisable without opening it. Picking one resumes that chat.
  - A term that matches nothing is reported, and dismissing the question searches nothing.

**Feature: export a chat as Markdown**
- **Type**: `feat` / `chat` / `patch`
- **Key deliverables**:
  - A chat can be saved as a Markdown file from the toolbar's export button or `Moderado: Export Chat as Markdown`.
  - The destination is chosen in the editor's own save dialog and suggested as `moderado-<date>-<chat name>.md`; the extension writes only the file the user names.
  - The export carries the chat name, date, model and mode, then every user, model and tool turn. System prompt scaffolding is left out; tool output is fenced so it cannot break the document.
  - An empty chat is reported instead of producing an empty file.

**Feature: long chats are summarised to fit the model's context window**
- **Type**: `feat` / `agent` / `patch`
- **Key deliverables**:
  - A chat that outgrows the context budget no longer fails at the provider. The oldest turns are replaced in the prompt by a short digest of what was said, and the recent turns are sent in full.
  - The digest is built from the messages themselves, so compaction costs no extra model call, cannot fail, and gives the same result every time.
  - The saved chat keeps every message. Only the prompt is narrowed, so nothing the user wrote is lost and the conversation still reads completely in the panel.
  - The summarising is announced in the transcript, so a model that has lost the start of a long chat is explained rather than mysterious.
  - `Context budget (tokens)` is a new Advanced setting (4000 to 200000, default 48000).

**Fix: the composer footer names the workspace, not the editor's install folder**
- **Type**: `fix` / `chat` / `build`
- **Key deliverables**:
  - A window with no folder open showed the extension host's working directory in the footer, which is the editor's own install folder, so the row read `Microsoft VS Code`. It now reads `Moderado IDE` there.
  - With a folder open the row still names that folder (`moderado-ide`), taken from the folder's display name rather than from its path.
  - `workspaceFolderLabel` is a pure function, so the three cases are covered by unit tests instead of only by the rendered pane.

**Feature: transcript rows can be copied, and the user's own message reused**
- **Type**: `feat` / `chat` / `patch`
- **Key deliverables**:
  - Every transcript row now carries a `Copy` action, and a row of the user's own message also carries `Edit`. `Edit` puts that text back in the composer, focused, with the caret at the end, so it can be changed and sent again. The transcript itself is not rewritten.
  - Copy goes through the extension host (`vscode.env.clipboard.writeText`) rather than `navigator.clipboard`, and the payload is bounded before it reaches the clipboard.
  - A reply no longer wipes the reader's selection. The renderer holds an incoming `update` or `delta` while text is selected inside the transcript and applies it when the selection is released, and it leaves the transcript alone when the rows did not change.
  - The row actions are delegated on the transcript container, so a streamed row that gets replaced keeps working actions.

**Feature: the provider model list is cached per endpoint**
- **Type**: `feat` / `provider` / `patch`
- **Key deliverables**:
  - Switching provider in API Config now shows the model list at once. The catalog an endpoint returned is kept for the session, so switching back to a provider no longer waits for that provider to answer again.
  - A cached list older than five minutes is refreshed in the background, without blanking the list. The explicit `Reload models` action, a pasted key, and an edited Base URL always reach the provider.
  - A discovery that is no longer wanted is no longer aborted, so the extension host keeps its pooled connection and the next request does not pay for DNS and TLS again.
  - The cache lives in the extension host only. It holds public model metadata, never a credential, and is never written to the shared profile.

**Fix: the local runtime key box says no key is needed**
- **Type**: `fix` / `provider` / `patch`
- **Key deliverables**:
  - The API Key box of `Ollama - Local` and `LM Studio - Local` reads `Running on local LLM server - No API key is needed` instead of `Paste API key`, so the box says what the local runtime actually needs.
  - The message is the box's placeholder, not a filled value. A filled box would be saved as a credential and would then read `Key stored`, which is not true of a local runtime that never needed a key.
  - The contradictory `Paste a key and save. It is stored in Credential Manager…` line is gone for a local runtime. The Moderado Gateway keeps `Paste API key`, because it is not a local runtime even though it needs no key either.

**Feature: Moderado replies render as Markdown**
- **Type**: `feat` / `chat` / `patch`
- **Key deliverables**:
  - A reply is rendered as Markdown: headings, paragraphs, lists, fenced code, block quotes, rules, links, and inline emphasis. The user's own input, tool output, and errors stay plain text, so the request and the machine output keep reading as literal text.
  - The renderer escapes every literal character, emits only a fixed set of tags, and links only `http`, `https`, and `mailto` targets. Model output therefore cannot inject markup, an event handler, or a script into the chat.
  - An image in a reply cannot load, because the chat's content security policy allows no remote resource. It is shown as a link to the image instead.
  - The reply's styles are sized for the narrow sidebar: a compact heading scale, and code blocks that scroll sideways instead of wrapping into an unreadable column.

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
