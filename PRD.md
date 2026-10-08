# Moderado IDE Product Requirements

**Project version:** see [VERSION](VERSION) (planning scaffold, unpublished)  
**Target platforms:** Linux, macOS, and Windows. Source development uses Linux. Linux packaging is currently paused while
repository naming and the existing Windows GUI are addressed; each edition requires native build and verification
evidence before release. Existing Windows x64 evidence remains platform-specific.
**Reference agent baseline:** Moderado CLI `v0.4.8` pinned contracts, core, and
tools source; IDE-owned provider behavior adapts CLI `v0.4.8` fixtures and
behavior without using CLI provider code at runtime. The exact source commits
are pinned in `sources.lock.json`. The approved source update is commit
`d5e263ed0c9ba6715d0ce69aa640b9b9111931c8` (`v0.4.8+261006d`);
prior build/test evidence does not verify this updated baseline.

## 1. Purpose

Create an independently installed, Moderado-branded coding IDE using the
MIT-licensed Code OSS editor and VSCodium's downstream build approach. A user
must be able to install one IDE package, open a project, connect a provider,
select a model, review agent actions, and resume a Moderado session without
installing the CLI. The IDE and CLI editions share the user's Moderado
profile while maintaining separate application releases.

## 2. Users and primary flow

The initial user is a developer on Linux, macOS, or Windows who wants Moderado's provider-neutral
agent in a complete editor. The first complete flow is:

1. Install and launch Moderado IDE with no CLI installation present.
2. Open a trusted local workspace; inspect code with editor and agent tools.
3. Reuse an existing provider connection from `~/.moderado/config.json` or add
   one through IDE; resolve its key without exposing it in UI messages.
4. Discover models, select a pinned model or free-first AUTO route, and show
   paid or unknown-cost models only under the same explicit opt-in rules as
   the pinned Moderado engine.
5. Start or resume a workspace session, stream events and usage, inspect a
   proposed diff or command, decide approval, and observe the result.
6. Close and reopen IDE; the session and selected provider/model remain
   available. The CLI can subsequently read that session on the same OS.

## 3. Product boundaries

- The IDE is a separate repository with its own `VERSION`, Git history, build,
  release assets, and update channel. IDE work does not write into the CLI
  repository.
- The release bundles Moderado's contracts, core, providers, and tools. It
  cannot shell out to a globally installed CLI or parse terminal output as its
  main agent protocol.
- Editor source/build inputs and Moderado source inputs are pinned by immutable
  upstream revisions and recorded in each build's manifest.
- Moderado agent file and process actions retain the workspace jail, typed
  boundary validation, environment cleansing, bounded output, and core policy.
- UI and editor state do not become part of the shared agent profile contract.

## 4. Functional requirements

| ID | Requirement | Acceptance evidence |
| --- | --- | --- |
| F1 | Produce Moderado-branded Linux, macOS, and Windows IDE packages from pinned Code OSS/VSCodium inputs, starting with Linux x64 development. | Build, install, and launch each edition on its target OS; product name, icon, data directory, URL scheme, and installer IDs do not collide with VSCodium or VS Code. |
| F2 | Bundle the pinned Moderado agent contracts, core, and tools with a IDE-owned provider layer and presets. | With no CLI executable installed, connect to a fake provider and complete a bounded agent turn. |
| F3 | Preserve model inventory, free-first AUTO routing, model pinning, and paid/unknown-cost opt-in in the IDE-owned provider layer with offline parity to CLI `v0.4.8`. | Shared offline fixtures yield equivalent eligibility and routing outcomes in CLI and IDE for the IDE-owned provider revision. |
| F4 | Render structured agent events, tool previews, usage, cancellation, and actionable errors. | A real editor-host test observes ordered events and can cancel a running turn. |
| F5 | Auto-Approve starts enabled for reads, file edits, web content, and MCP calls; command execution remains approval-gated. Users can turn categories off to require human approval. Plan mode blocks mutations, and requests needing a human decision fail closed on timeout, cancellation, malformed or mismatched decisions, or non-interactive execution. | Tests verify the startup defaults and that enabled categories are approved by the host. Gated writes show every affected path and a complete proposed replacement/patch; commands show the command and working directory. A missing complete preview denies the action. |
| F6 | Reuse the same local Moderado configuration, skills, and session schema on the same OS. | IDE reads a CLI-created profile/session and the CLI reads a IDE-created session after restart. |
| F7 | Resolve Windows provider credentials using the existing `moderado/provider/<id>` Credential Manager references. | A CLI-stored test credential works in IDE without copying the secret into `config.json` or the UI. |
| F8 | Discover and run explicitly configured MCP tools only after the user trusts that server. MCP calls are auto-approved by default; users can turn off Use MCP servers to require per-call approval. | A fake MCP server cannot launch before explicit server trust; when per-call approval is enabled, it cannot bypass approval. Provider credentials are removed from its inherited environment. The UI explains that an MCP server is an external process with its own filesystem privileges. |
| F9 | Add project-file context references with @ and explicitly selected text files/images with + in the composer, with removable attachment chips. | @ rejects paths outside the canonical project jail; + accepts human-selected external files within bounded format/size limits. Fake-provider tests verify image content parts and IDE-only snapshot restoration while shared sessions remain text-only. |
| F10 | API Config provides an editable preset-filled Base URL, a masked write-only API Key input, automatic free-model discovery after URL/key edits, Reload models, and Save settings. Unknown endpoints are reported explicitly. | Offline browser/host tests cover unsaved-key discovery, correct provider endpoints, safe key persistence on Linux/Windows, no secret echo, reload, and save. |
| F11 | Users can delete any recorded chat in their workspace from Chat History. | Native confirmation precedes deletion; UUID/path/symlink checks constrain deletion to that workspace and its image snapshots; active runs block deletion. |
| F12 | Settings includes a simple About subpage showing IDE version, editor version, MIT license, and project link. | Escaping and browser tests verify page navigation and built version metadata. |
| F13 | Features uses simple grouped settings with working Moderado controls: paid/unknown cost opt-ins, web search, history on startup, approval timeout, and preferred reply language. Preferences remain in editor configuration. | Offline host/browser tests verify validated settings persist, affect new tasks, block disabled web search, and never write shared agent config. |
| F14 | The chat composer lets users browse submitted prompts with Up/Down while preserving the unsent draft; multiline editing keeps normal caret navigation except at the first/last line. | Offline webview tests verify history navigation boundaries, draft restoration, and bounded webview-state persistence. |
| F15 | Chat History lets users assign a meaningful display name to each recorded chat; names are stored in workspace-local IDE state and do not alter the shared CLI session schema. | Offline host/webview tests verify rename, validation, cancellation, escaping, and unchanged shared session records. |



Auto-Approve defaults to Read files, Edit files, Fetch web content, and Use MCP
servers. Execute commands stays off by default. These host-side defaults are
visible in the composer and can be changed there; Plan mode still blocks
mutations. MCP server trust before launch remains separate from per-call
approval. The current CLI's interactive handler may auto-approve actions
differently; see [Profile and behavior compatibility](docs/PROFILE.md).

F5 requires work beyond the current core: `write_file` has no complete diff
preview, multi-file patch approval does not enumerate every target in the
structured payload, and the core currently accepts an `approved` status
without validating the decision request ID. The IDE integration must
close these gaps through a validated host boundary and, where needed, a
separately reviewed upstream Moderado change. Its approval handler must own
an explicit deadline; the existing policy's timeout field alone does not
enforce one.

## 5. Shared-profile contract

The shared Moderado root is `path.join(os.homedir(), '.moderado')`; on Windows
this normally resides under `%USERPROFILE%`. The IDE and CLI editions
share `config.json`, `sessions/`, and `skills/` according to their existing
formats. Windows provider keys remain in Credential Manager. IDE-specific
layout and caches are isolated. Unknown config fields must survive a IDE
write. Schema changes require explicit versioning and a reversible migration.

Before a public release, simultaneous CLI/IDE configuration writes must
have a tested coordination strategy accepted by both applications; the current
CLI writer performs a direct read/merge/write and can lose updates. Two live
processes must not edit the same session ID without a conflict policy. The
supported sharing case is IDE and CLI within one account on the same OS;
credential persistence must be verified separately for each platform. Sharing between
Windows and a separate Linux home is a later, explicit compatibility decision.
See [the detailed profile contract](docs/PROFILE.md).

## 6. Non-functional requirements

- **Security:** Keep the Moderado tool jail and approval boundary authoritative;
  workspace and model content are untrusted. Never send stored or resolved provider secrets into
  renderer events, logs, crash reports, or child process environments. A user-pasted key may exist transiently in the Settings password input and is accepted only by validated discovery/save messages; it is never echoed by the host. A local
  MCP server is separately trusted executable code and is not confined by the
  file-tool workspace jail.
- **Reliability:** Fail closed on malformed config, session, provider, or tool
  payloads; show recovery guidance without deleting user data. Preserve a
  known-good application version if an update fails.
- **Maintainability:** Prefer a small, reviewable downstream patch set. Pin
  upstream revisions, retain attribution, and test rebases before changing
  editor versions.
- **Verification:** Core/provider/tool tests run offline with fakes. At least
  one real IDE-host smoke flow runs on each supported OS; a mocked `vscode` module alone
  is insufficient evidence of editor integration.
- **Accessibility:** Agent controls, approval dialogs, errors, and model choices
  work with keyboard and screen reader interaction.

## 7. Delivery gates

1. **Foundation:** Independent repository, source/license inventory, pinned
   upstream inputs, and repeatable local builds, starting with Linux.
2. **Agent integration:** Self-contained editor package, structured event UI,
   provider/model parity, and fail-closed approvals against fake providers.
3. **Shared profile:** Configuration, credentials, sessions, and skills round
   trip with a CLI release; concurrent writes are handled or explicitly
   prevented without data loss.
4. **Release readiness:** Real-editor tests, clean-account install/uninstall,
   provenance, license notices, update channel, and user documentation.

Each gate must pass before the next is declared complete. The scaffold itself
completes none of the application gates.

## 8. Explicit non-goals for the first release

No reimplementation of the Moderado agent loop, no dependency on an installed
CLI, no Microsoft Visual Studio Marketplace endpoint in the derived editor,
no silent installation of proprietary extensions, and no cross-OS profile sharing.
Linux, macOS, and Windows releases each require their own verified workflow;
a local Linux build is not evidence of macOS or Windows readiness.
