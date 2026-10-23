# Approval Safety Remediation — Design

**Status:** Owner approved; implemented

## Intent

Close the approval gaps found in the IDE host: a truncated proposed change must
not count as a complete preview, a human-gated file mutation must not be
approvable when its full preview cannot be shown, and canceled approvals must
release retained preview data. Remove the unused `moderado.requireApprovalByDefault`
editor setting so the category controls remain the only exposed auto-approval
policy.

## Approaches

1. **Fail closed (selected):** preserve the current webview review flow, deny a
   human-gated file mutation if its preview was truncated or no review surface
   is available, and clean up pending state on every completion path. Large
   writes must be split until a complete preview can be displayed. Existing
   category-based auto-approval remains unchanged; those actions are not human
   approval requests.
2. **Add a review surface:** build a dedicated editor or panel flow that can
   display large changes and support decisions even when the chat view is not
   open. This preserves large writes but adds view lifecycle and interaction
   complexity.

The selected approach is the smallest one that enforces the existing
fail-closed requirement without changing the product's auto-approval defaults.

## Behavior

- A preview capped by the host is marked as incomplete using a stable internal
  truncation marker. `hasCompletePreview()` rejects that preview for
  `write_file`, `edit_file`, and `apply_patch`; the shared contract schema and
  vendored source are not changed.
- If a human approval is needed for a file mutation but the chat review surface
  is unavailable, the host denies it with an actionable explanation. It does
  not present an Allow action without showing the complete change. Human-gated
  commands may continue through the native modal, with the argument array shown
  unambiguously and the working directory included.
- Completion, cancellation, and view disposal remove the request from both
  pending-approval maps and clear associated view state.
- Multi-file patch approval cards list every affected path derived from the
  generated diff headers, in addition to the full-change preview action.
- Remove `moderado.requireApprovalByDefault` from contributed settings. Keep
  the existing Auto-Approve category defaults and behavior unchanged.

## Boundaries

- No runtime dependencies, CLI edits, profile-format changes, MCP work, skills
  injection, release work, or published artifacts.
- Auto-approved actions retain the existing explicit category policy; this
  design changes only actions that require a human decision.
- Native editor and CLI interoperability checks belong to later phases.

## Acceptance evidence

Offline tests must prove oversized write, edit, and patch previews are denied;
complete previews remain approvable; a human-gated mutation with no review view
is denied; modal commands show exact args and cwd; and cancellation/view close
remove pending request state. The focused approval/host/settings tests and the
extension suite, typecheck, and compile must pass.
