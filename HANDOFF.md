# Project Handoff

Updated: 2026-10-23 19:45 UTC
Branch: `master`
Commit: `a3fa91c` (pushed to `origin/master`); provider-save fix is locally verified and awaiting commit/push
Status: Prevented Done from aborting provider saves and restored the saved provider/model after closing unsaved API Config edits; next produce an unpublished macOS test artifact in GitHub Actions

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
- Fixed the API Config Done/save interaction: Done is disabled while saving and the host rejects close requests during a save, so it cannot abort key storage or profile persistence. Closing after unsaved provider/model edits restores active context from the shared profile instead of showing a new model beside the old provider.
- Added host regressions for closing with unsaved Moderado selection and clicking Done during a pending Gateway save. Both failed before the fix and pass after it.

## In progress

- Build an unpublished macOS test artifact from the fix through GitHub Actions; owner testing remains pending. No release has been published.
- Cross-app coordinated writes require a separately reviewed CLI change; this IDE task did not modify the sibling CLI repository.

## Working tree

- Source edits are in `extensions/moderado-agent/src/extension.ts`, `src/settings-view.ts`, and `test/settings-host.test.ts`; `HANDOFF.md` records this state. An ignored partial local `build/` checkout remains from the failed local build attempt; the user chose GitHub Actions to avoid more local build downloads.

## Checks

- `npm test -- --run test/settings-view.test.ts test/settings-host.test.ts -t 'hides the duplicate Moderado custom|labels Gateway AUTO|reports the saved config'` — PASS; 3 passed.
- `npm test -- --run test/settings-host.test.ts -t 'shows the known list when switching back'` — PASS; covers discovery requests for both Ollama and LM Studio, including their local `/models` URLs.
- `npm test -- --run test/provider-discovery.test.ts test/model-discovery.test.ts test/settings-host.test.ts` — PASS; 102 passed.
- `npm test -- --run test/settings-host.test.ts test/settings-view.test.ts test/chat-view.test.ts` — PASS; 186 passed, including the two new save/close regressions.
- `npm run typecheck` — PASS.
- `npm run compile` — PASS; extension bundle produced.
- `npm test` — PARTIAL: 575 passed, 6 skipped, 5 failed. All 5 failures are `gateway-login.test.ts` loopback callback tests that could not open listeners in this environment. 25 test files passed and 1 failed.
- GitHub Actions run [#69](https://github.com/marcuz-apl/moderado-ide/actions/runs/39999221002) on `a3fa91c` — macOS arm64 and Intel x64 build, packaging, and artifact upload PASS; Linux and Windows SKIPPED; release publish SKIPPED.
- `moderado-ide-macos-arm64` — 488,294,591 bytes, expires 2026-11-22, artifact archive SHA-256 `86c75868275718a5d699585d09c6f7b45b07c13e51f6a8002d048a2537e2122b`.
- `moderado-ide-macos-x64` — 498,830,593 bytes, expires 2026-11-22, artifact archive SHA-256 `ca645796be35a0ac0b1195fdbbed51d6734aaba86d7019eabbcd7c63bc01fb87`.
- `curl -sS -D - --max-time 3 http://127.0.0.1:11434/v1/models` — FAIL as expected for current state: connection refused; no local Ollama server is accepting requests.

## Decisions and context

- The duplicate is produced by a saved custom provider in `connectProviders.custom`, rendered with a `Custom` tag. The matching duplicate is hidden in the picker but its shared config data is preserved.
- Successful Save status means the config write completed. Model discovery continues independently and cannot replace that status.
- Local model discovery requires the local server to be running. When it is stopped, Settings now names the default Ollama/LM Studio endpoint and tells the user to start the server or correct Base URL; it cannot supply models without that service.
- The IDE profile lock does not protect against CLI writes that ignore it. The CLI's current config save behavior also does not preserve unknown raw fields, as recorded in `docs/PROFILE.md`.
- Latest published stable release remains `v0.1.44+2610236`. The pushed source is `v0.1.44+2610238`; Actions artifacts are unpublished, ad-hoc signed development builds.

## Blockers

- No safe IDE-only solution can guarantee coordinated concurrent IDE/CLI writes. CLI participation needs a separately reviewed CLI change.
- Owner testing of the packaged macOS Settings window has not yet been run.
- Five loopback browser-login tests could not open their listener in this execution environment.
- Ollama is installed on this host but not currently serving models at its default endpoint; a live local model discovery run remains pending.

## Next action

1. Commit and push the verified fix, then dispatch the macOS-only Actions build (artifact only; no publish). Owner tests Moderado save and confirms the chat footer/provider after Done. Publish only after owner acceptance and explicit release authorization. Plan a separate reviewed CLI change if cross-app write coordination is required.

## Resume notes

- Shared profile implementation: `extensions/moderado-agent/src/profile.ts` and `extensions/moderado-agent/src/coordination.ts`.
- Profile contract and CLI limitations: `docs/PROFILE.md`.
- Run extension checks from `extensions/moderado-agent`.
