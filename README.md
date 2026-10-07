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

There are no public downloads yet. Build the editor locally using the instructions below. When it starts, open a project and use the Moderado agent view to connect a provider and chat.

## Build the Linux/macOS/Windows editor locally

Builds use the pinned editor and Moderado source versions in [`sources.lock.json`](sources.lock.json).

### Linux x64

Use Node.js 24.18.0 and install the Linux build prerequisites:

```sh
sudo apt-get update
sudo apt-get install -y build-essential pkg-config jq python3 libx11-dev libx11-xcb-dev libxkbfile-dev libsecret-1-dev libkrb5-dev libnss3 libgtk-3-0t64 libasound2t64 libgbm-dev xvfb rustc cargo
git clone --depth 1 --branch 1.135.06055 https://github.com/VSCodium/vscodium.git .cache/vscodium
git clone --depth 1 --branch 1.135.0 https://github.com/microsoft/vscode.git .cache/vscodium/vscode
node scripts/build-linux.mjs
```

### Windows x64

Install Git Bash, Node.js 24.18.0, Python 3.11, jq, 7-Zip, Rust, and Visual Studio Build Tools with x64 Spectre libraries. From PowerShell, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\vendor-moderado.ps1
cd vendor/moderado; npm install; npm run build; cd ..\..
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-m1.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-m1.ps1
```

### macOS

macOS is a target platform, but this repository does not yet include a macOS build workflow.

## License

Moderado IDE is licensed under the MIT License. See [`LICENSE`](LICENSE).
