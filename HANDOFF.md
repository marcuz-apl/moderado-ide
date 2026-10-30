# Project Handoff

Updated: 2026-10-30 21:55 UTC
Branch: `master`
Commit: the commit carrying this handoff; `VERSION` holds its identifier
Status: A fresh install connects to the Gateway's keyless free defaults without typing an API key, on top of the earlier account-free stealth-model support. The full suite is green. Latest published release remains v0.1.44; v0.1.46 is built but unreleased.

## Summary

The Gateway's two stealth models are reachable without an account, and the IDE now uses them from the first launch: a profile with nothing saved — or no `config.json` at all — resolves a session-scoped keyless Gateway connection at the production base URL instead of the fake provider. Chat history names chats from their first request and can be cleaned up beyond a configured count.

## Completed

- `extensions/moderado-agent/src/host.ts`: `resolveProvider` starts a profile with no connections, or no profile file, on the Gateway's keyless defaults (`keylessGatewayResolution`): production base URL, `hasApiKey: false`, `defaultModel: 'auto'`, Gateway discovery wired. Nothing is written to the profile, so the next saved connection replaces it. A keyless `auto` request omits `model`, which is how the Gateway applies its pinned defaults.
- A dangling active connection id now falls back to a saved connection instead of reporting the whole profile as malformed; the CLI resolves the same way.
- A profile that cannot be read still fails closed onto the offline fake provider with an explanation, so a broken file is never silently replaced. The offline tests that exercise the fake provider use an unreadable profile now, because a fresh profile reaches the real Gateway.
- Earlier in this line: `GatewayRoute` reads `name`/`section` (a `.strict()` schema without them would have failed all Gateway discovery); keyless `auto` omits `model`; the host refuses only a free route that is not a pinned default; keyless runs record `$0.00`; `#settings-use-free` (**Use free models without an account**) saves a keyless connection; the Dev/Prod choice is written as `gatewayEnvironment`; chats get derived names and a confirmed retention cleanup.

## In progress

- Nothing.

## Working tree

- Clean. `.workbuddy-ai/` is local agent memory and is deliberately not tracked.

## Checks

- `npm test` — 619 passed, 6 skipped, 0 failed. The load-sensitive `config coordination` test passed this run; it remains flaky under the full parallel suite and has failed at upstream `1f7e52b` too.
- `npm run typecheck` — PASS.
- `npm run compile` — PASS; extension bundle at 626 KiB.
- No live Gateway request was made. The catalog shape comes from CLI commit `7cae817` (`v0.4.52+2610291`) and its offline fixtures.

## Decisions and context

- The Gateway's `section: 'default'` marker, not `access`, decides account-free use: a pinned route may be advertised `paid` and still cost nothing. Every other free route still needs a website key.
- The fresh-install connection uses the production Gateway directly rather than probing the development one: the settings pane has an explicit Dev/Prod choice, and a probe would tax every unconfigured run.
- The fake provider is now reachable only through an unreadable profile. That keeps the offline fixture offline; a fresh profile reaching the real Gateway is the intended product behavior for keyless access.
- The vendored packages remain at the older pinned revision, so `ModelInventoryEntry` has no `name`/`section`; the IDE reads both from its own `GatewayRoute`. Advancing the pin (CLI is at v0.4.54 against the pinned v0.4.10) would remove that duplication and may unblock MCP (F8).

## Blockers

- Owner testing of the stealth models against the live Gateway has not been run; no live provider call was made here.
- The load-sensitive coordination test can still fail under the full parallel suite.
- The loopback and local-model-server limitations recorded before this work still apply.

## Next action

1. Owner runs a build and confirms: a fresh profile chats on the free defaults with no key, the picker shows the published stealth names, and the chat records `$0.00`.
2. If a Linux/macOS verification run is wanted, use the GitHub Actions workflow rather than a local build.
3. Publish only after owner acceptance and explicit release authorization.

## Resume notes

- Shared profile implementation: `extensions/moderado-agent/src/profile.ts` and `extensions/moderado-agent/src/coordination.ts`.
- Profile contract and CLI limitations: `docs/PROFILE.md`.
- Gateway catalog contract: CLI commit `7cae817` and `docs/CLOUD_GATEWAY_INTEGRATION.md` in the CLI repository.
- Run extension checks from `extensions/moderado-agent`.
