# Shared Moderado profile contract

## Scope

IDE and CLI use the same current user's `~/.moderado/` for Moderado agent
data. The supported sharing case is one account running IDE and CLI on
the same OS. Windows credential sharing has
its own platform-specific requirements below. On Windows, `~` is the account's
home directory, normally `%USERPROFILE%`; it is not the literal `$USER` path.
Windows and Linux normally have different home directories and path identities,
so cross-OS sharing remains outside the supported profile contract.

| Location | Shared profile data | IDE rule |
| --- | --- | --- |
| `config.json` | Provider connections, model and cost policy, MCP servers, enabled skills | Read existing values and preserve unknown fields. IDE writers coordinate through a shared lock, re-read before merge, and detect conflicts only on values being changed. Other applications must use the same protocol for a cross-application write guarantee. |
| `sessions/<workspace-hash>/<id>.json` | Version 1 workspace session records | Canonicalize the workspace root before SHA-256 hashing, as the pinned CLI callers do; validate schema and preserve IDs/history. |
| `skills/<name>/SKILL.md` | User-installed skills | Discover enabled files with symlink checks, 256 KiB per file, 64 entries, and a 1 MiB aggregate cap; skill bodies remain untrusted advisory data. |
| `logs/` | Agent diagnostic output | Use a distinct IDE log file and redact secrets. |
| `desktop/` | IDE-specific state | Reserved for IDE-specific Moderado state that does not belong in shared config. |

The Gateway connection uses connection ID `moderado-cloud` with
`kind: 'openai-compatible'` and model identity `defaultModel: 'auto'`
(or an exact discovered route ID for a pinned route). It introduces no
config-schema migration: Gateway and direct-provider connections,
`defaultModel`, route IDs, and cost-policy flags reuse the existing
shared fields alongside the CLI.
As with CLI `v0.4.10`, IDE presents Gateway access in its unified provider
connection flow rather than a separate login command.

Gateway model listing is public. Its route catalog may include `access: 'free'`
or `access: 'paid'`; the IDE uses that field for model cost classification and
marks older catalogs without it as unknown cost. Free-route inference requires a valid
Moderado website API key. The saved manual key or browser credential is
resolved by the host and sent as a bearer token on Gateway completion requests.
The `public` auth method remains a keyless connection for paid routes and
public model listing. Gateway `auto` is selected by the server and may choose
a free or paid route, so the IDE labels its cost unknown. It requires a key
when the Gateway dispatches a free route. Direct BYOK and local provider
connections are unaffected.

The editor's own layout, extension database, caches, and update metadata use
separate application data identified by Moderado IDE. Their location must
not collide with VS Code, VSCodium, or the shared files above.

## Provider credentials

`config.json` may contain a credential reference, not the credential value.
The current Windows CLI uses Credential Manager targets of the form
`moderado/provider/<normalized-provider-id>`. IDE must use the same target
when a connection has such a reference, including
`moderado/provider/moderado-cloud` for Gateway OAuth tokens and manual keys.
Environment variables take precedence
in the existing CLI resolution path. A IDE UI must never send the secret
to a renderer, store it in an editor setting, or print it in logs.

On Linux and macOS, IDE stores newly entered provider keys in the editor's
encrypted SecretStorage, separate from the shared profile. Only the credential
reference enters `config.json`; new plaintext secrets never do. Storage errors
and timeouts fail the operation instead of falling back to plaintext storage.
Windows continues to use the shared Credential Manager targets above.

New IDE key saves stage an immutable target of the form
`moderado/provider/<normalized-provider-id>-<UUID>` and link that exact reference
from config only after storage succeeds. Existing canonical targets remain
readable and are never migrated or overwritten by staging. The pinned CLI
`v0.4.10` preserves the stored reference string and passes it unchanged through
its resolver to Windows Credential Manager, so these targets need no profile
schema change. A failed save can leave an unreferenced credential; IDE does not
automatically delete such entries or claim coordinated CLI credential writes.

On non-Windows platforms the current CLI uses an in-memory credential store
plus environment or legacy config values. The CLI cannot retrieve keys from
the IDE's editor secret storage simply by sharing `~/.moderado`; configure its
environment independently. This adapter does not establish a non-Windows
CLI/IDE credential-sharing gate. Native encrypted storage behavior should be
verified on each supported platform; release evidence does not establish all
platform profile gates.

## Writes and migrations

IDE writes take an IDE-side lock, re-read the file under lock, and compare only
the fields each operation intends to change. Lock records include process
ownership; age alone never authorizes lock removal. A stale lock is reaped only
when its owner process is gone and an exclusive recovery claim is held. If lock
ownership is malformed or cannot be verified, IDE fails closed and reports
manual recovery guidance.

This protocol guarantees coordination among IDE processes that use the
coordinated writer. Any external application that writes `config.json` without
using this lock can still race; cross-application safety requires those writers
to adopt the same protocol. This IDE repository does not modify the CLI.

Session saves use a temporary file and rename, but that only protects against
a partial file. Two active processes modifying the same session ID can still
overwrite each other's conversation. Use sequential CLI/IDE resume or distinct
concurrent sessions; simultaneous writes to one session ID need a conflict
policy before they can be considered supported.

For any schema migration: read and validate first, retain a recoverable copy,
write a new file atomically, and leave the original untouched on failure. Do
not discard unknown config fields, import plaintext keys into a renderer, or
silently replace a malformed profile with defaults.

The current CLI config loader returns an empty configuration on parse errors,
and its session listing skips corrupt records. IDE must explicitly tell
apart "missing" and "invalid" before a write, and its interoperability tests
must cover these existing CLI behaviors.

## Behavior parity boundary

Provider/model eligibility and agent engine behavior follow the pinned CLI
contracts/core/tools source at CLI `v0.4.10`, as recorded in `sources.lock.json`.
The updated baseline requires fresh compatibility checks; previous fixtures
and host evidence do not establish verification of this source update.
The IDE-owned provider layer adapts CLI
`v0.4.10` cost, AUTO, and routing fixtures/behavior without using CLI provider
code at runtime; it does not claim simultaneous config-write safety beyond
the IDE coordinated-writer guarantees above.
IDE's Auto-Approve defaults enable reads, file edits, web content, and the
Use MCP servers category; command execution remains approval-gated. The MCP
category controls per-call approvals only because no MCP tools are registered.
Users can disable any category to require a human decision. Plan mode still
blocks mutations. MCP server discovery and trust are not implemented yet. The
current pinned MCP transport cannot accept the IDE's sanitized child
environment, so no server is launched; trust must still precede discovery and
launch when a reviewed transport with explicit environment injection is
available. These IDE defaults may differ from the current CLI handler behavior
and must not be represented as CLI parity.

## Verification fixtures

Tests use isolated home directories and fake credentials. Required cases:
CLI-created profile to IDE, IDE-created session to CLI, missing or
corrupt records, unknown config fields, credential references, differing
workspace path spellings, and simultaneous read/write attempts. No automated
test uses the developer's real `~/.moderado`.

Pinned CLI interoperability is run explicitly with
`MODERADO_CLI_ROOT=/path/to/pinned/checkout npm run test:profile-interop` from
`extensions/moderado-agent`. The runner verifies the checkout HEAD against
`sources.lock.json` and requires built CLI config/session modules. The current
local run used commit `a3479fffc6e00ca8796893920930a258759243c5` and passed all
52 profile tests. Its build used the adjacent checkout's installed dependency
tree because offline installation could not find a cached `yargs-parser`
archive; clean dependency reproduction remains open. The pinned CLI's config
loader returns known fields and its save path drops unknown raw keys, so IDE
merges must preserve them and avoid treating CLI round trips as unknown-field
preservation evidence.

The real editor close/reopen acceptance gate remains open: this host has no
`code`, `codium`, or Moderado editor application available. Unit tests do not
substitute for restarting the packaged IDE with isolated user-data and
extensions directories.
