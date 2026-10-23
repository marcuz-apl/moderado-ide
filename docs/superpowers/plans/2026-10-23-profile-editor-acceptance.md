# Pinned Profile and Real-Editor Acceptance Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh profile compatibility evidence against the exact pinned CLI source and verify session/provider selection survives a real IDE close and reopen when a packaged editor is available.

**Architecture:** Keep compatibility tests isolated from the developer profile, add an explicit command that verifies the CLI source revision instead of silently skipping, and use the existing packaged-editor smoke infrastructure with isolated home, user-data, extensions, and workspace directories. Separate evidence that can run in this checkout from real-editor acceptance that requires an available built editor.

**Tech Stack:** TypeScript, Vitest, Node.js child-process APIs, pinned CLI `apps/cli/dist/config.js` and `sessions.js`, existing `scripts/smoke-linux.mjs` workflow.

**Spec:** `docs/superpowers/specs/2026-10-23-profile-mcp-skills-acceptance-design.md`

## Global Constraints

- Use only the CLI source revision in `sources.lock.json`; the sibling checkout currently points at a different revision and must not be used as pinned evidence.
- Automated checks use isolated temporary homes and workspaces only; never write the developer's real `~/.moderado`.
- Do not edit the sibling CLI, claim cross-application concurrent writes are safe, or alter profile schemas.
- A missing CLI/editor binary is an explicit unavailable gate, not a passing test.
- Do not publish or sign any artifact.

---

### Task 1: Make pinned CLI interoperability an explicit command

**Files:**
- Modify: `extensions/moderado-agent/test/profile.test.ts`
- Modify: `extensions/moderado-agent/package.json`
- Create: `extensions/moderado-agent/scripts/test-profile-interop.mjs`

**Interfaces:**
- `npm run test:profile-interop` requires `MODERADO_CLI_ROOT` to point at a Git checkout containing the pinned commit and verifies `git rev-parse HEAD` equals the `sources.lock.json` Moderado commit before invoking Vitest.
- The normal `npm test` suite may conditionally skip these cross-source cases, but the explicit command must exit nonzero with a setup explanation when prerequisites are absent or mismatched.

- [x] Remove the hard-coded `D:\projects\moderado` fallback from `profile.test.ts` and keep all interop records under a temporary home/workspace.
- [x] Implement the preflight using `spawnSync` with argument arrays; it verifies the pinned Git revision and built CLI modules before invoking targeted interop tests.
- [x] Run `MODERADO_CLI_ROOT=/private/tmp/moderado-cli-pinned npm run test:profile-interop`; 52 tests passed against the locked source revision. A clean dependency install remains open because the offline npm cache lacked `yargs-parser@20.2.9`.

### Task 2: Exercise config and session round trips with pinned CLI APIs

**Files:**
- Modify: `extensions/moderado-agent/test/profile.test.ts`
- Modify: `extensions/moderado-agent/src/profile.ts` only if a failing compatibility test demonstrates a defect.

**Interfaces:**
- Dynamically import the pinned CLI's `loadConfig`, `saveConfig`, `SessionStore`, and `StoredSessionSchema` from the verified root.
- Test known fields, `enabledSkills`, MCP config records, credential references, session IDs/messages, and workspace path hashing. Do not use hand-written schemas as a substitute for pinned CLI code.

- [x] Add isolated pinned-CLI fixtures for CLI-saved config read by IDE, IDE merge read by CLI, unknown config-key loss on CLI save, credentials references without secret values, and session interoperability.
- [x] Run `MODERADO_CLI_ROOT=/private/tmp/moderado-cli-pinned npm run test:profile-interop` against the exact pinned source and capture the revision and outcomes.

### Task 3: Verify a real editor close/reopen with isolated state

**Files:**
- Modify: `scripts/smoke-linux.mjs` and its host-check fixture only if a packaged editor is present.
- Modify: `docs/INSTALL.md`
- Modify: `HANDOFF.md`

**Interfaces:**
- Reuse the existing packaged-editor activation test and fixture; share one temporary profile/workspace across two editor launches, but use dedicated user-data and extensions directories.
- First launch creates a fake-provider session with a selected model; second launch verifies the same session and model are loaded.

- [ ] Add a failing second-launch assertion to the existing real-editor smoke fixture before changing the smoke runner.
- [ ] Run the smoke command when a packaged editor and its platform display/runtime prerequisites exist; capture the artifact path, version, source pins, commands, and outcomes.
- [x] The current host has no `code`, `codium`, or Moderado editor app; record this prerequisite as unavailable and keep the real-editor gate open. Mocked tests are not a substitute.

### Task 4: Reconcile compatibility evidence and known limits

**Files:**
- Modify: `docs/PROFILE.md`
- Modify: `PRD.md`
- Modify: `HANDOFF.md`

- [x] Update the CLI baseline evidence only after the exact-pinned interop command passes, with dependency caveat recorded.
- [x] Record that real editor restart was not verified and leave the gate open.
- [x] Keep the one-sided CLI config lock and same-session concurrent-write limitations explicit.
- [x] Run the extension suite, typecheck, compile, and `git diff --check`.
