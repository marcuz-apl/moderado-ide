# Project Handoff

Updated: 2026-10-23 18:10 UTC
Branch: `master`
Commit: `8859c37` (changes prepared for the owner-authorized push)
Status: Settings fixes and local discovery diagnostics implemented; local macOS artifact build is in progress

## Summary

Addressed API Config feedback in the IDE extension. Settings hides the duplicate custom Moderado entry, labels Gateway AUTO `AUTO`, reports config-save completion independently of model refresh, and gives actionable local model-server connection errors. IDE and CLI use `~/.moderado/config.json`; only IDE writers currently coordinate through the IDE lock, so cross-app write safety is not guaranteed.

## Completed

- Filtered duplicate custom provider choices named `Moderado` or `Moderado Custom` in `extensions/moderado-agent/src/settings-view.ts`. The underlying `connectProviders.custom` entry remains in the profile.
- Simplified the Moderado Gateway AUTO model label and decoupled save confirmation from post-save discovery in `extensions/moderado-agent/src/extension.ts`.
- Added focused regression tests in `extensions/moderado-agent/test/settings-view.test.ts` and `extensions/moderado-agent/test/settings-host.test.ts`.
- Verified local provider model discovery through the host and added an explicit LM Studio `/models` endpoint assertion alongside Ollama's existing URL check.
- Improved model discovery network errors to distinguish a stopped local server, OS-blocked local access, DNS lookup failure, and connection timeout. Added regression tests for local refusal and OS denial.
- Confirmed the configured Ollama endpoint `127.0.0.1:11434` refused a local connection during this session; `ollama` executable exists, but the server was not listening.
- Confirmed `profile.ts` derives `.moderado/config.json` from the OS home directory. `coordination.ts` uses `config.json.moderado-lock`; the pinned CLI writer does not participate in this lock.

## In progress

- Review the working diff and run macOS Settings acceptance in the packaged IDE when available.
- Cross-app coordinated writes require a separately reviewed CLI change; this IDE task did not modify the sibling CLI repository.

## Working tree

- Settings source and regression tests plus this handoff are staged for the owner-authorized commit and push. The local artifact build has not started.

## Checks

- `npm test -- --run test/settings-view.test.ts test/settings-host.test.ts -t 'hides the duplicate Moderado custom|labels Gateway AUTO|reports the saved config'` — PASS; 3 passed.
- `npm test -- --run test/settings-host.test.ts -t 'shows the known list when switching back'` — PASS; covers discovery requests for both Ollama and LM Studio, including their local `/models` URLs.
- `npm test -- --run test/provider-discovery.test.ts test/model-discovery.test.ts test/settings-host.test.ts` — PASS; 102 passed.
- `npm run typecheck` — PASS.
- `npm run compile` — PASS; extension bundle produced.
- `npm test` — PARTIAL: 575 passed, 6 skipped, 5 failed. All 5 failures are existing `gateway-login.test.ts` loopback callback tests, which errored opening their loopback listener in this environment. 25 test files passed and 1 failed.
- `curl -sS -D - --max-time 3 http://127.0.0.1:11434/v1/models` — FAIL as expected for current state: connection refused; no local Ollama server is accepting requests.

## Decisions and context

- The duplicate is produced by a saved custom provider in `connectProviders.custom`, rendered with a `Custom` tag. The matching duplicate is hidden in the picker but its shared config data is preserved.
- Successful Save status means the config write completed. Model discovery continues independently and cannot replace that status.
- Local model discovery requires the local server to be running. When it is stopped, Settings now names the default Ollama/LM Studio endpoint and tells the user to start the server or correct Base URL; it cannot supply models without that service.
- The IDE profile lock does not protect against CLI writes that ignore it. The CLI's current config save behavior also does not preserve unknown raw fields, as recorded in `docs/PROFILE.md`.
- Latest published stable release remains `v0.1.44+2610236`; this work is uncommitted and unpublished.

## Blockers

- No safe IDE-only solution can guarantee coordinated concurrent IDE/CLI writes. CLI participation needs a separately reviewed CLI change.
- Real packaged macOS Settings acceptance has not been run.
- Five loopback browser-login tests could not open their listener in this execution environment.
- Ollama is installed on this host but not currently serving models at its default endpoint; a live local model discovery run remains pending.

## Next action

1. Commit and push the source changes, then build a local macOS arm64 artifact for owner testing. Build prerequisites currently include the upstream-pinned Node 24.18.0 and `gsed`; this machine has Node 24.14.1 and no `gsed`. Keep the artifact unpublished. Owner tests with a running Ollama server remain pending. Plan a separate reviewed CLI change if cross-app write coordination is required.

## Resume notes

- Shared profile implementation: `extensions/moderado-agent/src/profile.ts` and `extensions/moderado-agent/src/coordination.ts`.
- Profile contract and CLI limitations: `docs/PROFILE.md`.
- Run extension checks from `extensions/moderado-agent`.
