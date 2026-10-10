# Installing Moderado IDE

> **Status: v0.1.30 is the latest published stable release.** The v0.1.29
> release was withdrawn after a webview startup error. The v0.1.30 release
> includes the fix and all four platform builds.
> Download the current release from the
> [GitHub release page](https://github.com/marcuz-apl/moderado-ide/releases/latest).
> Windows installers are unsigned; macOS images are ad-hoc signed but not
> notarized. There is no update channel.

## Target platforms and verified evidence

| | |
| --- | --- |
| Targets | Linux x64, macOS x64/arm64, and Windows x64 |
| Existing artifact evidence | Official v0.1.30 release includes Windows x64, Linux x64, macOS Apple Silicon arm64, and macOS Intel x64 assets |
| Editor base | Code OSS `1.135.0`, built through VSCodium `1.135.06055` |
| Agent packages | Moderado CLI `v0.4.10` (`a3479fff…`, `v0.4.10+2610105`) |
| Architectures | Linux and Windows x64; macOS x64 and arm64 |

The stable [v0.1.30 release](https://github.com/marcuz-apl/moderado-ide/releases/tag/v0.1.30%2B261009t) was built from commit `5432a4a88027bb0d3185dc528a9de78a371e6629` by [workflow run 37985155914](https://github.com/marcuz-apl/moderado-ide/actions/runs/37985155914). Use the manually dispatched [build-and-release workflow](../.github/workflows/build-and-release.yml) with platform `all` for future full releases; partial-platform and custom-source builds remain in Actions for review. For a local Linux build, follow the [Linux build instructions](../README.md#build-the-linux-editor-locally). Windows/Linux cross-home profile sharing is outside this milestone: the two environments have different home directories and do not automatically share a `~/.moderado` profile.

## Local Debian installer and WSLg window checks

After building the Linux editor, run `./scripts/build-deb.sh`. It writes the
unsigned x64 installer into `build/installers/`. Install the selected file with
`sudo apt install ./build/installers/<filename>.deb` so runtime dependencies
are resolved. Launch it with `moderado-ide` or the application menu.

The agent sidebar uses the editor's resize divider. Drag the vertical edge
between the agent and editor to change its width; the prompt textarea's
non-resizable border is a different control.

On WSLg, the custom titlebar's native Electron control overlay may need a
separate check from the app content. In **Preferences: Open User Settings
(JSON)**, set `"window.controlsStyle": "custom"`, then close and restart the
app to try editor-drawn controls. Tests with an isolated profile verified
maximize/restore and clicking the close button with this setting. They did
not verify minimize: WSLg reported no minimized state or minimize event.
This setting is a diagnostic option, not a confirmed fix for all WSLg display
configurations. `Alt+F4` can close a focused window whose close button is
inaccessible. No existing user settings are changed by the build script.

## Building Windows locally

Prerequisites: Git Bash, Node 24.18.0, Python 3.11, jq, 7-Zip, Rust, and Visual
Studio Build Tools with the x64 Spectre libraries.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\vendor-moderado.ps1
cd vendor/moderado; npm install; npm run build; cd ..\..
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-m1.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-m1.ps1
```

`prepare-m1.ps1` is only needed once; it clones the pinned VSCodium revision,
fetches the pinned Code OSS revision, and installs its dependencies. Re-running it
fails on purpose rather than re-cloning over a prepared checkout.

## Windows build outputs

The local build writes these intermediate files to `build/vscodium/assets/`. The public release names are listed below; do not assume an intermediate filename is the final release asset name.

| File | What it is |
| --- | --- |
| `Moderado IDE-win32-x64-<version>.zip` | Portable editor, no installer |
| `Moderado IDESetup-x64-<version>.exe` | Per-machine installer (needs elevation) |
| `Moderado IDEUserSetup-x64-<version>.exe` | Per-user installer, no elevation |
| `build-manifest.json` | `VERSION`, both upstream revisions, SHA-256 and size per artifact |

## Public release asset naming conventions

Use these names for uploaded release assets. `<semver>` is the product version
without the connected build suffix (for example, `0.1.28`). `<full-version>`
includes the connected build suffix (for example, `0.1.28+261009d`). Keep the
platform, architecture, and package type in each filename:

| Platform | Public asset names | Manifest name |
| --- | --- | --- |
| Windows x64 | `Moderado-IDE-win32-x64-<semver>-portable.zip`<br>`Moderado-IDE-win32-x64-<semver>-Setup.exe`<br>`Moderado-IDE-win32-x64-<semver>-User-Setup.exe` | `build-manifest-windows-x64.json` |
| macOS Apple Silicon | `moderado-ide-<full-version>-macos-arm64.dmg` and `.zip` | `build-manifest-macos-arm64.json` |
| macOS Intel | `moderado-ide-<full-version>-macos-x64.dmg` and `.zip` | `build-manifest-macos-x64.json` |
| Linux x64 | `moderado-ide-<full-version>.amd64.deb`<br>`moderado-ide-<full-version>.x86_64.rpm` | `build-manifest-linux-x64.json` |

The platform build jobs may emit different intermediate filenames. Rename the
release copies to this convention without changing their bytes, verify each
uploaded digest against its build manifest or checksum file, and update the
release notes to use the public asset names. Upload and verify a replacement
before removing an older asset name. Keep manifests platform specific; the
Windows build's intermediate `build-manifest.json` is published as
`build-manifest-windows-x64.json`.

Current checksum assets are `SHA256SUMS` for macOS arm64,
`SHA256SUMS-macos-x64` for macOS Intel, and `SHA256SUMS-linux-x64` for Linux.
Windows artifact hashes are recorded in the Windows manifest. Use
`SHA256SUMS-<platform>` for any additional platform-specific checksum files.

The build script verifies both editor revisions against `sources.lock.json`
before packaging and refuses to record a stale artifact.

Do **not** use `-PackingOnly` for a release build. It skips
`vscode-min-prepack`, which is the step that packages local (non-native)
extensions, so the editor is produced with no agent at all while still
looking healthy. `scripts/verify-release.ps1` now checks the shipped zip for
the agent for exactly this reason.

To re-check an existing build without rebuilding:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-release.ps1
```

## Signing

Windows installers are **unsigned**; Windows SmartScreen may warn and there is
no Authenticode signature to validate. macOS images use ad-hoc signing only;
they are not Developer ID signed or notarized, so Gatekeeper may prevent them
from opening without local approval. Linux packages are unsigned. These are
the published v0.1.28 artifacts; no update channel is provided.

## Provenance and notices

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\gen-provenance.ps1
```

Writes `provenance.json` and `THIRD-PARTY-NOTICES.md` next to the artifacts,
generated from the build manifest, `sources.lock.json`, and the packaged editor.
Nothing in them is hand-written; if an artifact's digest, an upstream pin, or a
license file is missing or disagrees, the script throws instead of emitting a
plausible-looking file.

`provenance.json` is an **unsigned build record**, not a signature. It states
what was produced; it does not prove it to a third party. It does not replace
platform code signing or notarization.

The build now also copies `LICENSE.txt` (Code OSS, MIT) and the IDE license
into the portable editor. Upstream packaging ships Electron's
`LICENSES.chromium.html` but not the MIT text, so the package previously
redistributed MIT-licensed code with no copy of that license.

## Live provider smoke procedure

Live model calls require explicit opt-in and never run in CI:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\live-provider-smoke.ps1
```

That command **refuses** and explains why. It only proceeds with
`-IUnderstandThisCallsALiveModel`, and it refuses again if `CI`,
`GITHUB_ACTIONS`, `BUILDKITE`, or `TF_BUILD` is set. It performs no file
mutation and runs no commands, and it never writes or logs the API key.

**Still open:** platform code signing and notarization, an update channel, and
native Linux runtime installation verification. The current v0.1.28 artifacts
are published on the [GitHub Release page](https://github.com/marcuz-apl/moderado-ide/releases/latest).

## What works, and what does not

Working and verified on a real editor host:

- Launch, open a folder, integrated terminal
- Install and uninstall, including on a clean Windows account
- The Moderado agent extension: activation, chat view, streaming events,
  cancellation, and human approval for mutations and commands
- Session persistence and shared-profile reads/writes against `~/.moderado`

Not verified or not available:

- **Provider keys.** Runs and model discovery build their adapter from the
  active connection in `config.json`, using the vendored OpenAI-compatible or
  NVIDIA adapter, and resolve the key in the CLI's precedence order. There is
  still **no live model call in the verified evidence**: every recorded run
  used a profile with no resolvable key, so the fake provider path is what the
  tests and host check actually exercised. The real adapter path is covered by
  offline construction tests only.
- **No update channel.** Provenance and third-party notices are generated and
  verified. Windows and Linux artifacts are unsigned; macOS artifacts are
  ad-hoc signed and not notarized.
- **Native Linux installation.** The DEB metadata was inspected under WSL, but
  installation and runtime behavior were not verified on native Linux.
- **Chat view only.** There is no diff renderer; previews appear as text.
- **Profile coordination is one-sided.** IDE writes `config.json` under a
  lock and detects conflicting CLI changes, but the CLI does not take that lock,
  so a simultaneous CLI write can still be lost.

## Where data lives

| What | Where |
| --- | --- |
| Moderado agent config, sessions, skills | `%USERPROFILE%\.moderado\` (shared with the CLI) |
| Editor layout, extensions, caches | `%USERPROFILE%\.moderado-ide\` |
| Editor shared storage | `%USERPROFILE%\.moderado-ide-shared\` |

Editor state is deliberately separate from the agent profile, and neither
collides with VS Code or VSCodium.

## Uninstalling

The installer's uninstaller removes the installed editor. Moderado agent data
under `~/.moderado` is **not** removed, because the CLI also uses it; delete that
directory by hand only if you are certain you want to discard shared agent data.

## Third-party notices

The editor is built from MIT-licensed Code OSS through VSCodium's MIT-licensed
build scripts. `LICENSES.chromium.html` ships with the packaged editor and
carries the bundled Chromium/Electron third-party notices. Moderado's own code is
MIT; see [LICENSE](LICENSE).


### Provider keys on Linux

API Config accepts a pasted key in its masked API Key field. Save uses the editor’s secret storage and writes only a credential reference to the shared Moderado config. Unlock or configure your desktop keyring if secure storage is unavailable; the IDE does not silently write the key into config.json. A Linux IDE-stored key is local to the editor and is not available to the CLI’s in-memory credential store.
