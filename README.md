# Moderado IDE

Moderado IDE is a standalone coding editor with the Moderado AI agent built in. It is based on Code OSS and does not require the Moderado CLI to be installed.

## Tech stack

- **Code OSS:** The open-source editor that provides the desktop IDE.
- **VSCodium build tools:** Scripts used to build and package the editor from pinned source versions.
- **Moderado agent packages:** The CLI's contracts, agent core, and workspace tools, bundled into the IDE.
- **TypeScript extension:** IDE-owned provider integrations and the agent chat interface run as an editor extension.
- **Electron and Node.js:** The desktop runtime and build environment.

## Relationship to Moderado CLI

Moderado IDE and Moderado CLI are separate projects and releases. The IDE bundles pinned CLI agent packages, but owns its editor integration, provider connections, and user interface. Both use the same `~/.moderado` agent profile on the same operating system.

## Get started quickly

Download Moderado IDE v0.1.28 from the [GitHub Releases page](https://github.com/marcuz-apl/moderado-ide/releases/tag/v0.1.28%2B261009d). The release includes Windows x64, Linux x64, and macOS arm64 and x64 packages. Review [installation notes and platform limitations](docs/INSTALL.md) before installing. Windows installers are unsigned; macOS packages are ad-hoc signed and not notarized. Linux runtime installation has not been verified on a native Linux distribution. There is no built-in update channel.

## Build the Linux/macOS/Windows editor locally

Builds use the pinned editor and Moderado source versions in [`sources.lock.json`](sources.lock.json).

### Linux x64

Use Node.js 24.18.0 and install the Linux build prerequisites:

```sh
sudo apt-get update
sudo apt-get install -y build-essential pkg-config jq python3 libx11-dev libx11-xcb-dev libxkbfile-dev libsecret-1-dev libkrb5-dev libnss3 libgtk-3-0t64 libasound2t64 libgbm-dev xvfb rustc cargo
git clone --depth 1 --branch 1.135.06055 https://github.com/VSCodium/vscodium.git build/vscodium
git clone --depth 1 --branch 1.135.0 https://github.com/microsoft/vscode.git build/vscodium/vscode
node scripts/build-linux.mjs
```

To package the built editor as Linux installers:

```sh
./scripts/build-deb.sh
./scripts/build-rpm.sh
```

Both scripts create `build/installers/` and write their installer there by
default. Debian packaging requires `dpkg-deb`; RPM packaging requires
`rpmbuild`. Supply an editor tree and output directory as positional arguments
to override the defaults.

### Windows x64

Install Git Bash, Node.js 24.18.0, Python 3.11, jq, 7-Zip, Rust, and Visual Studio Build Tools with x64 Spectre libraries. From PowerShell, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\vendor-moderado.ps1
cd vendor/moderado; npm install; npm run build; cd ..\..
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-m1.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-m1.ps1
```

### macOS (Apple Silicon and Intel)

The v0.1.28 release includes builds for both Mac processor families. Choose
**arm64** for Apple Silicon Macs (M-series) and **x64** for Intel Macs. Each
architecture has a DMG installer and a ZIP archive:

- [Apple Silicon arm64 DMG](https://github.com/marcuz-apl/moderado-ide/releases/download/v0.1.28%2B261009d/moderado-ide-0.1.28%2B261009d-macos-arm64.dmg) · [ZIP](https://github.com/marcuz-apl/moderado-ide/releases/download/v0.1.28%2B261009d/moderado-ide-0.1.28%2B261009d-macos-arm64.zip)
- [Intel x64 DMG](https://github.com/marcuz-apl/moderado-ide/releases/download/v0.1.28%2B261009d/moderado-ide-0.1.28%2B261009d-macos-x64.dmg) · [ZIP](https://github.com/marcuz-apl/moderado-ide/releases/download/v0.1.28%2B261009d/moderado-ide-0.1.28%2B261009d-macos-x64.zip)

Both builds use ad-hoc signing only; they are not Developer ID signed or
notarized, so Gatekeeper may require local approval before opening them. The
manual GitHub Actions workflow builds both architectures from the pinned
sources; its artifacts are reviewed and attached to the GitHub Release
separately.

### Build all platform artifacts in GitHub Actions

From the repository's Actions tab, run **build-and-release** with platform
**all** and macOS architectures **both**. The workflow builds Linux x64
(portable `.tar.gz`, `.deb`, and `.rpm`), Windows x64 (portable `.zip` and both
`.exe` installers), and macOS arm64/x64 (`.dmg` and `.zip`) as separate
artifacts retained in Actions for 30 days. The workflow does not create or
update a GitHub Release; release assets are attached separately after their
names, checksums, manifests, and notes are reviewed. Windows outputs are
unsigned. macOS outputs are ad-hoc signed only and are not notarized. See
[release asset naming conventions](docs/INSTALL.md#public-release-asset-naming-conventions)
when preparing future releases.

## License

Moderado IDE is licensed under the MIT License. See [`LICENSE`](LICENSE).
