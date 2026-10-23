# Project Handoff

Updated: 2026-10-23 09:28 UTC
Branch: `master`
Commit: `0082708` (`v0.1.43+2610232 fix: harden human approval previews and path review`)
Status: in progress — bounded skills integration is implemented; pinned profile fixtures pass; MCP and real-editor gates remain open

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
Skills are injected through the pinned core's read-only `load_skill` tool only
when listed in shared `enabledSkills`; discovery rejects symlinks and enforces
per-file, count, and aggregate content limits. Pinned-source profile tests now
pass; clean dependency reproduction and real editor restart remain open. See
`PRD.md` and `docs/PROFILE.md`.
The owner-approved fail-closed approval remediation design is at
`docs/superpowers/specs/2026-10-23-approval-safety-design.md`. The fail-closed
approval work is implemented: capped previews are rejected for human-gated
file changes, file mutations deny when the review webview is unavailable,
command modals show exact argument arrays and working directories, pending
preview state is cleared on cancellation, and the unused approval-default
setting was removed. Multi-file patch cards list all paths from generated diff
headers. See the implementation plan at
`docs/superpowers/plans/2026-10-23-approval-safety.md`.

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

- The owner-approved design and plans are saved in `docs/superpowers/specs/2026-10-23-profile-mcp-skills-acceptance-design.md` and `docs/superpowers/plans/`.
- Skills integration is implemented in IDE-owned profile and host code. Only
  validated names in shared `enabledSkills` are provided through core's
  read-only loader; skill contents remain advisory and bounded.
- MCP discovery/trust is still open. The current pinned tools transport cannot
  accept a host-supplied sanitized child environment, including removal of
  dynamically named provider keys. Do not launch MCP servers until a separate
  reviewed shared-tools API is pinned and tested. Do not edit the sibling CLI
  or generated vendor packages as a workaround.
- The adjacent CLI checkout is v0.4.34. Pinned interop ran against a temporary
  checkout at `a3479fffc6e00ca8796893920930a258759243c5`; its build used the
  adjacent checkout's installed dependency tree because offline npm install
  lacked a cached package. Re-run with clean pinned dependencies for stronger
  evidence. No `code`, `codium`, or Moderado editor application was found, so
  real editor restart acceptance remains open.
- The first sandboxed dependency audit could not reach the registry; an
  authorized rerun completed successfully with zero reported vulnerabilities.

## Verification this stage

- `npx vitest run test/approval.test.ts test/settings-host.test.ts test/settings-preferences.test.ts` — passed (focused baseline: 85 tests).
- New cancellation test was observed failing before the fix; focused lifecycle rerun `npx vitest run test/settings-host.test.ts test/approval.test.ts` passed (85 tests).
- Focused approval card suite: `npx vitest run test/chat-view.test.ts` — passed (87 tests; new multi-file path test failed before implementation).
- `npm test` with local loopback access — passed (26 files, 562 passed, 4 skipped).
- `npm run typecheck` — passed.
- `npm run compile` — passed (609 KiB bundle).
- `npm audit` first failed because registry DNS was unavailable; rerun with
  network access passed (0 vulnerabilities).
- `git diff --check` — passed.
- `MODERADO_CLI_ROOT=/private/tmp/moderado-cli-pinned npm run test:profile-interop`
  from `extensions/moderado-agent` — passed, 52 tests against the pinned CLI
  commit. The build dependency caveat above applies.
- Focused host/profile run with the pinned CLI root — passed, 118 tests.
- Full `npm test` — passed, 26 files; 568 passed, 6 skipped. This run had
  loopback access for the existing Gateway callback tests.
- `npm run typecheck` — passed.
- `npm run compile` — passed; 613 KiB bundle.
- `git diff --check` — passed after the documentation and plan updates.
- Real editor close/reopen — unavailable; this host has no editor binary or
  app bundle. This remains an acceptance gate, not a pass.
- `npm ci --offline` in the pinned CLI temporary checkout — unavailable because
  `yargs-parser@20.2.9` was not cached; no sibling files were modified.

## Working tree

- The approved design/plans, skills changes, interoperability runner, docs, and
  HANDOFF updates are uncommitted. `.git` is read-only in this environment, so
  an isolated implementation worktree could not be created. No release or
  publish action was performed.

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
- The PRD records MCP discovery/trust as unimplemented; the Use MCP servers
  category affects approval classification only because no MCP tools are
  registered. Skills are injected only via enabled names and read-only
  `load_skill`.
- Shared profile writes are not fully coordinated with concurrent CLI writes;
  see `docs/PROFILE.md` before changing profile behavior.

## Blockers

- Clean dependency reproduction for the pinned CLI and real editor restart
  evidence remain outstanding; MCP also needs the separately reviewed safe
  environment injection API before any server can launch.

## Next action

1. Obtain a reviewed shared-tools environment-injection API and advance the
   IDE pin only after review; then implement explicit MCP trust and test with a
   fake server. Rebuild the pinned CLI with its lockfile dependencies and run
   profile interop, then repeat close/reopen using a real packaged editor and
   isolated state directories.

## Resume notes

- IDE extension: `extensions/moderado-agent`.
- Full requirements and known gaps: `PRD.md`; upstream policy: `docs/UPSTREAM.md`;
  profile constraints: `docs/PROFILE.md`.
- Do not edit the sibling CLI repository or publish artifacts without the
  authorization required by `AGENTS.md`.
