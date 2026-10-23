# IDE Config Coordination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make concurrent IDE writes to shared `config.json` merge without false conflicts and make lock recovery safe.

**Architecture:** Keep one IDE-side coordinated writer. Store process ownership in the lock, use a separate exclusive reaper claim and token recheck before reclaiming dead-owner locks, and compare only the nested fields each settings action owns. Document that external writers need the same protocol.

**Tech Stack:** TypeScript, Node.js filesystem/process APIs, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-23-ide-config-coordination.md`

## Global Constraints

- Never write the real user's `~/.moderado` in automated tests; use temporary fixtures.
- Preserve known and unknown `config.json` fields; refuse corrupt data.
- Do not edit the CLI repository or add runtime dependencies.
- External writers that ignore the IDE lock remain outside the cross-process guarantee.
- Do not claim packaged editor restart acceptance; owner will check that through GitHub Actions after release.

---

### Task 1: Reproduce field-level and process races

**Files:** `extensions/moderado-agent/test/profile.test.ts`, `extensions/moderado-agent/src/coordination.ts`

- [x] Add a nested expected-value test where changing a different connection does not conflict, while changing the targeted connection does.
- [x] Run the focused config coordination tests and confirm the unrelated-connection case fails.
- [x] Add a child-process test that starts two IDE writer processes against one temporary config and asserts both independent connection updates survive.
- [x] Run that focused test and confirm it exposes the intended behavior.

### Task 2: Harden lock ownership and recovery

**Files:** `extensions/moderado-agent/src/coordination.ts`, `extensions/moderado-agent/test/profile.test.ts`

- [x] Write failing tests that an old lock owned by a live process is preserved, a dead-owner lock is reclaimed only through the exclusive reaper claim, and unknown lock metadata fails closed.
- [x] Implement owner PID/token metadata and recheck the token after acquiring `${lockFile}.reap`; age alone must never remove a lock.
- [x] Ensure a reaper claim is released in `finally`, and failure to prove stale ownership returns a bounded conflict with manual recovery guidance.
- [x] Run the focused coordination tests and confirm all lock tests pass.

### Task 3: Scope settings conflicts to owned values

**Files:** `extensions/moderado-agent/src/extension.ts`, `extensions/moderado-agent/test/settings-host.test.ts`

- [x] Add host tests that assert save compares only `connections[id]` plus the top-level active/default model fields it updates.
- [x] Add tests that remove/use connection operations refuse stale same-ID changes while preserving unrelated connection changes.
- [x] Run focused host tests and confirm failures before implementation.
- [x] Pass `expected` values at each write: targeted connection record for save/remove/use, and active/default values only where changed; preserve current nested merge behavior.
- [x] Rerun focused host tests.

### Task 4: Align docs and verify

**Files:** `PRD.md`, `docs/PROFILE.md`, `docs/INSTALL.md`, `HANDOFF.md`

- [x] Replace one-sided CLI-specific conflict claims with the IDE writer protocol and external-writer limitation; keep shared filename as `config.json`.
- [x] Record owner-run packaged editor restart acceptance through GitHub Actions after release.
- [x] Run focused profile and host tests, full extension tests, typecheck, compile, and `git diff --check`; record exact outcomes in `HANDOFF.md`.
