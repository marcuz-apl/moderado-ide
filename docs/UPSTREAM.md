# Upstream source and distribution policy

IDE targets Linux, macOS, and Windows. The latest published stable release,
v0.1.30, contains Linux x64, macOS arm64 and x64, and Windows x64 packages
built from pinned source revisions. The v0.1.29 release was withdrawn.
Platform limitations and verification gaps are recorded in
[INSTALL.md](INSTALL.md); the release does not imply that every PRD gate is
complete.

## Source chain

Moderado IDE plans to use three independent source inputs:

1. [VSCodium](https://github.com/VSCodium/vscodium), an MIT-licensed repository
   of scripts and patches that builds Code OSS into redistributable binaries.
2. [Microsoft Code OSS](https://github.com/microsoft/vscode), the MIT-licensed
   editor source fetched by the downstream build process.
3. [Moderado CLI](https://github.com/marcuz-apl/moderado), the source of the
   agent contracts, provider-neutral core, and workspace tools.
   Gateway/provider adapters, presets, discovery, model policy, transport,
   and routing are IDE-owned code that adapts CLI `v0.4.10` behavior
   without using CLI provider code at runtime.

VSCodium is not a vendored editor library and its released executable is not
the IDE application. The IDE project will build its own product from
pinned source inputs. It must preserve the required upstream copyright and
license notices and review third-party assets included by the build. The
Microsoft-branded VS Code distribution and its product assets are separate
from the MIT-licensed Code OSS source.

## Pinning and updates

Record exact immutable revisions for VSCodium,
Code OSS, and Moderado in an IDE-owned source lock/manifest. The current
Moderado contracts/core/tools reference is CLI release `v0.4.10`, commit
`a3479fffc6e00ca8796893920930a258759243c5` (package version
`v0.4.10+2610105`, tag `v0.4.10`).
The owner authorized advancing this baseline on October 10, 2026. Do not
assume its npm package exposes the internal workspaces as separate
installable packages. IDE-owned Gateway/provider behavior instead
adapts CLI `v0.4.10` fixtures and behavior without using CLI provider code
at runtime. Updating the agent snapshot does not transfer provider ownership
to the CLI. Release manifests record the source revisions used for each
platform package. Build Moderado's internal packages from the pinned source revision and bundle
them with IDE. A build must record source revisions and IDE `VERSION`.

Update each upstream deliberately: read its release notes, rebase the small
downstream patch set, run offline Moderado tests, build the editor, exercise
the real editor-host flow, and inspect the produced artifact. An automatic
upstream fetch must never silently change a release build's source.

## Branding and services

The distributed editor uses Moderado names, icons, application and data-folder
identifiers, protocol handlers, installer IDs, and update endpoints. These
must be distinct from VS Code and VSCodium. The VSCodium preparation script
sets these fields through the IDE's product overlay. Use Open VSX or another compatible, permitted
extension source rather than assuming Microsoft Visual Studio Marketplace
access in a derivative distribution. Do not bundle a third-party extension
without checking its license and redistribution rights.

## Release ownership

IDE owns its own signing, checksums, artifact manifest, installer and
update channel. A successful CLI or VSCodium release does not certify an
IDE release. A manually dispatched full-platform build publishes only when it
uses the default source commit; partial builds and custom-source builds do not
publish. Starting that full release build is the owner's explicit release
authorization. The PRD gates remain the target for continued release readiness.
