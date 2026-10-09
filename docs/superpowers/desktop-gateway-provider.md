# Moderado IDE Gateway and Provider Integration

> Historical design and implementation record. The design was approved on
> October 6, 2026; implementation is complete. The plans below are archival,
> not an active checklist. Current product and release status is in `PRD.md`,
> `HANDOFF.md`, and `docs/INSTALL.md`.

## Design specification
**Date:** 2026-10-06
**Status:** Approved by owner on 2026-10-06
**Reference behavior:** Moderado CLI `v0.4.8`
**Desktop package baseline:** Keep the current pinned contracts, core, tools, and vendored source snapshot.

### Goal

Give Moderado Desktop a GUI connection and model-selection flow modeled on the
CLI `v0.4.8` Gateway and provider behavior, while keeping Gateway/provider
policy and transport owned by the Desktop repository. The Desktop remains a
separate application and repository. No source, configuration, or Git state in
the sibling CLI repository is changed.

### Current state

- Desktop already has a VS Code sidebar with recent sessions, task composer,
  Plan/Act modes, an approval panel, and a provider/model Settings view.
- The Settings view uses the current vendored provider presets, discovery,
  adapter transport, and cost policy. It does not have a Gateway login flow.
- `AgentHost` currently resolves the selected connection and discovers models,
  but `startRun` does not pass the saved model selection to the core. A model
  chosen in Settings therefore does not reliably become the model used by a
  run.
- The Desktop is pinned to CLI `v0.3.10` package sources. This design keeps that
  pin and does not vendor CLI `v0.4.8` packages.
- The local Gateway at `http://127.0.0.1:4788` returns an OpenAI-style list
  whose `data` entries include route `id`, `provider`, `owned_by`,
  `capabilities`, and `data_note`.

### Ownership and boundaries

Desktop-owned provider code will own:

- Gateway and direct-provider preset metadata and connection validation.
- Gateway public/browser/manual login flow, including browser callback
  validation and credential persistence.
- Model discovery and validation for Gateway and direct-provider catalogs.
- Cost classification, free-first eligibility, AUTO ranking, and route pinning
  adapted from CLI `v0.4.8` behavior.
- OpenAI-compatible request and streaming transport, including response/error
  validation and cancellation.

The existing pinned contracts, provider-neutral core agent loop, and tools
remain in use. The Desktop injects its own provider adapter and router through
the existing host boundary. No new runtime dependency is introduced; transport
uses the existing Node/TypeScript platform facilities. The Desktop-specific
ownership exception will be recorded in contributor documentation so the
provider-ownership rule cannot silently drift back to a CLI package update.

The webview receives display-safe provider/model data only. Manual API keys are
collected with a native host-side password prompt; no secret is rendered into
the webview DOM or sent in a webview message. API keys and OAuth tokens remain
in the extension host and Windows Credential Manager. Model content and
provider responses are untrusted and validated at their boundary.

### Gateway behavior

1. The Gateway is a first-class connection alongside direct BYOK and local
   providers. Its settings flow offers public keyless access, browser sign-in,
   and manual `mrd_…` key entry.
2. Desktop resolves the Gateway URL from the saved connection, with the local
   development endpoint `http://127.0.0.1:4788/v1` available for the current
   development setup and the production endpoint retained as the normal
   service default.
3. `GET <baseUrl>/models` is validated before use. The Gateway-specific model
   picker includes an `auto` option and all returned route IDs. It preserves
   provider, owner, capability, and data-note fields for display.
4. The owner has confirmed that every route in this Gateway catalog is free.
   Desktop labels every discovered Gateway route Free on that explicit
   provider-level rule; it does not infer or invent per-model prices.
5. Selecting `auto` sends `model: "auto"` so Gateway routing remains server
   controlled. Selecting a route sends that exact route ID. Gateway errors are
   surfaced to the user; Desktop does not silently switch a pinned route or
   attempt its own fallback after Gateway AUTO.
6. Browser authorization uses state, PKCE S256, and a one-time loopback
   callback. Manual keys and exchanged access tokens are stored through the
   Windows Credential Manager reference for `moderado-cloud`; OAuth expiry is
   retained so expired login can be explained and retried.

### Direct provider behavior

The GUI offers NVIDIA NIM, OpenRouter, Agnes AI, OrcaRouter, Ollama, LM Studio,
and a custom OpenAI-compatible endpoint. Desktop-owned preset metadata supplies
the existing endpoint/key requirements and local-runtime handling.

- AUTO filters unsupported models, allows confirmed free/trial and local
  models by default, and excludes paid/unknown models unless the matching
  setting is explicitly enabled.
- AUTO ranks free/trial before local, then explicitly allowed paid/unknown
  candidates, and can fall back among eligible direct-provider candidates using
  the core's existing retry boundary.
- An explicit model choice pins that model and disables AUTO switching.
- Provider-level free declarations are scoped to the selected connection.
  Reported nonzero or invalid prices override a free declaration.
- OpenRouter free models use catalog pricing evidence; NVIDIA NIM and Agnes AI
  use their declared free-catalog policy; OrcaRouter uses its exact trailing
  `free` marker; local providers are local. Other providers receive no free
  inference from names alone.

### GUI flow

Use the Cline screenshots as interaction references, not pixel targets:

- Chat remains in the Moderado activity-bar sidebar, with recent sessions,
  task composer, active workspace/provider/model context, and Plan/Build mode.
- Settings groups Moderado Gateway login and direct provider configuration.
  Gateway offers public, browser, and manual-key choices. Direct providers
  include the four hosted presets, two local runtimes, and custom endpoint.
- Manual Gateway and direct-provider keys are entered through native host-side
  password prompts. The webview shows only whether a credential is stored.
- The model picker supports Gateway `auto` plus searchable Gateway routes, and
  direct-provider AUTO plus the existing Recommended/Free list organization.
  Provider, model, cost class, and available catalog notes are shown without
  fabricated context-size or pricing metadata.
- A selected model is persisted using the coordinated shared-config writer and
  passed to each run. The current connection/model is visible in the composer
  footer or its accessible equivalent.
- Approval controls retain Desktop's deny-by-default behavior. No provider or
  visual reference changes the requirement for a complete preview and a human
  decision before mutations and commands.

### Profile and credential behavior

- Reuse existing `~/.moderado/config.json` connection shapes where possible so
  the CLI can read the resulting Gateway/direct-provider profiles.
- Preserve unknown configuration fields and use the existing coordinated
  writer. Do not replace corrupt config with defaults or migrate data silently.
- Keep key values out of the webview, VS Code settings, logs, and child
  environments. Windows secrets use Credential Manager references; tests use
  isolated homes and fake credential stores.
- Keep provider/model choices in the shared config only where the current CLI
  schema supports them; do not add a profile schema migration for Desktop-only
  display state.

### Error handling and security

- Bound discovery and inference requests and support cancellation.
- Reject malformed model responses at the provider boundary and show an
  actionable error without logging credentials or untrusted response bodies.
- Redact API keys and bearer tokens in status text and output logs.
- Validate Gateway URL and custom endpoints; allow HTTP only for loopback and
  require HTTPS for remote endpoints.
- Validate OAuth state, PKCE verifier/challenge, exact loopback callback path,
  and one-time authorization code. Fail closed on callback mismatch or expiry.
- Preserve the existing core approval handler, workspace jail, tool registry,
  profile coordination, and session conflict behavior.

### Verification

Offline tests will use injected fetch implementations or local fake servers and
isolated profile fixtures. They will cover:

1. Gateway response validation, all returned routes, Gateway Free labeling,
   `auto` versus pinned request models, and error/cancellation behavior.
2. Public, browser, and manual Gateway setup; valid/invalid OAuth state and
   callback; credential reference resolution without renderer exposure.
3. Direct provider discovery and free-first eligibility/ranking for OpenRouter,
   NVIDIA NIM, Agnes AI, OrcaRouter, Ollama, LM Studio, and custom endpoints;
   paid/unknown opt-in and nonzero-price precedence.
4. Settings model selection reaching the agent run, persistence through
   coordinated profile writes, and session model identity.
5. Existing approval, profile, session, and host security suites.
6. Typecheck/build and a real editor-host smoke flow when the pinned editor
   build/runtime is available. Live inference remains an explicit opt-in and is
   not run in CI.

The implementation must record exact focused and package-wide commands and
outcomes in `HANDOFF.md`. Do not claim an IDE artifact or editor-host pass until
that artifact or host flow has actually been produced.

### Acceptance criteria

- Gateway login and route discovery work from the GUI against the local
  Gateway; all its discovered routes are visibly Free and `auto` remains a
  distinct routing option.
- Direct-provider selection mirrors the CLI `v0.4.8` cost and AUTO policy for
  the providers listed above.
- Model choice in Settings controls the model sent for the next run, and
  selected Gateway route IDs are preserved exactly.
- Desktop-owned Gateway/provider transport and routing do not require the
  sibling CLI repository or CLI executable at runtime.
- Existing approval, workspace jail, credential, profile, and session
  boundaries continue to hold.
- No Desktop installer, package, update manifest, or public release is
  published as part of this work.

## Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Cline-inspired GUI for Moderado Gateway and direct provider model selection, with Desktop-owned transport and routing that follows CLI `v0.4.8` behavior.

**Architecture:** Keep the pinned `@moderado/contracts`, `@moderado/core`, and `@moderado/tools` packages and the shared agent loop. Add Desktop-owned provider catalog, auth, model discovery, HTTP/SSE transport, and a `Router` subclass injected into the existing host boundary. Pass the saved GUI model choice to each run so Gateway `auto`, pinned Gateway routes, direct-provider AUTO, and direct-provider pins have distinct behavior.

**Tech Stack:** TypeScript 5.7, Node.js 20 extension host APIs, VS Code Webview, `fetch`, Node `http`/`crypto`, existing Zod/contracts types, Vitest, esbuild.

**Design reference:** the Design specification section above.

### Global Constraints

- Do not modify, reset, commit, tag, or publish the sibling CLI repository.
- Keep Desktop's existing Moderado source pin; do not vendor CLI `v0.4.8` packages.
- Desktop owns Gateway and direct-provider transport, model policy, and routing; no CLI executable or sibling source is needed at runtime.
- Use no new runtime dependencies.
- Every model returned by the owner's Gateway catalog is Free; Gateway AUTO sends `model: "auto"`, and a pinned route sends its exact returned ID.
- Direct providers use free-first AUTO; paid and unknown-cost models require their existing explicit opt-ins, and reported nonzero/invalid price overrides a free declaration.
- Manual provider keys use native host-side password prompts. Provider keys and OAuth tokens stay in the extension host and Windows Credential Manager; never put secrets in the webview DOM/messages, logs, editor settings, or child processes.
- Preserve shared profile data, unknown config fields, coordinated writes, and the existing fail-closed approval, workspace jail, and session-conflict behavior.
- HTTP is allowed only for loopback; remote provider endpoints use HTTPS.
- Do not publish installers, manifests, or packages.

---

### File map

| File | Responsibility |
|---|---|
| `extensions/moderado-agent/src/provider-catalog.ts` | Desktop-owned provider presets, connection validation, and provider-scoped free policy. |
| `extensions/moderado-agent/src/provider-discovery.ts` | Validated model-list parsing and Gateway route metadata. |
| `extensions/moderado-agent/src/provider-transport.ts` | Desktop-owned OpenAI-compatible request, SSE parsing, errors, timeout, and cancellation. |
| `extensions/moderado-agent/src/model-router.ts` | CLI `v0.4.8` classification, free-first routing/fallback, and Gateway AUTO semantics, injected through the core `Router` interface. |
| `extensions/moderado-agent/src/gateway-login.ts` | Public, browser PKCE, and manual-key Gateway login flow. |
| `extensions/moderado-agent/src/provider-setup.ts` | Existing settings-form connection construction, adapted to Desktop-owned presets. |
| `extensions/moderado-agent/src/credentials.ts` | Existing Credential Manager abstraction and provider credential references. |
| `extensions/moderado-agent/src/host.ts` | Provider construction, model discovery, per-run model choice, and Desktop router injection. |
| `extensions/moderado-agent/src/settings-view.ts` | Escaped Settings markup and form parsing for Gateway and direct providers. |
| `extensions/moderado-agent/src/chat-view.ts` | Active connection/model display and existing recent-session/composer presentation. |
| `extensions/moderado-agent/src/extension.ts` | VS Code commands, login callback, Settings actions, selected-model persistence, and run wiring. |
| `extensions/moderado-agent/test/provider-catalog.test.ts` | Preset, endpoint, auth requirement, and free-policy tests. |
| `extensions/moderado-agent/test/provider-discovery.test.ts` | Gateway and direct catalog validation tests. |
| `extensions/moderado-agent/test/provider-transport.test.ts` | Fake-fetch and SSE transport tests. |
| `extensions/moderado-agent/test/model-router.test.ts` | Gateway AUTO/pin and direct-provider routing tests. |
| `extensions/moderado-agent/test/gateway-login.test.ts` | Login choice, PKCE, callback, timeout, and credential-reference tests. |
| Existing `provider-setup.test.ts`, `host.test.ts`, `settings-view.test.ts` coverage inside `model-discovery.test.ts`, and `chat-view.test.ts` | Extend existing provider, host, webview, and chat regression coverage. |
| `AGENTS.md`, `PRD.md`, `docs/UPSTREAM.md`, `docs/PROFILE.md`, `HANDOFF.md` | Record the approved Desktop provider-ownership boundary, parity target, profile behavior, and exact verification outcomes. |

### Task 1: Define Desktop-owned provider presets and cost policy

**Files:**

- Create: `extensions/moderado-agent/src/provider-catalog.ts`
- Create: `extensions/moderado-agent/test/provider-catalog.test.ts`
- Modify: `extensions/moderado-agent/src/provider-setup.ts`
- Modify: `extensions/moderado-agent/test/provider-setup.test.ts`

**Interfaces:**

- `DesktopProviderPreset`: `{ id: string; label: string; kind: 'nvidia-nim' | 'openai-compatible'; baseUrl: string; requiresApiKey: boolean; freeCatalog?: boolean; freeIdSuffixes?: readonly string[]; local?: boolean }`.
- `DESKTOP_PROVIDER_PRESETS`: NVIDIA NIM, OpenRouter, Agnes AI, OrcaRouter, Ollama, LM Studio, custom OpenAI-compatible, and Moderado Gateway.
- `isDesktopFreeModel(entry, providerId)`: recognizes zero-priced entries, explicit provider free catalogs, OrcaRouter's exact trailing `free` segment, and local models; nonzero or invalid price always returns false.
- `buildProviderChoices` and `buildProviderConnection` continue to be the Settings-facing functions but read Desktop-owned preset data.

- [ ] **Step 1: Write failing catalog and policy tests**

Add cases that assert all eight provider choices exist, Gateway is keyless unless a user chooses a credential, local runtimes do not require keys, and unsupported remote HTTP endpoints are rejected. Add policy cases for zero price, nonzero price overriding `freeCatalog`, Agnes/NVIDIA free catalogs, `orcarouter/free`, `orcarouter/notfree`, and local Ollama.

```ts
it('keeps a nonzero advertised price paid even for a free catalog', () => {
  expect(isDesktopFreeModel(
    { id: 'model-a', pricing: { prompt: '0.1', completion: '0' } },
    'agnes-ai',
  )).toBe(false);
});
```

- [ ] **Step 2: Run the new tests and confirm the missing Desktop catalog API fails**

Run from `extensions/moderado-agent`: `npm test -- test/provider-catalog.test.ts test/provider-setup.test.ts`.

Expected: FAIL because `provider-catalog.ts` and its exports do not exist yet.

- [ ] **Step 3: Implement the preset table, validation, and free predicate**

Add the fixed endpoint metadata for NVIDIA NIM (`https://integrate.api.nvidia.com/v1`), OpenRouter (`https://openrouter.ai/api/v1`), Agnes AI (`https://apihub.agnes-ai.com/v1`), OrcaRouter (`https://api.orcarouter.ai/v1`), Ollama (`http://127.0.0.1:11434/v1`), and LM Studio (`http://127.0.0.1:1234/v1`). Gateway defaults to the saved connection URL, then `https://mod.alfazen.org/v1`; expose the owner-provided development URL `http://127.0.0.1:4788/v1` in the Gateway settings flow. Custom remote endpoints require HTTPS.

Use exact IDs and trailing-segment checks for free aliases. Never infer free status from a broad substring. Keep the default route for Gateway as `auto`.

- [ ] **Step 4: Run catalog and provider-setup tests**

Run: `npm test -- test/provider-catalog.test.ts test/provider-setup.test.ts`.

Expected: PASS, including unchanged CLI-readable connection IDs and required `baseUrl` values.

- [ ] **Step 5: Typecheck and commit the catalog unit**

Run: `npm run typecheck`.

Expected: exit 0.

```powershell
git add extensions/moderado-agent/src/provider-catalog.ts extensions/moderado-agent/src/provider-setup.ts extensions/moderado-agent/test/provider-catalog.test.ts extensions/moderado-agent/test/provider-setup.test.ts
git commit -m "feat: define Desktop provider catalog and cost policy"
```

### Task 2: Validate Gateway and direct-provider model inventories

**Files:**

- Create: `extensions/moderado-agent/src/provider-discovery.ts`
- Create: `extensions/moderado-agent/test/provider-discovery.test.ts`

**Interfaces:**

- `GatewayRoute`: `{ id: string; provider?: string; owned_by?: string; capabilities: string[]; data_note?: string }`.
- `fetchGatewayRoutes(baseUrl, options): Promise<GatewayRoute[]>` fetches `<baseUrl>/models`, validates `{ object: 'list', data: [...] }`, preserves IDs exactly, and rejects malformed entries.
- `fetchDirectModels(baseUrl, apiKey, options): Promise<ModelInventoryEntry[]>` validates OpenAI-compatible model entries, including optional pricing and supported parameters.
- Options accept an injected `fetchImpl?: typeof fetch`, `signal?: AbortSignal`, and bounded timeout.

- [ ] **Step 1: Add failing Gateway response tests**

Test a valid Gateway payload with IDs containing slashes/colons, all ten live-shape metadata fields, empty catalogs, wrong envelope, missing/empty ID, malformed capabilities, and a server error. Add direct catalog cases for array and `{data:[]}` OpenAI forms plus pricing preservation.

```ts
it('preserves a Gateway route ID and provider metadata', async () => {
  const routes = await fetchGatewayRoutes('http://127.0.0.1:4788/v1', {
    fetchImpl: async () => Response.json({
      object: 'list',
      data: [{ id: 'thinkingmachines/inkling:free', provider: 'openrouter', owned_by: 'openrouter', capabilities: ['text'], data_note: 'Owner verified for private use' }],
    }),
  });
  expect(routes[0]).toMatchObject({ id: 'thinkingmachines/inkling:free', provider: 'openrouter' });
});
```

- [ ] **Step 2: Run discovery tests and confirm they fail before implementation**

Run: `npm test -- test/provider-discovery.test.ts`.

Expected: FAIL because the Desktop discovery functions are not defined.

- [ ] **Step 3: Implement boundary parsing and bounded fetch**

Use `ModelInventoryEntrySchema` for direct catalog entries and a separate strict Zod schema for Gateway-only fields. Reject a malformed response instead of silently dropping malformed route entries. Apply an `AbortController` timeout and pass through caller cancellation.

- [ ] **Step 4: Run the discovery tests**

Run: `npm test -- test/provider-discovery.test.ts`.

Expected: PASS for both valid catalogs and failure/cancellation cases.

- [ ] **Step 5: Typecheck and commit discovery**

Run: `npm run typecheck`.

Expected: exit 0.

```powershell
git add extensions/moderado-agent/src/provider-discovery.ts extensions/moderado-agent/test/provider-discovery.test.ts
git commit -m "feat: validate Desktop provider model catalogs"
```

### Task 3: Implement Desktop-owned OpenAI-compatible HTTP/SSE transport

**Files:**

- Create: `extensions/moderado-agent/src/provider-transport.ts`
- Create: `extensions/moderado-agent/test/provider-transport.test.ts`

**Interfaces:**

- `DesktopOpenAIAdapter implements IProviderAdapter` and accepts `{ id, name, baseUrl, apiKey?, fetchImpl?, timeoutMs? }`.
- `discoverModels(signal?)` delegates to `fetchDirectModels` and returns validated inventory.
- `streamChat(options: ProviderChatOptions)` POSTs to `<baseUrl>/chat/completions`, sends the selected model ID unchanged, parses `data:` SSE frames, and yields validated `ChatCompletionChunk` values.
- Gateway uses the same transport with provider ID `moderado-cloud`; the adapter does not rewrite `auto` or route IDs.

- [ ] **Step 1: Write failing request, stream, and error tests**

Test the exact `/chat/completions` URL, bearer header without exposing the key, JSON body with exact model/tool values, multiple SSE chunks including tool-call fragments, `[DONE]`, malformed JSON, non-2xx response, timeout, and abort.

```ts
it('sends the selected route ID unchanged', async () => {
  let body: Record<string, unknown> | undefined;
  const adapter = new DesktopOpenAIAdapter({
    id: 'moderado-cloud', name: 'Moderado Gateway', baseUrl: 'https://mod.alfazen.org/v1',
    fetchImpl: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    },
  });
  for await (const _chunk of adapter.streamChat({ modelId: 'moonshotai/kimi-k3', messages: [{ role: 'user', content: 'hi' }] })) {}
  expect(body?.model).toBe('moonshotai/kimi-k3');
});
```

- [ ] **Step 2: Run transport tests and confirm missing adapter/parser failures**

Run: `npm test -- test/provider-transport.test.ts`.

Expected: FAIL because `DesktopOpenAIAdapter` is not defined.

- [ ] **Step 3: Implement bounded fetch and incremental SSE parsing**

Use the standard `fetch`/`ReadableStream` APIs and injected fetch in tests. Send `stream: true`, serialized chat messages, tool declarations, and configured token limits. Parse `choices[].delta.content`, `reasoning_content`, tool-call index/id/function-name/argument fragments, finish reason, and usage; preserve tool-call fragment order. Keep an explicit maximum response-frame size and fixed request timeout. Parse every provider chunk at the transport boundary; do not log raw response bodies or headers. Propagate aborts and surface safe typed errors through the current contracts.

- [ ] **Step 4: Run transport and discovery tests**

Run: `npm test -- test/provider-transport.test.ts test/provider-discovery.test.ts`.

Expected: PASS with no network access.

- [ ] **Step 5: Typecheck and commit transport**

Run: `npm run typecheck`.

Expected: exit 0.

```powershell
git add extensions/moderado-agent/src/provider-transport.ts extensions/moderado-agent/test/provider-transport.test.ts
git commit -m "feat: add Desktop OpenAI-compatible transport"
```

### Task 4: Add Desktop-owned classification and routing

**Files:**

- Create: `extensions/moderado-agent/src/model-router.ts`
- Create: `extensions/moderado-agent/test/model-router.test.ts`

**Interfaces:**

- `DesktopModelRouter extends Router` and is constructed with `{ providerId: string; inventory: ModelInventoryEntry[]; allowPaid: boolean; allowUnknown: boolean; requireTools: boolean }`.
- `classifyModel(id, isLocalProfile?, supportedParameters?)` resolves the matching entry and applies Desktop provider pricing/preset policy.
- `selectModel(inventory, routeOptions)` honors explicit pins, otherwise filters unsupported tools, applies paid/unknown opt-ins, orders free/trial before local and opted-in candidates, and reports an actionable no-eligible-model error.
- For `providerId === 'moderado-cloud'`, unpinned AUTO returns a synthetic `auto` model and an empty local fallback list. The adapter sends `auto` unchanged; Gateway route availability and fallback remain server-owned.
- `getNextFallback` returns the next direct-provider candidate from the ranked list.

- [ ] **Step 1: Add failing algorithm tests**

Cover free model ahead of paid/unknown, local tier, unsupported-tools exclusion, paid and unknown opt-in, nonzero price precedence, stable ordering within a tier, next-candidate fallback, Gateway AUTO even when the live catalog has no model named `auto`, and exact Gateway pin selection.

```ts
it('uses Gateway AUTO instead of classifying its routes locally', () => {
  const inventory = [{ id: 'moonshotai/kimi-k3', object: 'model' as const, owned_by: 'nvidia' }];
  const router = new DesktopModelRouter({ providerId: 'moderado-cloud', inventory, allowPaid: false, allowUnknown: false, requireTools: true });
  expect(router.selectModel(inventory).selectedModel.id).toBe('auto');
});
```

- [ ] **Step 2: Run router tests and confirm they fail before implementation**

Run: `npm test -- test/model-router.test.ts`.

Expected: FAIL because `DesktopModelRouter` is not defined.

- [ ] **Step 3: Implement classifier and Router overrides**

Use the pinned core's `Router`, `RouteSelectionOptions`, `SelectedModelResult`, and contract result types. For direct provider eligibility, reported nonzero or invalid pricing is paid; exact provider policy supplies free evidence where allowed; no provider-name substring rule grants free eligibility. Gateway's owner-confirmed Free catalog is a connection-scoped rule. Tool capability is `supported` only when advertised or known by the Desktop classification table, `unsupported` only when evidence says unsupported, otherwise `unknown`.

- [ ] **Step 4: Run model-router and current host tests**

Run: `npm test -- test/model-router.test.ts test/host.test.ts`.

Expected: PASS with all existing fake-provider selection behavior retained.

- [ ] **Step 5: Typecheck and commit routing**

Run: `npm run typecheck`.

Expected: exit 0.

```powershell
git add extensions/moderado-agent/src/model-router.ts extensions/moderado-agent/test/model-router.test.ts
git commit -m "feat: add Desktop free-first model router"
```

### Task 5: Implement Gateway login and credential-safe OAuth

**Files:**

- Create: `extensions/moderado-agent/src/gateway-login.ts`
- Create: `extensions/moderado-agent/test/gateway-login.test.ts`
- Modify: `extensions/moderado-agent/src/credentials.ts` only if a typed write/delete operation is missing.

**Interfaces:**

- `buildGatewayConnection(method, options)` returns the CLI-readable connection ID `moderado-cloud`, `kind: 'openai-compatible'`, selected base URL, and `defaultModel: 'auto'`.
- `createGatewayOAuthRequest(redirectUri)` returns a random `state`, PKCE verifier/challenge, and authorization URL using the currently registered client ID `moderado-cli` and exact redirect URI.
- `exchangeGatewayOAuthCode(code, request, fetchImpl?)` POSTs to the documented OAuth token endpoint and validates token shape and expiry.
- `authorizeGatewayInBrowser` binds one loopback callback, checks the exact path, state, and one-time code, observes cancellation/timeout, and returns a credential for the host to store.
- Public login stores no key. Manual keys and browser tokens are collected in the host and stored using `credentialReference('moderado-cloud')`; no secret is returned in a webview message.

- [ ] **Step 1: Add failing public/manual/OAuth unit tests**

Test the three login values, Gateway default model and URL, `mrd_` prefix validation, PKCE S256 challenge generation, invalid/missing state, callback path mismatch, token response with missing/expired fields, timeout, abort, and credential-store reference use. Assert no helper returns a secret inside a webview message payload.

```ts
it('builds public Gateway access without a credential', () => {
  expect(buildGatewayConnection('public', { baseUrl: 'http://127.0.0.1:4788/v1' })).toMatchObject({
    id: 'moderado-cloud', kind: 'openai-compatible', defaultModel: 'auto',
  });
});
```

- [ ] **Step 2: Run Gateway login tests and confirm missing flow failures**

Run: `npm test -- test/gateway-login.test.ts`.

Expected: FAIL because the Desktop Gateway auth API is not defined.

- [ ] **Step 3: Implement auth primitives and host-only secret storage**

Use Node `crypto` for `randomBytes`, SHA-256, and base64url. Use Node `http` for one short-lived `127.0.0.1:<ephemeral>/callback` server. Open the authorization URL through the VS Code external-URI API from the host. Match the current CLI Gateway OAuth contract exactly: client ID `moderado-cli`, authorize URL `https://mod.alfazen.org/authorize`, token URL `https://mod.alfazen.org/oauth/token`, PKCE S256, and exact loopback callback. Do not alter the Gateway or CLI repository. Store only a Credential Manager reference and expiry metadata in shared config.

- [ ] **Step 4: Run Gateway auth and profile/credential tests**

Run: `npm test -- test/gateway-login.test.ts test/profile.test.ts`.

Expected: PASS; invalid callbacks never store credentials, and isolated fixtures contain no real profile data.

- [ ] **Step 5: Typecheck and commit Gateway authentication**

Run: `npm run typecheck`.

Expected: exit 0.

```powershell
git add extensions/moderado-agent/src/gateway-login.ts extensions/moderado-agent/src/credentials.ts extensions/moderado-agent/test/gateway-login.test.ts
git commit -m "feat: add secure Desktop Gateway login"
```

### Task 6: Wire Desktop provider, router, and selected model into agent runs

**Files:**

- Modify: `extensions/moderado-agent/src/host.ts`
- Modify: `extensions/moderado-agent/test/host.test.ts`
- Modify: `extensions/moderado-agent/src/sessions.ts` only if the existing session record does not preserve the chosen model ID.

**Interfaces:**

- `AgentHost.startRun({ task, planMode?, conversationHistory?, session?, modelId? })` accepts the active GUI selection.
- `AgentHostOptions.fetchImpl?: typeof fetch` injects fake HTTP only in offline host tests.
- `resolveProvider(state, credentialStore, env, fetchImpl?)` creates the Desktop transport from a validated saved connection and resolved host-side credential.
- Each run creates a `DesktopModelRouter` using the active connection ID, discovery inventory, paid/unknown settings, and `modelId`.
- `modelId === 'auto'` means unpinned AUTO for direct providers and Gateway's server-owned AUTO for `moderado-cloud`; any other nonempty ID becomes `routeOptions.pinnedModelId`.
- `AgentHost.discoverModels()` returns access class, `isFree`, Gateway provider/owner/capabilities/note, and a pseudo `auto` row where applicable.

- [ ] **Step 1: Add failing host tests for provider resolution and per-run selection**

Use a fake fetch and temporary `moderadoHome`. Verify no-key public Gateway resolves, manual credentials are looked up by `moderado/provider/moderado-cloud`, the selected route reaches the adapter body unchanged, direct `auto` does not become a pin, and saved session `modelId` matches the selected model. The fake POST returns a single OpenAI SSE choice with `finish_reason: "stop"` and a `[DONE]` frame so one `AgentLoop` turn ends offline.

```ts
it('passes an explicit model selection through the agent host', async () => {
  const moderadoHome = mkdtempSync(join(tmpdir(), 'moderado-home-'));
  const host = new AgentHost({ workspaceRoot: workspace(), moderadoHome, onEvent: () => {}, promptForApproval: async () => undefined });
  const result = await host.startRun({ task: 'Say hello.', modelId: 'moonshotai/kimi-k3' });
  expect(result.model).toBe('moonshotai/kimi-k3');
});
```

- [ ] **Step 2: Run host tests and confirm the new modelId path fails**

Run: `npm test -- test/host.test.ts`.

Expected: FAIL because `startRun` ignores `modelId` and resolves adapters through the shared provider package.

- [ ] **Step 3: Implement provider resolution and custom router injection**

Validate profile records before adapter construction. Resolve env/credential references in the existing precedence order. Never pass a key through the UI. Discover inventory once per run, construct the Desktop router, pass `modelInventory`, `router`, `routeOptions`, and the requested model to `AgentLoop.run`, then persist the resulting selected model in the session.

- [ ] **Step 4: Run host, approval, profile, and session tests**

Run: `npm test -- test/host.test.ts test/approval.test.ts test/profile.test.ts`.

Expected: PASS; Gateway routing adds no path around approvals, profile validation, or checked session writes.

- [ ] **Step 5: Typecheck and commit host integration**

Run: `npm run typecheck`.

Expected: exit 0.

```powershell
git add extensions/moderado-agent/src/host.ts extensions/moderado-agent/test/host.test.ts extensions/moderado-agent/src/sessions.ts
git commit -m "feat: route Desktop runs through selected models"
```

### Task 7: Add the Gateway/provider Settings and login GUI

**Files:**

- Modify: `extensions/moderado-agent/src/settings-view.ts`
- Modify: `extensions/moderado-agent/src/provider-setup.ts`
- Modify: `extensions/moderado-agent/src/extension.ts`
- Modify: `extensions/moderado-agent/test/model-discovery.test.ts`
- Create or extend: `extensions/moderado-agent/test/settings-view.test.ts`

**Interfaces:**

- Settings form message remains a validated host boundary and adds `loginMethod: 'public' | 'browser' | 'manual'` plus Gateway URL where applicable.
- Rendered provider list shows Moderado Gateway, NVIDIA NIM, OpenRouter, Agnes AI, OrcaRouter, Ollama, LM Studio, and custom OpenAI-compatible endpoint.
- Gateway model cards show `auto` plus every validated route as Free, with provider/owner/capability/data note from the response.
- Direct-provider choices include an `AUTO · Free-first` entry. Choosing it leaves `pinnedModelId` unset so the Desktop router can rank and fall back; selecting a model pins it.
- Direct provider model cards show Desktop classification; paid/unknown models appear only under existing opt-in policy.
- `SettingsModel` adds optional `provider`, `ownedBy`, `capabilities`, and `dataNote` fields for Gateway routes; it never carries credentials or raw response objects.
- Webview messages contain no API key, token, authorization code, or raw response body. Credential references are not rendered; only a boolean “credential stored” state is shown.

- [ ] **Step 1: Add failing rendering and message-validation tests**

Test the Gateway login choices, custom Gateway base URL validation, auto and route cards, Free tag, escaped metadata, paid/unknown visibility, malformed login method rejection, rejection of webview messages containing `apiKey`/`token` fields, absence of any password input in rendered HTML, and zero secret values in rendered HTML/snapshots.

```ts
import { emptySettings, settingsPaneHtml } from '../src/settings-view.js';

it('escapes Gateway route metadata and labels the owner-confirmed catalog Free', () => {
  const state = {
    ...emptySettings(), open: true, preset: 'moderado-cloud',
    providers: [{ value: 'moderado-cloud', label: 'Moderado Gateway', description: 'Gateway', requiresApiKey: false }],
    models: [{ id: 'gateway/route', accessTier: 'free_trial', isFree: true, dataNote: '<script>bad</script>' }],
    defaultModel: 'gateway/route',
  };
  const html = settingsPaneHtml(state);
  expect(html).toContain('Free');
  expect(html).not.toContain('<script>bad</script>');
});
```

- [ ] **Step 2: Run Settings/view tests and confirm new Gateway controls fail**

Run: `npm test -- test/model-discovery.test.ts test/settings-view.test.ts test/chat-view.test.ts`.

Expected: FAIL because the Gateway controls and display metadata are not rendered or handled.

- [ ] **Step 3: Implement Settings UI and host handlers**

Keep the existing Settings pane and Cline-inspired layout. Add a Gateway login-method selector, loopback/HTTPS-validated Gateway URL, direct provider choice, searchable model cards, and active model label. Route browser login through the host-only authorization module; save model/provider updates with `updateConfigCoordinated`. Replace webview password fields with a “Set or update key” action that opens `vscode.window.showInputBox({ password: true, ignoreFocusOut: true })` in the extension host and stores the returned key directly in Credential Manager. Remove `apiKey` from the webview form type and reject webview messages containing `apiKey`, `token`, `authorizationCode`, or `credentialReference`. The ordinary Settings save message contains only nonsecret fields.

- [ ] **Step 4: Run Settings and chat-view tests**

Run: `npm test -- test/model-discovery.test.ts test/settings-view.test.ts test/chat-view.test.ts`.

Expected: PASS with existing accessible labels, recents, composer behavior, Plan/Act mode, and approval previews unchanged.

- [ ] **Step 5: Typecheck and commit Settings UI**

Run: `npm run typecheck`.

Expected: exit 0.

```powershell
git add extensions/moderado-agent/src/settings-view.ts extensions/moderado-agent/src/provider-setup.ts extensions/moderado-agent/src/extension.ts extensions/moderado-agent/test/model-discovery.test.ts extensions/moderado-agent/test/settings-view.test.ts
git commit -m "feat: add Gateway and provider model settings"
```

### Task 8: Wire active provider/model context through the chat sidebar

**Files:**

- Modify: `extensions/moderado-agent/src/chat-view.ts`
- Modify: `extensions/moderado-agent/src/extension.ts`
- Modify: `extensions/moderado-agent/test/chat-view.test.ts`
- Modify: `extensions/moderado-agent/test/host.test.ts`

**Interfaces:**

- `ChatViewState` carries safe `activeProviderName` and `activeModelId` strings.
- The composer sends its current text and the host-side selected model identity; the model ID is validated in the host and must match either `auto` or a discovered/pinned route.
- The footer displays provider and model and refreshes when the connection or model changes.
- Plan/Act state, recent sessions, cancellation, and approval flow retain existing behavior.

- [ ] **Step 1: Add failing chat snapshot and run-wiring tests**

Test the active provider/model footer with HTML escaping, Gateway `auto`, exact pinned route IDs, and `runPrompt` passing the active model to `host.startRun`.

```ts
it('shows the active provider and model in the composer context', () => {
  const html = chatHtml({ transcript: [], running: false, pendingApproval: null, planMode: false, activeProviderName: 'Moderado Gateway', activeModelId: 'auto' });
  expect(html).toContain('Moderado Gateway');
  expect(html).toContain('auto');
});
```

- [ ] **Step 2: Run chat-view/host tests and confirm the footer and selected-model assertion fail**

Run: `npm test -- test/chat-view.test.ts test/host.test.ts`.

Expected: FAIL on missing context fields/modelId forwarding.

- [ ] **Step 3: Implement active context and run forwarding**

Populate display fields from the validated active profile and Settings selection. Pass `modelId` to `AgentHost.startRun`; do not accept arbitrary provider parameters or credentials from the webview.

- [ ] **Step 4: Run chat-view and host tests**

Run: `npm test -- test/chat-view.test.ts test/host.test.ts`.

Expected: PASS, including prompt cancellation, session restore, and selected route preservation.

- [ ] **Step 5: Typecheck and commit sidebar integration**

Run: `npm run typecheck`.

Expected: exit 0.

```powershell
git add extensions/moderado-agent/src/chat-view.ts extensions/moderado-agent/src/extension.ts extensions/moderado-agent/test/chat-view.test.ts extensions/moderado-agent/test/host.test.ts
git commit -m "feat: show active provider and model in chat"
```

### Task 9: Align repository guidance and verify the complete Desktop flow

**Files:**

- Modify: `AGENTS.md`
- Modify: `PRD.md`
- Modify: `docs/UPSTREAM.md`
- Modify: `docs/PROFILE.md`
- Modify: `HANDOFF.md`
- Modify: `sources.lock.json` only to clarify the existing pinned source role; do not change its Moderado tag or commit.

**Interfaces:**

- Contributor docs say Desktop owns Gateway/provider adapters, discovery, model policy, and transport, while contracts/core/tools stay at the existing source pin.
- PRD F2/F3 identify the Desktop-owned provider layer and require offline parity with CLI `v0.4.8` fixtures/behavior.
- Profile docs specify the Gateway `moderado-cloud` connection, route ID/model identity, Credential Manager reference, coordinated config writes, and no new schema migration.
- Handoff records exact commands and outcomes without secrets or raw transcripts.

- [ ] **Step 1: Identify outdated provider-ownership claims**

Search for the old claims before changing them:

```powershell
rg -n "same pinned logic|provider adapters|v0\.3\.10|bundles the pinned Moderado" AGENTS.md PRD.md docs/UPSTREAM.md docs/PROFILE.md sources.lock.json
```

Expected: inspect each match and update only statements that say provider transport, presets, or policy must come from the CLI source. Do not add a new dependency or generic documentation-test framework for this doc-only task.

- [ ] **Step 2: Update only the ownership/parity/profile statements**

Keep `sources.lock.json` revisions unchanged. State explicitly that Desktop's provider module adapts CLI `v0.4.8` behavior without using CLI code at runtime. Do not claim simultaneous config-write safety beyond the existing coordinated-writer guarantees.

- [ ] **Step 3: Run the full offline extension suite, typecheck, and bundle check**

Run from `extensions/moderado-agent`:

```powershell
npm test
npm run typecheck
npm run compile
```

Expected: all offline tests pass, typecheck exits 0, and the bundle exposes `activate()` without new runtime packages.

- [ ] **Step 4: Build and smoke-test the packaged editor host where the local pinned build is available**

Run from repository root: `.\scripts\build-m1.ps1 -AssetsOnly`.

Expected: the agent extension is rebuilt into the editor asset, the manifest points to the current source/version, and the packaged IDE launches. In the real editor, open the Moderado view; complete public Gateway setup against `http://127.0.0.1:4788/v1`; inspect all ten Free routes and select `auto` plus a pinned route in the UI. Do not run live inference; verify outbound `auto`/pinned chat bodies with the offline fake-server tests.

- [ ] **Step 5: Record exact verification and commit documentation**

Update `HANDOFF.md` with exact commands/results, any editor-host limitation, and the remaining release authorization boundary. Do not claim an artifact or host check that was not produced.

```powershell
git add AGENTS.md PRD.md docs/UPSTREAM.md docs/PROFILE.md HANDOFF.md sources.lock.json
git commit -m "docs: define Desktop-owned provider integration"
```

### Final Review Checklist

- [ ] Every route in the owner-managed Gateway catalog is labeled Free, and model ID `auto` is sent unchanged to the Gateway.
- [ ] Each pinned Gateway route ID is sent unchanged.
- [ ] Direct-provider AUTO and opt-in behavior match the approved CLI `v0.4.8` behavior on offline fixtures.
- [ ] Provider HTTP/SSE transport belongs to the Desktop extension source and has no new runtime dependency.
- [ ] No secret enters the webview, profile plaintext, logs, test output, or child environment.
- [ ] Profile/session compatibility, workspace jail, human approval, and default-deny behavior remain intact.
- [ ] `npm test`, `npm run typecheck`, `npm run compile`, and any real editor-host check have recorded outcomes.
- [ ] The sibling CLI worktree has not been modified.
- Historical scope note: no installer/package/manifest was published as part
  of this design implementation task; the separate v0.1.28 release followed.
