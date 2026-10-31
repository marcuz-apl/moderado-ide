# Project Handoff

Updated: 2026-10-30 22:05 UTC
Branch: `master`
Commit: the commit carrying this handoff; `VERSION` holds its identifier
Status: All eight inspected enhancement steps are closed: keyless fresh-install connection, document corrections, the v0.4.54 pin advance, the flaky coordination test, MCP server trust (F8), workspace re-scoping, context-estimate calibration, and release-gate evidence via a dispatched Windows artifact build. Suite fully green. Latest published release remains v0.1.44; v0.1.48 is built but unreleased.

## Summary

The IDE connects to the Gateway without a key from the first launch, MCP servers (F8) run only after explicit per-server trust, the vendored agent is current at CLI v0.4.54, the context estimate calibrates itself from provider-reported usage, and the agent follows the window's folder changes.

## Completed

- **Keyless fresh install** (`resolveProvider`): a profile with nothing saved, or no `config.json`, resolves a session-scoped keyless Gateway connection at the production base URL; nothing is written to the profile. A keyless `auto` request omits `model`, which is how the Gateway applies its pinned free defaults.
- **v0.4.54 pin advance**: `sources.lock.json` now pins tag `v0.4.54` (commit `3ebdf48b95ff17eae0f80667ebf2584bb193c10a`), vendored through `scripts/vendor-moderado.mjs` from an IDE-local cached checkout. The reviewed diff brought a bounded tool-stall guard, an answer-detail prompt toggle, `save_to_documents`, catalog `name`/`section`, an approval `targetFile` fallback, and the Moderado product-name strings. No approval, jail, or policy weakening found. The vendor export script's Windows tar bug (drive path read as a remote host) is fixed.
- **MCP (F8)**: configured servers from the shared profile are offered once per run with a modal naming the executable and stating the OS-level access; trust is remembered in `globalState`, dismissing is not. Only trusted servers reach the host, so trust precedes discovery. The pinned transport spawns them with `getSanitizedEnv()`, `shell: false`; every MCP tool keeps `requiresApproval`, and `mcp.` names map to the Use MCP servers category, which defaults on.
- **Workspace re-scoping**: the workspace root is re-resolved on `onDidChangeWorkspaceFolders` and the host rebuilt; a change during a run is deferred until it settles. Previously the file-tool jail and session directory stayed rooted at activation.
- **Context accounting**: the compaction estimate calibrates per session from provider-reported `usage.promptTokens` (single-step runs only, bounded 1.5–8 chars/token against the uncalibrated baseline), and a prompt still over the configured budget after summarising is announced in the transcript before sending.
- **Flaky coordination test fixed**: the spawned writers waited only 5 s for the config lock; under the full parallel suite a slow child boot plus a stalled critical section exceeded it and failed a correct protocol. The test now waits 30 s. Two consecutive full-suite runs passed with zero failures.
- **Documents**: PRD, README, and `docs/PROFILE.md` no longer claim that free Gateway routes require a website key; the `section: 'default'` marker and keyless fresh-install behavior are documented.

## In progress

- GitHub Actions run `41175520883` (`platform=windows`, artifact-only, no publish) is building master for owner testing. A first dispatch (`41125274990`) failed at the extension offline suite: the oxc transform rejected the unparenthesized union in the harness's `folderChange` field (`undefined as undefined | () => void`), which the local tsc and vitest accepted. The type is now parenthesized; the run also confirmed the v0.4.54 vendoring and vendored-package build work on CI.

## Working tree

- Clean. `.workbuddy-ai/` is local agent memory and is deliberately not tracked. `build/moderado-v0.4.54` is the IDE-local cached CLI checkout used for vendoring (ignored).

## Checks

- `npm test` — 631 passed, 6 skipped, 0 failed (twice consecutively).
- `npm run typecheck` — PASS. `npm run compile` — PASS; bundle 646 KiB.
- `git diff --check` — clean.
- New tests: four host cases for keyless resolution and keyless `auto`, three for workspace re-scoping, two for MCP trust plus one host launch case, four calibration cases in `context-budget.test.ts`, two host cases for the over-budget warning and calibrated compaction, two settings-host cases for MCP trust, and the profile test asserting the empty-profile Gateway resolution.
- A glitch found and fixed during re-validation: the re-scope change broke the bundle smoke activation (`onDidChangeWorkspaceFolders` missing from the stub); the stub now provides it, and compile passes.
- No live Gateway request was made; the catalog contract comes from the CLI's own fixtures and adapter.

## Decisions and context

- The fresh-install connection uses the production Gateway directly rather than probing the development one: the settings pane has an explicit Dev/Prod choice, and a probe would tax every unconfigured run.
- Trust decisions live in editor `globalState`, not the shared profile: they are IDE-specific decisions, which the profile contract keeps out of `config.json`.
- The fake provider is now reachable only through an unreadable profile; offline tests that need it use one. A fresh profile reaching the real Gateway is intended behavior.
- MCP tool execution is bounded by the pinned core's new two-minute tool-stall guard, which also bounds a hung MCP call.

## Blockers

- Owner acceptance of the Windows artifact (run `41125274990`) is the gate for publishing v0.1.48.
- Signing/notarization, an update channel, and native Linux installation verification remain open release-engineering work (M4/M5), unchanged by this session.
- Cross-application config-write safety still needs the CLI to adopt the IDE lock protocol — a separate, reviewed CLI change.

## Next action

1. Owner downloads the Windows artifact from run `41125274990`, confirms a fresh profile chats on the free defaults with no key, the picker shows the stealth names with `$0.00`, and a configured MCP server asks before launching.
2. Publish only after owner acceptance and explicit release authorization.

## Resume notes

- Shared profile implementation: `extensions/moderado-agent/src/profile.ts` and `extensions/moderado-agent/src/coordination.ts`.
- Profile contract and CLI limitations: `docs/PROFILE.md`.
- Gateway catalog contract: CLI commit `7cae817` and `docs/CLOUD_GATEWAY_INTEGRATION.md` in the CLI repository.
- Run extension checks from `extensions/moderado-agent`. Vendoring: `node scripts/vendor-moderado.mjs build/moderado-v0.4.54`.
