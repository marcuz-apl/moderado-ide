# Moderado IDE roadmap

This roadmap records milestone intent and current release readiness. v0.1.44
(`v0.1.44+2610236`) is the latest published stable release. The v0.1.29
release was withdrawn after a webview startup error. Current caveats are in
[INSTALL.md](INSTALL.md).

Moderado IDE targets Linux, macOS, and Windows. The v0.1.44 release includes Windows x64, Linux x64, macOS Apple Silicon arm64, and macOS Intel x64 packages; each platform's manifest records the source revisions used. The release adds session, approval, skill, provider, and shared-config improvements. Native Linux installation, code signing/notarization, update service, and real editor restart acceptance remain open.

## M0 — Independent project foundation (documentation scaffold)

- Define product, source, profile, security, and versioning contracts.
- Create a separate Git repository and verify the CLI working tree is unchanged.
- Record an initial handoff and the smallest next action.

**Historical status:** the repository foundation and documentation scaffold
were established. Product release status is tracked in the current release
notes and installation guide.

## M1 — Reproducible Windows editor build

- Pin VSCodium, Code OSS, and Moderado source revisions in a IDE-owned
  manifest; preserve license notices.
- Produce a Windows x64 editor with distinct Moderado identity and isolated
  editor application data.
- Verify launch, open-folder, terminal, install/uninstall, and clean-account
  behavior. No agent integration is claimed at this gate.

## M2 — Self-contained Moderado agent

- Bundle the pinned contracts/core/providers/tools packages in the editor.
- Add an editor host and UI for provider setup, model discovery/selection,
  streamed events, cancellation, tool previews, and decisions.
- Verify no installed CLI executable is needed. Use a fake provider and real
  editor-host test; preserve free-first and paid/unknown-cost rules.
- Enforce explicit human approval by default for mutations and commands;
  Plan mode blocks writes in core policy.

## M2 status (integrated; agent wiring verified)

`vendor/moderado/` holds the pinned CLI agent packages exported at the
immutable CLI `v0.4.10` revision in `sources.lock.json` (commit
`a3479fffc6e00ca8796893920930a258759243c5`, package version
`v0.4.10+2610105`; export details are recorded in `vendor/moderado/VENDORED.json`). The export uses `git archive`, so
the sibling CLI working tree is never modified.

`extensions/moderado-agent/` bundles those packages with IDE's host into a
single CommonJS bundle for the editor host. It provides the chat view, the
fail-closed approval boundary, model selection, and session persistence against
the shared `~/.moderado` profile. Verification is recorded in
[HANDOFF.md](../HANDOFF.md).

Milestone 3 delivered shared-profile reads, writes, and Credential Manager support. The IDE now coordinates its own concurrent `config.json` writers. External applications must adopt the same lock protocol for cross-application write guarantees; simultaneous writes to one session ID still need a conflict policy.

## M3 — Shared profile compatibility

- Round-trip config, skills, Windows Credential Manager references, and
  sessions with a pinned CLI release.
- Coordinate IDE config writes and document the boundary for other writers.
  This repository does not change the separate CLI project.
- Define and test conflict handling for the same session open in two processes.
- Protect malformed and older profile data with validated, recoverable
  migrations.

## M3 status (implemented; prior baseline verified)

IDE reads and writes the shared `~/.moderado` profile through a canonical,
coordinated path. Interoperability fixtures check the shared profile and
session formats; they do not make the CLI part of IDE runtime or define IDE
product scope. Cross-application config write safety depends on each writer
following the same lock protocol.

Delivered here:

- `src/profile.ts` — canonical workspace root, missing-vs-invalid config
  detection, field-preserving merge, skill discovery.
- `src/credentials.ts` — the CLI's `moderado/provider/<id>` normalization and
  resolution order, plus a Windows Credential Manager store that passes the key
  only on stdin and never on a command line.
- `src/coordination.ts` — an ownership-checked IDE lock, in-lock re-read,
  field-scoped conflict checks, and preservation of unrelated config fields.
- `src/sessions.ts` — the CLI's session schema and directory hash, atomic writes,
  corrupt-record reporting, and a checked save that refuses to overwrite a
  session another process changed.

**Still open:** external writers that ignore the IDE lock may race with an IDE
write. Cross-application safety requires those writers to adopt this protocol.
This IDE change does not modify the separate CLI project.

## M4 — Release readiness

- Run offline suites and Windows real-editor workflow checks.
- Verify security boundaries, keyboard/screen-reader flows, attribution,
  artifact provenance, checksums, signing status, and update behavior.
- Document installation and supported platform/profile combinations.
- Publish only after explicit owner authorization.

Linux, macOS, and Windows packages are included in v0.1.31. Windows/Linux cross-home profile sharing remains a separate compatibility decision.

## M4 status (v0.1.31 published)

Release evidence is produced by `scripts/verify-release.ps1`, which checks
artifact checksums, manifest provenance against `sources.lock.json`, packaged
editor identity, license notices, and the bundled agent. It writes
`release-verification.json` and never claims signing or publication.

It also opens the shipped zip and asserts the agent is really inside it. A
packaging-only rebuild skips the non-native extension task and would otherwise
produce an editor with no agent that still passed every other check.

Installation, supported platform combinations, data locations, and known
limitations are documented in [INSTALL.md](INSTALL.md).

The v0.1.44 release is published with platform-specific manifests, provenance,
verification results, checksums, and third-party notices. Remaining release
limitations include platform signing/notarization, an update channel, native
Linux runtime installation verification, and real editor restart acceptance.
Shared profile write coordination is guaranteed among IDE writers; external
writers must adopt the same lock protocol. See [PROFILE.md](PROFILE.md) for
details. Publishing a new release requires the owner's explicit authorization.

## M5 — Provenance and license compliance

This milestone covers IDE-owned release provenance and license evidence.
Signing and the update channel remain separate release engineering work.

- Emit a machine-readable provenance attestation beside the artifacts: pinned
  upstream revisions, the commit each artifact was built from, per-artifact
  SHA-256 and size, and the bundled agent's revision. It must be regenerable
  and byte-stable, and `verify-release.ps1` must reject one that disagrees with
  `sources.lock.json` or the manifest.
- Generate a third-party license notice from what actually ships, covering the
  Code OSS/VSCodium inputs and the vendored Moderado agent, and verify that the
  notices referenced exist in the packaged editor. A notice that cannot be
  produced from the real package must fail rather than be hand-written.
- Add the explicit opt-in smoke procedure for live model calls that
  [AGENTS.md](../AGENTS.md) requires. It must refuse to run without an explicit
  opt-in flag, must never run in CI, must not persist the API key, and must be
  separate from the offline suite.

**Done when:** the attestation and notices are generated from the real build,
verification fails on a tampered attestation or a missing notice, and the smoke
procedure has been shown to refuse by default.
