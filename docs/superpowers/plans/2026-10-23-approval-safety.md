# Approval Safety Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure human approval only succeeds when the reviewer has the complete proposed change, and release all pending preview state after completion or cancellation.

**Architecture:** Keep the existing host-owned approval coordinator and webview. Mark capped preview strings with a stable internal suffix and have the coordinator reject them. Deny human-gated file mutations when the webview review surface is absent, preserve exact argument arrays for modal command approvals, and centralize cleanup of pending request state.

**Tech Stack:** TypeScript, Vitest 5.0.5, VS Code extension host API, pinned `@moderado/contracts`.

**Spec:** `docs/superpowers/specs/2026-10-23-approval-safety-design.md`; PRD F5 and `AGENTS.md` approval/execution rules.

## Global Constraints

- Do not change runtime dependencies, vendored packages, the sibling CLI, profile formats, or auto-approval category defaults.
- Auto-approved actions remain governed by the existing category policy; this plan changes only human-gated approval behavior.
- A write without a complete, reviewable preview is denied.
- Do not publish installers, manifests, or packages.
- Write a failing offline test before each behavior change; use fakes and mocked editor APIs.

## Review Focus

- Preview truncation at exactly 200,000 characters and above must not make an incomplete preview approvable; cover write, edit, and multi-file patch requests in `test/approval.test.ts`.
- A human-gated file mutation without a live webview must be denied; cover the host fallback in `test/settings-host.test.ts`.
- A modal command must display the command argument array without shell-quoting ambiguity and include cwd; cover the modal call in `test/settings-host.test.ts`.
- Cancellation and view disposal must remove both pending approval entries and prevent a late preview request from opening stale content; cover those lifecycle paths in `test/settings-host.test.ts`.
- The contributed setting must no longer claim to control approval when the host does not read it; cover the extension manifest in `test/settings-preferences.test.ts`.

---

### Task 1: Deny approvals with truncated previews

**Files:**
- Modify: `extensions/moderado-agent/test/approval.test.ts`
- Modify: `extensions/moderado-agent/src/approval.ts`

**Interfaces:**
- `buildApprovalRequest(input)` remains the boundary that caps data sent to the UI.
- `hasCompletePreview(request)` remains the coordinator's write-preview gate.
- Keep the shared approval schema and vendored source unchanged.

- [x] **Step 1: Add failing tests for oversized previews.**

  Import `buildApprovalRequest` in `test/approval.test.ts`. Add cases showing
  that normal write/edit/patch previews remain complete, while a capped
  `contentPreview` or `diffPreview` is rejected for `write_file`, `edit_file`,
  and `apply_patch`. Use a generated patch with multiple file headers so the
  test proves truncation after a valid initial diff header is rejected.

- [x] **Step 2: Run the focused tests and confirm the failure.**

  Run: `npx vitest run test/approval.test.ts`

  Expected: new oversized-preview cases fail because `hasCompletePreview()`
  currently accepts a nonempty truncated value or the initial patch header.

- [x] **Step 3: Reject the internal truncation marker.**

  In `approval.ts`, define one stable truncation suffix shared by `capPreview()`
  and a private helper that detects that suffix. Make `hasCompletePreview()`
  return false when any preview field relevant to the requested write/edit/patch
  is capped. Keep the current character limit and request schema unchanged.

- [x] **Step 4: Rerun approval tests.**

  Run: `npx vitest run test/approval.test.ts`

  Expected: all existing and new approval tests pass.

### Task 2: Make host review fallbacks fail closed and exact

**Files:**
- Modify: `extensions/moderado-agent/test/settings-host.test.ts`
- Modify: `extensions/moderado-agent/src/extension.ts`

**Interfaces:**
- The extension host remains the only authority that turns a renderer decision into an approval result.
- Keep native modal approval for human-gated commands, displaying a JSON-formatted argument array and working directory.
- Deny human-gated `write_file`, `edit_file`, and `apply_patch` if no chat webview is available to show their full preview.

- [x] **Step 1: Add host tests for the no-view and command modal paths.**

  Extend the existing activation harness to request a human-gated file mutation
  with no resolved chat view and assert a denied decision without an Allow
  modal. For a command request, assert the modal detail includes
  `JSON.stringify(command)` and the complete cwd.

- [x] **Step 2: Run the focused tests and confirm the failures.**

  Run: `npx vitest run test/settings-host.test.ts`

  Expected: the current fallback presents a modal Allow action for mutations
  and joins command arguments ambiguously.

- [x] **Step 3: Add the fail-closed fallback and exact command rendering.**

  In `askHuman()`, if the request requires review of a file mutation and no
  webview is open, return a request-matched denial explaining that the chat
  review surface must be reopened. Preserve the existing modal path for
  human-gated commands but render the command array as JSON and retain cwd.

- [x] **Step 4: Rerun host tests.**

  Run: `npx vitest run test/settings-host.test.ts`

  Expected: all existing and new host tests pass.

### Task 3: Release pending preview state on every completion path

**Files:**
- Modify: `extensions/moderado-agent/test/settings-host.test.ts`
- Modify: `extensions/moderado-agent/src/extension.ts`

**Interfaces:**
- `pendingApprovals` resolves a live decision; `pendingApprovalRequests` stores its preview only while that decision is pending.
- Do not expose either map or add a production-facing test hook.

- [x] **Step 1: Add a failing cancellation cleanup test.**

  Start a human-gated approval with an open webview, cancel or dispose the
  view, then send a late `preview` message with the canceled request ID.
  Assert no preview document opens and the view has no pending approval.

- [x] **Step 2: Run the focused test and confirm the failure.**

  Run: `npx vitest run test/settings-host.test.ts`

  Expected: the late preview still opens because the abort handler removes the
  decision callback but leaves `pendingApprovalRequests` populated.

- [x] **Step 3: Unify pending approval cleanup.**

  Ensure normal decisions, cancellation, timeout, and view disposal remove both
  map entries and clear the view's pending approval state. Keep cleanup
  idempotent so races between a decision and abort cannot restore stale state.

- [x] **Step 4: Rerun lifecycle tests.**

  Run: `npx vitest run test/settings-host.test.ts test/approval.test.ts`

  Expected: all relevant tests pass, including timeout and view-close denial.

### Task 4: Remove the unused editor setting

**Files:**
- Modify: `extensions/moderado-agent/test/settings-preferences.test.ts`
- Modify: `extensions/moderado-agent/package.json`

**Interfaces:**
- Existing composer Auto-Approve categories remain the source of approval preferences.
- Do not migrate or delete values from user settings.

- [x] **Step 1: Add a manifest assertion.**

  Add a test that parses the extension manifest and asserts
  `moderado.requireApprovalByDefault` is not contributed while the supported
  approval timeout setting remains present.

- [x] **Step 2: Run the focused test and confirm the failure.**

  Run: `npx vitest run test/settings-preferences.test.ts`

  Expected: the assertion fails while the obsolete manifest entry exists.

- [x] **Step 3: Remove the obsolete contribution.**

  Delete only `moderado.requireApprovalByDefault` from `package.json`. Do not
  change the category-based defaults or persisted settings values.

- [x] **Step 4: Rerun settings tests.**

  Run: `npx vitest run test/settings-preferences.test.ts test/settings-host.test.ts`

  Expected: all settings and approval tests pass.

### Task 5: Verify and record the first workstream

**Files:**
- Modify: `HANDOFF.md`
- Consult: `docs/superpowers/specs/2026-10-23-approval-safety-design.md`

- [x] **Step 1: Run the complete extension checks.**

  From `extensions/moderado-agent`, run `npm test`, `npm run typecheck`,
  `npm run compile`, and `npm audit`. Run Gateway loopback tests with the
  permitted local loopback environment.

- [x] **Step 2: Review the diff and update the handoff.**

  Record exact outcomes, note the remaining later-stage gaps (profile/editor
  acceptance, MCP, skills, and release readiness), and keep the next action
  focused on the next approved stage. Do not claim those later gates are closed.
