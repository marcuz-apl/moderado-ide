# Moderado IDE

Moderado IDE is a planned, independently installed coding IDE built from
the open Code OSS editor through VSCodium's downstream build approach. It will
bundle Moderado's provider-independent agent, model routing, workspace tools,
and approval UI. End users will not need to install Moderado CLI.

**Status:** Linux x64 development in WSL is the current priority. Existing Windows evidence predates the IDE rename and CLI `v0.4.8` source update; current builds need fresh verification. A local Windows x64 editor package and installers build
successfully and have passed editor-host, install/uninstall, and clean-account
checks. The pinned Moderado agent is vendored and bundled into a IDE
extension that activates in a real extension host, with a fail-closed approval
boundary, a chat view, model selection, and session persistence in the shared
`~/.moderado` profile. Sessions and configuration round-trip against the pinned
CLI in tests, and IDE writes the shared config under a lock with conflict
detection. The CLI does not yet participate in that lock, so a simultaneous CLI
write can still be lost; live provider calls are not established by the offline build evidence and there is no
published release or signature. `VERSION` does not announce a published IDE
build.

## Relationship to Moderado CLI

This is a separate repository and release train. The CLI remains the upstream
source for `@moderado/contracts`, `@moderado/core`, and `@moderado/tools`.
IDE builds pin CLI `v0.4.8` commit
`d5e263ed0c9ba6715d0ce69aa640b9b9111931c8` (`v0.4.8+261006d`) and bundle those packages.
IDE-owned provider adapters, presets, transport, and routing adapt CLI `v0.4.8` behavior without using CLI provider code at runtime. The IDE does not invoke or require an installed `moderado`
executable. IDE work must not edit the sibling CLI repository.

Both editions use the current user's `~/.moderado/` for Moderado configuration,
sessions, and skills. On Windows, `~` means `%USERPROFILE%`. Provider secrets
stored by the CLI in Windows Credential Manager remain there and must be
resolved through the same credential references. Editor layout, extensions,
cache, and other IDE-specific state stay separate. See
[Profile compatibility](docs/PROFILE.md).

## Product direction

- Moderado-branded IDE with an editor, terminal, project navigation, and a
  first-class Moderado agent surface.
- The same provider presets, model discovery, free-first routing, and paid/unknown
  cost opt-in rules as the pinned Moderado engine.
- Explicit human approval by default for file mutations and command execution.
- Linux, macOS, and Windows editions, starting with Linux x64 development in WSL.
- Small downstream patches so upstream editor security and compatibility updates
  remain feasible.

The [PRD](PRD.md) defines acceptance criteria, [AGENTS.md](AGENTS.md) governs
contributors, [upstream policy](docs/UPSTREAM.md) records source and licensing
boundaries, and the [roadmap](docs/ROADMAP.md) orders delivery. [HANDOFF.md](HANDOFF.md)
records the current state.

## Upstream sources

- [VSCodium](https://github.com/VSCodium/vscodium): MIT-licensed build scripts
  and downstream configuration for Code OSS.
- [Code OSS](https://github.com/microsoft/vscode): MIT-licensed editor source.
- [Moderado CLI](https://github.com/marcuz-apl/moderado): agent packages and
  the `v0.4.8` contracts/core/tools source; IDE provider behavior follows `v0.4.8` fixtures.

The project will preserve upstream license notices and use its own name, icons,
application identifiers, and update endpoints before any distribution.

## Build the Linux editor in WSL

Linux, macOS, and Windows are the target editions. Source development uses WSL; Linux packaging is paused while repository
naming and the existing Windows GUI are addressed. Keep the checkout and build cache in the Linux filesystem,
for example `/home/marcu/projects/moderado-ide`.

Install Node **24.18.0** and the Linux prerequisites:

```sh
sudo apt-get update
sudo apt-get install -y build-essential pkg-config jq python3 libx11-dev libx11-xcb-dev libxkbfile-dev libsecret-1-dev libkrb5-dev libnss3 libgtk-3-0t64 libasound2t64 libgbm-dev xvfb rustc cargo
git clone --depth 1 --branch 1.135.06055 https://github.com/VSCodium/vscodium.git .cache/vscodium
git clone --depth 1 --branch 1.135.0 https://github.com/microsoft/vscode.git .cache/vscodium/vscode
node scripts/build-linux.mjs
```

The script verifies immutable source pins, prepares VSCodium once, applies
Moderado branding, tests and bundles the agent, and builds the Linux editor.
Outputs are `.cache/vscodium/VSCode-linux-x64/` and a portable archive under
`.cache/vscodium/assets/`, with `build-manifest-linux.json`. These are local
development artifacts; older-distribution compatibility, macOS builds,
signing, and release publication require separate verification.

## Build the Windows editor locally

Install Git Bash, Node 24.18.0, Python 3.11, jq, 7-Zip, Rust, and Visual Studio
Build Tools with the x64 Spectre libraries. The build uses the immutable source
revisions in [sources.lock.json](sources.lock.json). From PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-m1.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-m1.ps1
```

Preparation fetches Code OSS through pinned VSCodium scripts and installs its
dependencies. Build outputs are under `.cache/vscodium/assets/`, with source
revisions, IDE version, checksums, and sizes in `build-manifest.json`.
The build script verifies both editor source revisions before packaging. If a
prepared checkout already exists, run only `build-m1.ps1`. These are local
unsigned test artifacts, not a release. The build bundles the Moderado agent extension.

## Repository development

After cloning, enable this repository's version hooks:

```sh
git config --local core.hooksPath .githooks
```

Use Conventional Commit subjects. Hooks advance the UTC daily build counter
and add the connected VERSION prefix. Set semantic version changes explicitly
in VERSION; major increments require owner approval. Planning history is in
[docs/planning](docs/planning/).
