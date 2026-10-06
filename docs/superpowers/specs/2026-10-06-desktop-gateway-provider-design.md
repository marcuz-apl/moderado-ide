# Moderado Desktop Gateway and Provider Design

**Date:** 2026-10-06
**Status:** Approved design; awaiting spec review
**Reference behavior:** Moderado CLI `v0.4.8`
**Desktop package baseline:** Keep the current pinned contracts, core, tools, and vendored source snapshot.

## Goal

Give Moderado Desktop a GUI connection and model-selection flow modeled on the
CLI `v0.4.8` Gateway and provider behavior, while keeping Gateway/provider
policy and transport owned by the Desktop repository. The Desktop remains a
separate application and repository. No source, configuration, or Git state in
the sibling CLI repository is changed.

## Current state

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

## Ownership and boundaries

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

The webview receives display-safe provider/model data only. API keys and OAuth
tokens remain in the extension host and Windows Credential Manager. Model
content and provider responses are untrusted and validated at their boundary.

## Gateway behavior

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

## Direct provider behavior

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

## GUI flow

Use the Cline screenshots as interaction references, not pixel targets:

- Chat remains in the Moderado activity-bar sidebar, with recent sessions,
  task composer, active workspace/provider/model context, and Plan/Build mode.
- Settings groups Moderado Gateway login and direct provider configuration.
  Gateway offers public, browser, and manual-key choices. Direct providers
  include the four hosted presets, two local runtimes, and custom endpoint.
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

## Profile and credential behavior

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

## Error handling and security

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

## Verification

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

## Acceptance criteria

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
