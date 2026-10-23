# Profile, MCP, Skills, and Acceptance Remediation

**Status:** Owner approved

## Intent

Complete the remaining approved priorities after the approval-safety work:

1. Integrate validated shared-profile skills into agent runs.
2. Implement MCP discovery and explicit server trust, independently of per-call
   auto-approval, while ensuring provider credentials do not enter MCP child
   environments.
3. Refresh profile and editor acceptance evidence against the pinned Moderado
   source revision, including real editor restart and sequential IDE/CLI
   round trips where the required binaries are available.

The earlier canceled-approval cleanup and unused setting removal are already
implemented and pushed in commit `0082708`; this design does not repeat them.

## Existing evidence and constraints

- IDE profile and session code has isolated unit coverage for validation,
  unknown-field preservation, corrupt-file refusal, canonical workspace paths,
  and session conflicts.
- Pinned-CLI profile tests are conditional and currently cover only some
  session round trips. They do not prove config round trips or a real editor
  restart. Tests that claim CLI compatibility must identify the exact pinned
  source revision and use an isolated temporary home and workspace.
- The CLI config writer does not take the IDE lock. This IDE repository must
  not edit the sibling CLI. Concurrent cross-application config writes remain
  unsupported until a separately reviewed shared protocol exists.
- The editor executable and pinned CLI distribution may not be installed in
  every development environment. A missing binary must produce an explicit
  skipped/unavailable acceptance result, never a passing compatibility claim.
- The pinned MCP adapter starts a process during discovery and its transport
  does not accept an injected environment. Its existing sanitizer does not
  remove all IDE provider environment key names. The `vendor/moderado` tree is
  pinned/generated input and must not be edited directly.
- MCP servers run as user extensions with the user's OS privileges; the
  built-in workspace jail does not confine them.

## Skills behavior

- Reuse the core's existing `skills` input and read-only `load_skill` tool.
- Discover skills from the shared profile, then reject symlinked entries and
  files whose canonical paths escape the skills root.
- Enforce per-file, total-byte, and entry-count limits before passing any
  bodies to the core. Invalid entries are reported by name/reason without
  exposing file content.
- Honor the pinned config's `enabledSkills` list. Do not invent a new profile
  field or editor setting. Only valid discovered skills named in that list are
  exposed through `load_skill`; a missing or malformed list enables none.
- Skill text is untrusted advisory data. It cannot change system/developer
  policy, user intent, approval decisions, tool permissions, or workspace
  confinement. Skills receive no direct filesystem or process capability.

## MCP behavior

- Validate `config.mcpServers` at the host boundary using the pinned contract
  schema and a safe server-name rule. Disabled, malformed, or untrusted entries
  are not registered and cannot be launched.
- Obtain explicit host-side trust for the exact server identity, executable,
  and argument list before discovery or launch. A command fingerprint change
  invalidates stored trust. Trust is editor-local and stored in VS Code
  `globalState`; profile data never implies trust.
- The trust prompt displays the exact executable and arguments and explains
  that the external process has the user's OS privileges and is not workspace
  jailed. Dismissal, timeout, malformed state, or unavailable UI denies trust.
- Trust is independent of the Use MCP servers auto-approval setting. That
  setting controls per-call approval only after a server is trusted. When
  disabled, each MCP call uses the existing fail-closed approval coordinator.
- Before any server starts, its child environment must exclude all provider
  credentials, including IDE-specific `MODERADO_<ID>_API_KEY` variables. Since
  the pinned adapter has no environment injection point, implement and review a
  separate shared-tools change outside this IDE checkout; do not modify the
  sibling CLI here or patch generated vendor files. Advance the IDE source pin
  only after that change is reviewed and available. Until then MCP execution
  remains unavailable rather than launching with an unsafe environment.
- Use fake stdio servers in tests to prove zero starts before trust, trust
  invalidation on command changes, credential filtering, per-call approval,
  denial behavior, and bounded/error handling.

## Profile and editor acceptance

- Replace silent conditional acceptance with a dedicated explicit
  interoperability command. It must fail with a clear setup message when the
  configured pinned CLI distribution is missing, and print the exact CLI
  revision used when it runs.
- With an isolated home and workspace, verify CLI-created profile/session data
  is read by IDE and IDE-created profile/session data is read by the pinned CLI.
  Include unknown config fields, malformed records, and credential references
  without reading or writing the developer's real profile.
- Add a real editor close/reopen acceptance procedure using a built IDE and
  isolated user-data/extensions directories. Verify the same session and
  provider/model selection are present after restart.
- Record the exact artifact, source pins, commands, and outcomes. If the real
  editor or CLI binary is unavailable, report that gate as unverified and keep
  it open in `HANDOFF.md`.
- Do not claim concurrent IDE/CLI config writes are safe. Keep that limitation
  explicit pending a separately reviewed shared writer protocol.

## Boundaries

- No changes to the sibling CLI checkout, no direct edits to generated vendor
  files, no new runtime dependencies, and no live model calls.
- Do not publish, sign, notarize, or dispatch a release as part of this work.
- Do not claim real editor, platform, or CLI interoperability acceptance unless
  the named artifact and checks actually ran.
- Preserve all existing approval defaults and profile data.

## Acceptance evidence

- Focused offline tests cover skill selection, traversal/symlink rejection,
  byte/count bounds, and the untrusted load boundary.
- Fake MCP process tests prove explicit trust before discovery/launch,
  command-fingerprint invalidation, safe child environment, independent
  per-call approval, and fail-closed behavior.
- The explicit pinned-CLI interoperability command passes with isolated
  fixtures, or reports the missing environment as a blocker without silently
  passing.
- A real editor close/reopen check passes on an available packaged editor, or
  the handoff clearly records that it remains unverified.
- Affected package tests, typecheck, build, and security checks pass.
