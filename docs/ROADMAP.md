# Moderado IDE roadmap

This roadmap is the original delivery sequence and a record of milestone
intent. v0.1.30 is the latest published stable release. The v0.1.29 release
was withdrawn after a webview startup error. Current caveats are in
[INSTALL.md](INSTALL.md).

Moderado IDE targets Linux, macOS, and Windows. The v0.1.30 release includes Windows x64, Linux x64, macOS Apple Silicon arm64, and macOS Intel x64 packages; each platform's manifest records the source revisions used. Some verification remains incomplete, including native Linux runtime installation and profile coordination with the CLI.

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
immutable CLI `v0.4.8` revision in `sources.lock.json` (commit
`d5e263ed0c9ba6715d0ce69aa640b9b9111931c8`, package version
`v0.4.8+261006d`; export details are recorded in `vendor/moderado/VENDORED.json`). The export uses `git archive`, so
the sibling CLI working tree is never modified.

`extensions/moderado-agent/` bundles those packages with IDE's host into a
single CommonJS bundle for the editor host. It provides the chat view, the
fail-closed approval boundary, model selection, and session persistence against
the shared `~/.moderado` profile. Verification is recorded in
[HANDOFF.md](HANDOFF.md).

Milestone 3 still needs the cross-process round-trip against a pinned CLI
release, Credential Manager references, and a coordinated `config.json` writer.

## M3 — Shared profile compatibility

- Round-trip config, skills, Windows Credential Manager references, and
  sessions with a pinned CLI release.
- Resolve config write races through a protocol both editions follow;
  coordinate any CLI-side change in its own repository.
- Define and test conflict handling for the same session open in two processes.
- Protect malformed and older profile data with validated, recoverable
  migrations.

## M3 status (implemented; prior baseline verified)

IDE now reads and writes the shared `~/.moderado` profile through a
canonical, coordinated path. The CLI `v0.4.8` source update requires rerunning
the compatibility suite before claiming verification of the current baseline.
Round-trip tests run against the *actual* CLI
`dist` from the pinned revision rather than a hand-written copy of its schema,
so they would fail if the two editions diverged.

Delivered here:

- `src/profile.ts` — canonical workspace root, missing-vs-invalid config
  detection, field-preserving merge, skill discovery.
- `src/credentials.ts` — the CLI's `moderado/provider/<id>` normalization and
  resolution order, plus a Windows Credential Manager store that passes the key
  only on stdin and never on a command line.
- `src/coordination.ts` — a lock file plus an in-lock re-read, so a concurrent
  CLI write is merged rather than lost, and an owned-field conflict refuses to
  overwrite instead of clobbering.
- `src/sessions.ts` — the CLI's session schema and directory hash, atomic writes,
  corrupt-record reporting, and a checked save that refuses to overwrite a
  session another process changed.

**Still open:** the CLI does not take IDE's lock, so the coordination
protects IDE's own writes and detects the CLI's, but it cannot prevent a
CLI write that lands between IDE's read and its write. Making both editions
follow one protocol needs a separate, reviewed change in the CLI repository,
which this project must not make.

## M4 — Release readiness

- Run offline suites and Windows real-editor workflow checks.
- Verify security boundaries, keyboard/screen-reader flows, attribution,
  artifact provenance, checksums, signing status, and update behavior.
- Document installation and supported platform/profile combinations.
- Publish only after explicit owner authorization.

Linux, macOS, and Windows packages are included in v0.1.28. The full v0.1.30 build is planned; Windows/Linux cross-home profile sharing remains a separate compatibility decision.

## M4 status (v0.1.28 published; v0.1.30 planned)

Release evidence is produced by `scripts/verify-release.ps1`, which checks
artifact checksums, manifest provenance against `sources.lock.json`, packaged
editor identity, license notices, and the bundled agent. It writes
`release-verification.json` and never claims signing or publication.

It also opens the shipped zip and asserts the agent is really inside it. A
packaging-only rebuild skips the non-native extension task and would otherwise
produce an editor with no agent that still passed every other check.

Installation, supported platform combinations, data locations, and known
limitations are documented in [INSTALL.md](docs/INSTALL.md).

The v0.1.28 release is published with platform-specific manifests, provenance,
verification results, checksums, and third-party notices. Remaining gaps
include platform signing/notarization, an update channel, native Linux runtime
installation verification, refreshed compatibility evidence for the current
agent baseline, and a `config.json` coordination protocol both IDE and CLI
follow. See [PROFILE.md](PROFILE.md) for profile limits. Publishing was
explicitly authorized by the owner.

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
