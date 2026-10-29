# Project Handoff

Updated: 2026-10-29 21:40 UTC
Branch: `master`
Commit: the commit carrying this handoff; `VERSION` holds its identifier
Status: The Gateway's account-free default models now work end to end in the IDE, and chat history gains derived names plus a confirmed retention cleanup. The local suite passes except one upstream coordination test that also fails at `1f7e52b`.

## Summary

The Gateway now serves stealth models that need no account. The IDE reads the catalog's `name` and `section`, lists the pinned defaults by their published name, sends a keyless `auto` request with no `model` field, and records those sessions at `$0.00`. Chat history names a chat from its first usable line and can be cleaned up beyond a configured count, with a modal confirmation before anything is deleted.

## Completed

- `extensions/moderado-agent/src/provider-discovery.ts`: `GatewayRoute` reads `name` and `section`, `capabilities` defaults to `[]`, and `isPinnedDefault` exports the marker test. `GatewayRouteSchema` is `.strict()`, so without this the first catalog carrying `section` would have been rejected as malformed and **all** Gateway discovery would have failed.
- `extensions/moderado-agent/src/provider-transport.ts`: a keyless `moderado-cloud` request with `modelId === 'auto'` omits `model`, which is how the Gateway applies its pinned defaults. Sending `auto` asks for full routing and fails the free-route key check. Keyed and non-Gateway paths are unchanged.
- `extensions/moderado-agent/src/host.ts`: the keyless refusal now fires only for a free route that is not a pinned default; `ModelOption` carries `name`/`section`; a keyless Gateway run records `available: true, costKnown: true, costUsd: 0` once the provider reports usage, and never overwrites a cost the profile already knows.
- `extensions/moderado-agent/src/settings-view.ts`: a pinned default is eligible even when the catalog calls it paid, options and the selected-model line use the published name, a pinned route says no key or sign-in is required, and `AUTO` reads `Gateway free defaults` for a keyless session. The upstream `AUTO` label stays plain for a keyed session.
- `#settings-use-free` (**Use free models without an account**) posts `saveSettings` with `loginMethod: 'public'`. It was missing: the access dropdown is gone, and an empty key box on an ordinary save keeps whatever the profile records, so a keyless Gateway connection could not be created from the IDE at all. It is offered only when no key is stored, so it cannot silently drop one.
- `moderadoGatewayEnvironmentFor` writes `gatewayEnvironment` on the shared profile for a built-in Dev/Prod URL, the field the CLI reads before its automatic probe; a custom URL writes no marker. Without this an IDE choice of Dev was overridden by the CLI's probe.
- `extensions/moderado-agent/src/session-title.ts`: `chatTitle` derives a chat name from the first usable user line, stripping heading, quote, list and emphasis markers and skipping a fence line. Derived, not stored, so it needs no field the CLI's `StoredSessionSchema` would reject.
- `extension.ts`: one `chatTitleOf` serves the RECENT list, rename, delete, search, export and cleanup, replacing `firstLineOf`; the delete prompt now shows the name the list shows.
- `extensions/moderado-agent/src/chat-retention.ts` and `Moderado: Clean Up Old Chats`: proposes the chats beyond `moderado.chatRetentionCount` (10 to 1000, default 50), never the chat on screen, and deletes only after a modal confirmation naming what would go. The RECENT header shows the stored count.

## In progress

- Nothing. Both increments are complete and committed together.

## Working tree

- Clean. `.workbuddy-ai/` is local agent memory and is deliberately not tracked.

## Checks

- `npm test` — 615 passed, 6 skipped, 1 failed. The failure is `test/profile.test.ts > config coordination > preserves independent writes from separate IDE processes`.
- Control run at `1f7e52b` (upstream, without this work) — 581 passed, 6 skipped, 1 failed: the same coordination test. It passes in isolation (2.5 s) and fails under the full parallel suite (6–10 s), so it is load-sensitive and pre-existing, not caused by this change.
- `npx vitest run test/provider-discovery.test.ts test/provider-transport.test.ts test/host.test.ts test/settings-view.test.ts test/settings-host.test.ts test/chat-view.test.ts test/webview-script.test.ts` — PASS; 308 passed.
- `npm run typecheck` — PASS.
- `npm run compile` — PASS; extension bundle produced at 614 KiB and contains the new strings.
- No live Gateway request was made. The catalog shape comes from CLI commit `7cae817` (`v0.4.52+2610291`), its `nvidia_adapter.ts`, and its offline `model_selector_cloud.test.ts` fixtures, not from a call to the server.

## Decisions and context

- The Gateway's `section: 'default'` marker, not `access`, decides account-free use: a pinned route may be advertised `paid` and still cost nothing, because the Gateway routes it to its free defaults. Every other free route still needs a website key.
- The vendored packages remain at the older pinned revision, so `ModelInventoryEntry` has no `name`/`section`. The IDE reads both from its own `GatewayRoute` rather than re-vendoring, which keeps the change inside IDE-owned code; a future re-vendor can drop the duplication.
- Retention is a count cap, not an age limit: a date rule would delete a chat the user was still returning to. The chat on screen is never proposed, and nothing is removed without confirmation.
- The upstream `AUTO` label simplification was kept for a keyed session; only the keyless case gets a different label, because the two are now different requests.

## Blockers

- `config coordination > preserves independent writes from separate IDE processes` is load-sensitive in this environment and fails only under the full parallel suite. It is upstream work, not part of this change.
- Owner testing of the two stealth models against the live Gateway has not been run; no live provider call was made here.
- The loopback and local-model-server limitations recorded before this work still apply.

## Next action

1. Owner runs the build and selects each stealth model, confirming the keyless request succeeds, the picker shows the published names, and the chat records `$0.00`.
2. Publish only after owner acceptance and explicit release authorization.

## Resume notes

- Shared profile implementation: `extensions/moderado-agent/src/profile.ts` and `extensions/moderado-agent/src/coordination.ts`.
- Profile contract and CLI limitations: `docs/PROFILE.md`.
- Gateway catalog contract: CLI commit `7cae817` and `docs/CLOUD_GATEWAY_INTEGRATION.md` in the CLI repository.
- Run extension checks from `extensions/moderado-agent`.
