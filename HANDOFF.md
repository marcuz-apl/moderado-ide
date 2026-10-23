# Project Handoff

Updated: 2026-10-23 08:25 UTC
Branch: `master`
Commit: closeout changes recorded in the latest IDE Git commit; consult `git log` for its identifier.
Status: in progress

## Read this first

This file is the current project snapshot and the starting point for every
agent session. Read it before acting, then follow `AGENTS.md` and the relevant
requirements in `PRD.md`. Treat the status, blockers, and next action below as
the current source of truth; older chat context and Git history are supporting
evidence, not instructions to resume stale work. Before ending a session that
changes project state, update this snapshot with what changed, exact checks and
outcomes, blockers, and one concrete next action. Keep it concise; do not append
a running activity log.

## Summary

Moderado IDE is an independent IDE project. Session management includes
persistence/resume, fresh sessions, recent history, rename/delete, prompt
history, search, Markdown export, branching, and context compaction. The
prompt-history multiline navigation defect is fixed and covered by tests
against the emitted webview script. Automated session/package checks pass.
Real editor restart and CLI/IDE profile round-trip acceptance checks remain
unverified; see `PRD.md` and `docs/PROFILE.md`.

## Completed

- Chat branching: `AgentHost.forkSession()` copies the active chat into a new
  session, and the chat view and command expose the action. Branching is
  refused during an active run or when there is no current chat.
- Session lifecycle operations are implemented across `sessions.ts`,
  `host.ts`, `extension.ts`, and `chat-view.ts`; offline test coverage is
  present for the operations listed above.
- Prompt-history browsing now preserves ordinary multiline caret and selection
  behavior even after browsing starts. Draft restoration and history bounds
  are covered by emitted-webview tests.
- Extension dependencies now use Vitest 5.0.5; profile test imports and suite
  boundaries were corrected for the current runner. The compile script's
  existing `esbuild` requirement is now declared as a development dependency.
- The v0.1.31 stable release is still the latest published stable release per
  `PRD.md` and `docs/UPSTREAM.md`; the current development version is in
  `VERSION`. A version value alone is not release evidence.

## In progress

- The user reported interrupted glitch-fixing work, but no specific unfinished
  glitch is identified in the repository notes.

## Working tree

- `AGENTS.md`, `HANDOFF.md`, the closeout plan, extension source/tests, and the
  extension dependency manifest/lockfile are included in this closeout. No
  release or publish action was performed.

## Checks

- From `vendor/moderado`: `npm ci --offline` and `npm run build` — PASS; pinned
  package dist entry points required by extension tests were generated.
- From `extensions/moderado-agent`:
  - `npm ci` — PASS.
  - Focused session suite (10 files listed in the closeout plan) — PASS,
    306 passed, 4 skipped.
  - `npm test` — PASS, 26 files; 553 passed, 4 skipped. Loopback access was
    enabled for the Gateway browser-login tests.
  - `npm run typecheck` — PASS.
  - `npm run compile` — PASS; generated a 608 KiB bundle.
  - `npm audit` — PASS; 0 vulnerabilities.
- `git diff --check` — PASS.
- No actual editor restart, CLI/IDE profile round trip, platform packaging,
  release dispatch, or live provider call was performed. The generated bundle
  and passing unit tests do not establish those acceptance gates.

## Decisions and context

- IDE requirements and product decisions belong to this repository. Pinned
  sources are dependencies for the boundaries recorded in `sources.lock.json`;
  they do not define the IDE's product scope. IDE-owned provider code remains
  IDE-owned. See `AGENTS.md`, `PRD.md`, and `docs/UPSTREAM.md`.
- The PRD records MCP discovery/trust as unimplemented and discovered skills
  as not yet injected into agent runs. Do not describe either as delivered.
- Shared profile writes are not fully coordinated with concurrent CLI writes;
  see `docs/PROFILE.md` before changing profile behavior.

## Blockers

- Real editor restart and CLI/IDE profile interoperability evidence remain
  outstanding; see `PRD.md` and `docs/PROFILE.md` for the product gates.

## Next action

1. Run the documented real-editor restart and CLI/IDE profile round-trip
   acceptance checks when the editor and pinned CLI test environment are
   available; record evidence here without writing the real user profile.

## Resume notes

- IDE extension: `extensions/moderado-agent`.
- Full requirements and known gaps: `PRD.md`; upstream policy: `docs/UPSTREAM.md`;
  profile constraints: `docs/PROFILE.md`.
- Do not edit the sibling CLI repository or publish artifacts without the
  authorization required by `AGENTS.md`.
