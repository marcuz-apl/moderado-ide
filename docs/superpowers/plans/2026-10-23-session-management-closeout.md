# Session Management Closeout Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this plan task-by-task. Each task ends with its own verification checkpoint.

**Goal:** Fix the prompt-history multiline navigation defect and verify the implemented session-management flows against PRD F14 and the affected session tests.

**Architecture:** Keep session persistence and chat operations in the existing `SessionStore`, `AgentHost`, and extension host. Add an offline test that runs the emitted chat webview script with a small DOM/event stub so the actual composer key handler and state updates are exercised. The current handler checks line/caret boundaries only before browsing starts; preserve normal multiline caret movement while browsing too.

**Tech Stack:** TypeScript, Vitest 5.0.5, Node.js built-in `node:vm`; no new runtime dependencies. The existing compile script's `esbuild` dependency is declared as development-only.

**Spec:** `PRD.md` F6, F11, F14, and F15; session lifecycle behavior in `extensions/moderado-agent/src/sessions.ts`, `host.ts`, `extension.ts`, and `chat-view.ts`.

## Global Constraints

- Follow `AGENTS.md`; treat Moderado IDE as an independent product and use only the source pins in `sources.lock.json` where shared packages are needed.
- Do not write the real user's `~/.moderado`; use isolated temporary home/workspace fixtures.
- Do not add runtime dependencies. Use Node APIs for the harness; update the development test runner only to remediate the confirmed audit findings.
- Keep session records compatible with the existing shared schema; keep display names in workspace-local IDE state.
- Do not claim passing checks until they have run successfully in the current checkout.
- Do not publish or dispatch a build as part of this work.

---

### Task 1: Exercise prompt-history behavior in the emitted webview

**Files:**
- Modify: `extensions/moderado-agent/test/webview-script.test.ts`
- Modify only if the test exposes a behavior defect: `extensions/moderado-agent/src/chat-view.ts`

**Interfaces:**
- The test consumes `chatHtml(state, preview)` and runs its emitted inline script.
- A test-only DOM stub supplies `#prompt`, `#send`, and other requested elements with event registration, values, selection positions, and the minimal DOM methods needed for script initialization.
- The test captures `vscode.getState()` and `vscode.setState()` so persisted prompt history is observable.

- [x] **Step 1: Restore the exact locked dependencies.**

  From `extensions/moderado-agent`, run: `npm ci`

  Expected: installation exits successfully and `node_modules/.bin/vitest`
  and `node_modules/.bin/tsc` exist. If registry access is unavailable, stop
  and record the blocker; do not treat a partial `node_modules` directory as
  usable.

- [x] **Step 2: Add a test harness around the generated inline script.**

  Extract the script using the existing `scriptOf()` helper. Execute it with
  `node:vm` using a fake `document`, `acquireVsCodeApi()`, and element stubs.
  Each element stores listeners by event name; the `#prompt` stub implements
  `value`, `selectionStart`, `selectionEnd`, `setSelectionRange()`, and a no-op
  `focus()`. Give generic elements no-op DOM methods and empty query results so
  unrelated UI setup can complete. Keep the harness in the test file and add
  no production-facing test hook.

- [x] **Step 3: Add behavioral cases for the F14 contract.**

  Assert that ArrowUp at the first line replaces the draft with the newest
  submitted prompt and moves through older prompts; ArrowDown moves toward the
  newest prompt and then restores the exact unsent draft. First browse to a
  multiline historical prompt, put the caret after a newline, and assert ArrowUp
  is not prevented and leaves the prompt value unchanged. Also browse to a
  multiline prompt, put the caret before a newline, and assert ArrowDown is not
  prevented and leaves the value unchanged. Assert selections are left to
  normal caret behavior while browsing, boundary keys do not wrap, a new input
  edit exits browsing, and persisted prompt history drops blank/non-string
  entries and remains capped at 100.

- [x] **Step 4: Run the new regression tests and confirm the defect.**

  Run: `npx vitest run test/webview-script.test.ts`

  Expected: the new mid-line Up/Down assertions FAIL because
  `browsePromptHistory()` currently bypasses caret checks when already browsing.
  If they pass, inspect the harness and assert actual `preventDefault()` and
  input-value behavior before changing production code.

- [x] **Step 5: Preserve multiline caret navigation in the history handler.**

  In `chat-view.ts`, before changing `historyIndex`, return `false` whenever a
  selection is active or the caret is not on the relevant boundary line:
  ArrowUp may browse only when the text before the caret has no newline;
  ArrowDown may browse only when the text after the caret has no newline. Apply
  these checks whether `historyIndex` is at the draft or inside prompt history.
  Keep the existing no-wrap and draft-restore behavior unchanged.

- [x] **Step 6: Rerun focused view tests.**

  Run: `npx vitest run test/webview-script.test.ts test/chat-view.test.ts`

  Expected: PASS; the regression cases fail before the fix and pass after it.

### Task 2: Verify session lifecycle and history operations

**Files:**
- Read and test: `extensions/moderado-agent/test/sessions.test.ts`
- Read and test: `extensions/moderado-agent/test/host.test.ts`
- Read and test: `extensions/moderado-agent/test/settings-host.test.ts`
- Read and test: `extensions/moderado-agent/test/session-search.test.ts`
- Read and test: `extensions/moderado-agent/test/session-export.test.ts`
- Read and test: `extensions/moderado-agent/test/context-budget.test.ts`
- Read and test: `extensions/moderado-agent/test/attachments.test.ts`
- Read and test: `extensions/moderado-agent/test/profile.test.ts`

**Interfaces:**
- Tests use temporary profile homes, temporary workspaces, fake providers, and mocked editor APIs.
- Extension tests resolve `@moderado/*` through generated declaration files in `vendor/moderado/packages/*/dist`; build the pinned vendor workspaces before running the package tests.
- Session delete accepts only a workspace root and a validated session id; it does not accept a renderer-provided path.
- Search/export/rename/branch behaviors remain in their existing IDE-owned modules.

- [x] **Step 1: Build the pinned vendor packages.**

  From `vendor/moderado`, run `npm ci` and then `npm run build`.

  Expected: all four pinned packages build and the `contracts`, `core`,
  `providers`, and `tools` package `dist` entry points exist. Do not edit the
  generated vendor source or advance the pin as part of this session.

- [x] **Step 2: Run focused session tests.**

  From `extensions/moderado-agent`, run:

  ```sh
  npx vitest run test/sessions.test.ts test/host.test.ts test/settings-host.test.ts test/session-search.test.ts test/session-export.test.ts test/context-budget.test.ts test/attachments.test.ts test/profile.test.ts test/chat-view.test.ts test/webview-script.test.ts
  ```

  Expected: PASS, including tests for new/resumed sessions, restart persistence
  through a second host instance, rename/delete confirmation and validation,
  branch preservation, search selection, export cancellation, compaction without
  truncating stored history, and attachment cleanup. Investigate any failure
  before changing code.

- [x] **Step 3: Run the package checks.**

  From `extensions/moderado-agent`, run `npm test`, `npm run typecheck`, and
  `npm run compile`.

  Expected: all exit successfully. Record exact outcomes and any skipped cases
  in `HANDOFF.md`.

- [x] **Step 4: Resolve the audit findings in the development test toolchain.**

  The current install reports advisories in `vitest`, `@vitest/mocker`,
  `tinypool`, and `vite`; the audit's fixed Vitest version is 5.0.5, which
  requires Node `^22.12.0 || ^24.0.0 || >=26.0.0`. This repository's CI pins
  Node 24.18.0. Update the development-only Vitest dependency to `^5.0.5`,
  refresh `package-lock.json`, declare the compile script's already-required
  `esbuild` as a dev dependency, and make the Vitest config explicitly ESM with
  `.mts`. Run `npm test`, `npm run typecheck`, `npm run compile`, and `npm audit`.

  Expected: the test behavior stays green and `npm audit` reports no remaining
  vulnerabilities. Do not use `npm audit fix --force` or change runtime
  dependencies.

### Task 3: Record remaining product-gate limits

**Files:**
- Modify: `HANDOFF.md`
- Consult: `PRD.md`, `docs/PROFILE.md`

**Interfaces:**
- The handoff records current implementation status and check evidence.
- The PRD/profile documents remain authoritative for cross-CLI profile
  interoperability, concurrent profile/session writes, and real editor-host
  acceptance gates.

- [x] **Step 1: Update the handoff with current evidence.**

  Record the focused and package check commands, outcomes, and any concrete
  remaining failures. State explicitly that source-level tests do not prove a
  real editor restart or the CLI/IDE round trip unless those flows were run.

- [x] **Step 2: Confirm no session requirement is silently marked complete without evidence.**

  Compare the recorded evidence against PRD F6, F11, F14, and F15 and the
  profile gate. Leave any unperformed editor or CLI interoperability checks
  open; do not infer them from unit tests.

  Expected: the handoff distinguishes implemented behavior, passing automated
  checks, and unverified product gates.
