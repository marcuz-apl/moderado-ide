# Project Handoff

Updated: 2026-10-08 UTC
Branch: master
Status: Source renamed **Moderado IDE** (`moderado-ide`) and baseline advanced
and verified against CLI **v0.4.8**. Owner-triggered Linux/macOS/Windows
artifact builds are being repaired; publishing remains disabled and unauthorized.
Local and remote repositories are renamed, and source checkpoint `7ec0923`
is pushed.

## Cross-platform artifact workflow recovery (2026-10-08 UTC)

The all-platform Actions run [37851930865](https://github.com/marcuz-apl/moderado-ide/actions/runs/37851930865)
used source `a917986`, before the token-header change, and completed with
failure. Linux x64 passed and uploaded an artifact, but that artifact does not
contain the current source. Windows failed because Visual Studio Installer
rejects the unsupported `--wait` option. macOS arm64 and x64 failed the offline
suite because some test fixture roots still resolved through `/var` symlinks;
macOS x64 also exceeded the default timeout in the large restored-image test.
The following all-platform run [37853809403](https://github.com/marcuz-apl/moderado-ide/actions/runs/37853809403)
failed again: Windows still lacked Spectre libraries because the generic
component ID was not valid for the runner's VS 2026 toolset, and macOS arm64
ran out of V8 heap during `compile-src` at about 4 GiB. Linux and macOS x64
were still building when those failures were inspected.

Microsoft documents `--wait` as a bootstrapper-only option; installed VS
`setup.exe` returns before the component is ready. The Windows job now uses
Microsoft's Build Tools bootstrapper, verifies its Authenticode signature,
uses the VS 2026 stable bootstrapper, waits for the modify operation, and
targets the VS 18 instance explicitly. When absent, the workflow installs the
VS 2026 Build Tools C++ workload and
`Microsoft.VisualStudio.Component.VC.14.50.18.0.x86.x64.Spectre` into a fresh
VS 18 instance rather than trying to add a VS 18 component to an older VS
instance. macOS builds now use the 12 GiB V8 heap size used by the pinned
VSCodium macOS workflows.
The latest run [37856607916](https://github.com/marcuz-apl/moderado-ide/actions/runs/37856607916)
confirmed that modifying the runner's selected C++ instance on the VS 18
channel still left the Spectre component absent. Windows failed at prerequisite verification;
macOS and Linux were still building when this handoff was updated. The channel
ID correction is covered by the workflow test and needs a fresh all-platform
run before any artifact is called release-ready.
Run [37857820215](https://github.com/marcuz-apl/moderado-ide/actions/runs/37857820215)
later passed Linux but failed both macOS architectures. Arm64 hit a V8 heap OOM
at approximately 4 GiB because its job overrode the macOS build script's 12 GiB
heap default with `MODERADO_BUILD_HEAP_MB=4096`. That override is removed, and
the workflow regression test prevents its reintroduction. macOS x64 failed
agent-freshness verification because the app's `Contents/Resources` directory
was passed as the package root, making the verifier search for a duplicate
`Resources/resources` path. The verifier now receives the app bundle root and
has a fixture test for the macOS layout. A fresh macOS matrix run is required
to verify both fixes; no artifact is yet release-ready.
Run [37862200953](https://github.com/marcuz-apl/moderado-ide/actions/runs/37862200953)
was started to test the arm64 heap change only and predates this bundle-path fix.
The Windows job in [37857820215](https://github.com/marcuz-apl/moderado-ide/actions/runs/37857820215)
passed Visual Studio 2026 component-registration checks but `@vscode/deviceid`
still failed with `MSB8040` because MSBuild could not find the x64 Spectre
libraries. The workflow had trusted `vswhere` registration rather than checking
the toolset files and selected VS 2026 despite the upstream `vs2022_install`
build interface. Windows builds now share
`scripts/ensure-windows-build-tools.ps1`, require VS 2022 and the 14.44 x86/x64
Spectre component, verify the default toolset's x86 and x64 `libcmt.lib` paths,
and explicitly select VS 2022 in node-gyp. Actions can install the prerequisites
through the same script; local preparation/build scripts validate and reuse it.
For a local build, run `.\scripts\ensure-windows-build-tools.ps1
-InstallIfMissing` from an elevated PowerShell prompt once, then
`.\scripts\prepare-m1.ps1` and `.\scripts\build-m1.ps1`. The Actions job calls
the same prerequisite script before those build scripts. A fresh Windows run
must pass before claiming an installer is verified.
Host and attachment test fixtures canonicalize their temporary roots with
`realpathSync`, preserving production symlink checks. The restored-image limit
test keeps its over-limit coverage with smaller fixtures and a 30-second
timeout. The pinned ripgrep downloader still uses a read-only Actions token
only in the macOS build steps.

Verification on the Windows workspace:
- `node --test scripts/test/workflow.test.mjs`: 3 passed, including the
  bootstrapper signature and blocking invocation checks.
- `node --test scripts/test/build-macos.test.mjs`: 6 passed, including the
  macOS V8 heap configuration.
- `npm --prefix extensions/moderado-agent test -- test/host.test.ts`: 46 passed.
- `npm --prefix extensions/moderado-agent test -- test/attachments.test.ts -t
  'caps restored history images across messages'`: 1 passed.
- `npm --prefix extensions/moderado-agent run typecheck` and `git diff --check`:
  passed.
- The full attachment test file still has three symlink cases that cannot run
  on this Windows workspace without symlink privileges (EPERM); those cases
  are covered by the macOS workflow.

The workflow and fixture fixes require a fresh `platform=all`,
`macos_arch=both` run from the latest source before any platform can be called
current or release-ready. Publishing remains disabled and unauthorized.

## Settings navigation and discovery cleanup (2026-10-08 UTC)

Removed the General tab. Preferred reply language remains configurable under
Features, and existing editor preference values continue to be read and saved.
Successful model discovery now fills the model selector without rendering a
redundant model-count status on API Config, Features, About, or the Free/Paid
model tabs; provider errors and empty catalogs still report their status.

Verification:
- The new discovery, navigation, feature-preference, and host tests failed
  before implementation and passed afterward:
  `npm --prefix extensions/moderado-agent test -- test/model-discovery.test.ts
  test/settings-preferences.test.ts test/settings-view.test.ts
  test/settings-host.test.ts test/chat-view.test.ts` — 135 passed.
- `npm --prefix extensions/moderado-agent run typecheck`: passed.
- `npm --prefix extensions/moderado-agent run compile`: passed; 560 KiB bundle.
- `node --test scripts/test/settings-webview.test.mjs` with
  `MODERADO_PLAYWRIGHT_PATH` set to the pinned editor Playwright: 1 passed.
  It checks the empty success status, absent General tab, and retained language
  preference interaction in a real webview browser.

## Token usage in the Moderado header (2026-10-08 UTC)

The header now shows the current task's cumulative input, output, and total
tokens plus rounded output rate in the requested `In: n | Out: n | Total: n |
Rate: n tok/s` format. Counts update from provider usage events, reset when a
new task begins, and retain an explanatory tooltip distinguishing estimated
counts from provider-reported usage.

Verification:
- `npm --prefix extensions/moderado-agent test -- test/chat-view.test.ts
  test/settings-host.test.ts`: 112 passed.
- `node --test scripts/test/settings-webview.test.mjs` with the pinned editor
  Playwright: 1 passed; verifies live header refresh and exact formatted text.
- `npm --prefix extensions/moderado-agent run typecheck`: passed.

## Auto-Approve defaults (2026-10-07 UTC)

- Enabled Read files, Edit files, Fetch web content, and Use MCP servers on
  startup. Execute commands remains approval-gated. The host automatically
  approves matching requests; users can turn off categories to require review.
  Cancellation, Plan mode, explicit MCP server trust, and complete-preview
  checks remain in force.
- `npm --prefix extensions/moderado-agent test -- test/auto-approve.test.ts test/chat-view.test.ts test/settings-host.test.ts -t 'auto-approve|default auto-approval'`:
  15 passed. `npm --prefix extensions/moderado-agent run typecheck`: exit 0.
  `npm --prefix extensions/moderado-agent run compile`: exit 0.
- Full extension suite: 330 passed, 4 skipped, 3 failed in pre-existing
  worktree changes: two RECENT-list tests conflict with the new history-closed
  default, and one settings navigation test conflicts with pending settings UI
  changes. These unrelated changes were left untouched.

## Center-workspace logo accent (2026-10-07 UTC)

- Added the app icon's `#ff8b5c` accent dot to all four center-workspace
  watermarks: dark, light, high-contrast dark and high-contrast light. Its
  coordinates/radius are scaled from the icon by 0.4, and it sits outside
  the faint letter group so its color remains visible.
- Offline Python XML validation failed first because the dot was missing;
  after the edit, all four SVGs parsed and matched the icon's color and
  scaled geometry. `node --test scripts/test/build-linux.test.mjs`: 4/4 pass.
  `git diff --check`: pass. No application rebuild or live visual check was run.

## Composer context and attachments (2026-10-07 UTC)

- Bottom-row `@` now adds project-file references, followed by `+` for native
  **Add files and Images** selection. The plus action no longer clears the
  conversation. Removable chips show selected inputs; images/text files may
  come from anywhere only through an explicit native selection.
- Project references use the existing workspace jail and protected-metadata
  checks. A native browse option reaches files outside the quick-pick listing.
  Renderer messages accept intents/host-issued IDs, never file paths or bytes.
- Text is bounded and delimited as untrusted context. PNG/JPEG/WebP/GIF images
  use validated OpenAI content parts in the IDE-owned transport. Snapshots are
  IDE-only state under `~/.moderado/desktop/attachments`, bound to workspace,
  session and exact user message; shared contracts/session schemas stay unchanged.
  Missing/corrupt snapshots fail with reattach guidance. File-count, per-file
  and aggregate byte limits apply, including restored history.
- Tests first demonstrated missing controls/pickers, then verified native
  external-file selection, root-only references, removals, malicious renderer
  path rejection, image-only inputs, genuine image delivery and restart restoration.
  `npm --prefix extensions/moderado-agent test`: 320 passed/four Windows skips
  before the final browse regression; final results recorded below after rerun.
  `npm --prefix extensions/moderado-agent run typecheck`: exit 0.
  `npm --prefix extensions/moderado-agent run compile`: exit 0, 528 KiB bundle.
  No full editor build or live image inference ran. The installed app needs
  rebuilding to display the new controls.

## Current checkpoint (2026-10-07 UTC)

- Owner confirmed Linux, macOS, and Windows editions, then paused Linux
  packaging to prioritize repository naming and GUI work using the existing
  Windows build. Source work remains on Linux; no Windows `D:` or sibling CLI
  files were modified during this work.
- Local repository is now `/home/marcu/projects/moderado-ide`. A temporary
  `/home/marcu/projects/moderado-desktop` symlink preserves the currently open
  workspace. Reopen the IDE at the new path; the old-path alias can then be
  removed. Remote is now `https://github.com/marcuz-apl/moderado-ide`; `origin` points
  there. Source checkpoint `7ec0923` is committed and pushed to `master`;
  GitHub API confirmed its exact SHA matches local HEAD.
- Product/build/documentation names use **Moderado IDE** / `moderado-ide`,
  including the executable, protocol, editor data-folder and OS identifiers.
  Existing installer GUIDs are preserved. Shared agent data remains
  `~/.moderado`, including its reserved `desktop/` state directory; Windows
  credential targets remain unchanged. No profile migration was performed.
- Actual pinned CLI source is now **v0.4.8**, commit
  `d5e263ed0c9ba6715d0ce69aa640b9b9111931c8`, annotated tag object
  `8d9b75df038a3cd6764dcf11a218ca6d47fcb27c`, package version
  `v0.4.8+261006d`. Pins were independently checked with `git ls-remote`
  and an IDE-local cached clone. Contracts/core/tools and MIT license were
  reviewed: no new runtime dependencies or approval/jail boundary changes.
  Gateway/provider transport and routing remain IDE-owned. Historical plans
  now carry superseded-baseline notices rather than rewritten old evidence.
- `node scripts/vendor-moderado.mjs` exports the reviewed snapshot without
  editing the CLI checkout and records 56 files in `vendor/moderado/VENDORED.json`.
  Vendored MIT license is preserved. Windows vendoring also exports that license.
  Provider package source remains vendored for the fake adapter; production
  transport/catalog/routing continue to use the IDE-owned implementation.
- New core Gateway AUTO routing asks `classifyModel('auto')` directly, bypassing
  the IDE router's old special selection path. A failing offline test caught
  lost tool-support metadata; the small router fix preserves confirmed Free
  AUTO metadata. Additional fake-provider regressions cover Gateway history
  preservation, omission of a client output-token default, and server-owned
  retry/fallback. Default approvals/request-ID/deadline protections remain.
- Verification from this Linux source tree:
  - `npm --prefix vendor/moderado run build`: exit 0.
  - Extension `npm test -- test/model-router.test.ts test/host.test.ts`:
    50/50 pass after demonstrating the original failures.
  - Extension full `npm test`: **295 pass / four Windows-only skips** across
    14 files. `npm run typecheck` and `npm run compile`: exit 0, 510 KiB bundle.
  - Upstream v0.4.8 contracts/core/tools tests run offline from isolated cached
    copies against the actual vendored source: **169/169 across 19 files**.
    Command: `node extensions/moderado-agent/node_modules/vitest/vitest.mjs run
    --root .cache/upstream-check --config .cache/upstream-check/vitest.config.mjs`.
    Log: `.cache/upstream-v048-tests.log`. No model calls or real-profile writes.
  - `node --test scripts/test/build-linux.test.mjs`: **4/4 pass**. Tests cover
    renamed branding, missing agent/native files, stale preparation and stale
    agent rejection. Bundle freshness compares manifest JSON semantically
    because upstream packaging changes whitespace, while bundle bytes remain exact.
  - `node --check` on Linux build/smoke/vendor scripts and `git diff --check`:
    pass. A focused independent read-only final source review found no blocker.
- Desktop-local Git hooks are configured with
  `git config --local core.hooksPath .githooks`; Linux executable bits were
  restored. Shell syntax checks and an isolated fixture commit verified the
  automatic VERSION counter and Conventional Commit prefix. No CLI Git
  configuration was reused.
- Added reusable Linux build/vendoring tooling. User installed Linux system
  prerequisites; pinned Node 24.18.0 archive and local header archive were
  SHA-256 verified. Initial preparation recovered from network timeouts by
  installing verified headers through node-gyp's `--tarball` option. Native
  dependencies use the pinned upstream Chromium/Electron toolchain.
- **Historical local Linux evidence, before the v0.4.8 refresh:** prepack,
  policy generation and Linux packing succeeded under the new product name.
  Five native modules loaded through packaged Electron. The initial probe
  needed `NODE_PATH` set to the packaged `node_modules.asar`; it was a probe
  resolution issue. An isolated real editor-host test activated the packaged
  agent, registered all seven commands, completed one fake-provider turn and
  saved one fixture session. Result: `.cache/linux-hostcheck-0rVl1a/result.json`.
  This artifact still contains the previous engine snapshot and is not evidence
  of a finished v0.4.8 Linux build.
- **Current Linux build is stopped**, not complete. The v0.4.8 build reached
  source compilation and was terminated at the owner's explicit request.
  Log: `.cache/build-linux-ide-v048.log`. No final v0.4.8 Linux archive,
  checksum manifest or newly built Windows/macOS package is claimed. GUI
  improvement has not started. No signing, publishing or live inference occurred.
- Initial Git push preflight lacked authentication, and the first browser
  authorization returned HTTP 500. The owner then authenticated GitHub on Linux.
  Admin access was verified, `gh api --method PATCH repos/marcuz-apl/moderado-desktop -f name=moderado-ide`
  successfully renamed the remote, `git remote set-url origin` updated this
  checkout, and `gh auth setup-git --hostname github.com` enabled the Git helper.
  `git fetch origin` confirmed no history divergence; authenticated
  `git push --dry-run origin HEAD:master` passed.
- `git commit -m 'feat: rename Moderado IDE and align CLI v0.4.8 baseline'`
  succeeded as `7ec09237b4ffb46daffb9137ba491fa89fd28abd`; version hooks produced
  `v0.1.0+2610074`. `git push -u origin master` succeeded. GitHub API
  `gh api repos/marcuz-apl/moderado-ide/commits/master --jq .sha` matched local
  `git rev-parse HEAD`, and `git status --short` was empty. This follow-up
  records that verified source push; generated caches and app artifacts were
  excluded from Git.

Historical records below retain original names, artifact paths and outcomes.

## Summary

Moderado Desktop is an independent, self-contained IDE project planned around
Code OSS/VSCodium build inputs and the pinned Moderado agent packages. A local
Windows x64 editor package and installers have been built and verified. Nothing
is published or signed, and no Moderado agent integration exists yet.

## Completed

- Defined product requirements, contributor boundaries, upstream policy,
  shared-profile contract, delivery roadmap, and independent version.
- Selected Windows x64 as the first target and a CLI `v0.3.10` behavioral
  reference without altering the CLI repository.

## In progress

- Nothing is in progress. M4 release *evidence* is complete; signing and
  publication are blocked on owner authorization and were not requested.

## Working tree

- Independent Git repository on `master`; M4 evidence, documentation, and the
  release verification script are committed here.

## Checks

- Build artifacts and their SHA-256 values verified against
  `.cache/vscodium/assets/build-manifest.json`.
- Editor-host launch, open-folder, and terminal: PASS.
- Install and uninstall on the build account: PASS.
- Clean-account install/uninstall in Windows Sandbox: PASS.
- Agent extension offline suite: 148/148 passing; typecheck clean.
- `scripts/verify-release.ps1`: 28/28 checks pass against the 2026-10-03
  artifacts, including that the shipped zip actually contains the agent.

## Decisions and context

- End users must not need a separate CLI installation.
- The same user's `~/.moderado` is shared for agent data; editor state is
  isolated. Current CLI config writes have a cross-process lost-update risk.
- Windows provider credentials live in Credential Manager, outside the shared
  folder. Windows/Linux cross-home sharing is outside the initial release.
- Desktop requires human approval by default for mutations and commands. The
  current CLI handler can auto-approve, so this is a deliberate safety
  difference rather than an existing parity claim.
- The current core lacks complete previews for all writes and validation of
  approval decision IDs; Desktop must close those gaps before agent writes.
- Configured MCP servers are external processes with user privileges, not
  confined by the built-in file-tool jail.
- Upstream source revisions and license notices must be pinned before a build.

## Blockers

- No current toolchain blocker is confirmed. The earlier missing Spectre
  libraries have been installed; dependency installation must finish before
  the VSCodium packaging step can start.

## Source pinning milestone (2026-09-30 UTC)

- Added `sources.lock.json` with exact VSCodium `1.135.06055`, its Code OSS
  `1.135.0` source commit, and Moderado CLI `v0.3.10` revisions.
- Confirmed VSCodium's `upstream/stable.json` pins Code OSS commit
  `08d4889f9ec4a1685d257b9b95de036c8e1ce1e5`; confirmed both tags and full
  commit IDs with `git ls-remote` and local source clones.
- Corrected the earlier CLI snapshot: published v0.3.10 is annotated tag object
  `638008f99eb59209d0d2830b95d9b0cd2a09b225`, peeling to
  `a293c1d84d28d1b126fc7054a0f57011edc9d62c`. The previous
  `44251dce6cca0a3385196284c7b993e8ee964e0f` is not an ancestor of that tag.
- VSCodium's Windows build guide requires Git Bash, Node 24.18.0, jq,
  Python 3.11, Rustup, and 7-Zip. Node 24.18.0 and Rust are present; jq and
  7-Zip are absent, Python 3.14.6 is installed, and the available `bash.exe`
  resolves to a Linux distribution that could not be accessed. No `product.json`
  Desktop overlay exists.
- No editor source build or tests were run. Temporary source clones were kept
  under `.cache` and removed after inspection.

## Initial push checks (2026-10-01 UTC)

- Installed Desktop-local hooks with `git config --local core.hooksPath .githooks`.
- Git Bash temporary-repository checks: PASS for committed VERSION, matching
  commit prefix, daily counter increment, and clean index after two commits.
- Hook shell syntax checks: PASS using Git Bash `sh -n`.
- Secret-pattern scan: no private-key blocks or matching GitHub/OpenAI tokens.
- `git ls-remote --heads origin`: PASS; remote has no branches before first push.
- No app tests or build ran; this remains a documentation scaffold.
- Hooks automate build counters and subject prefixes. Semantic version changes
  must be set explicitly in VERSION; major increments need owner approval.

## Windows build attempt (2026-10-01 UTC)

- Added Desktop-owned `branding/product.json` with Moderado Desktop identity,
  unique data/protocol IDs, and Open VSX gallery settings. Applied it only to
  the ignored VSCodium build checkout under `.cache`.
- Cloned pinned VSCodium `1.135.06055` and its Code OSS `1.135.0` source into
  `.cache/vscodium`; VSCodium preparation patches completed successfully.
- Environment confirmed: Node 24.18.0, Git Bash, jq 1.8.2, Python 3.11.15,
  7-Zip, Rust, and Visual Studio 2026 Build Tools.
- Command attempted from the Code OSS checkout:
  `npm ci` with `PYTHON`/`npm_config_python` set to Python 3.11.15,
  Electron/Playwright binary downloads skipped, and `vs2022_install` pointing
  to Visual Studio 2026 Build Tools. Result: FAIL at native addon build,
  `MSB8040: Spectre-mitigated libraries are required` for
  `@vscode/deviceid`.
- Located the correct catalog component ID:
  `Component.VC.14.50.18.0.x86.x64.Spectre`. Installer CLI attempts returned
  without adding the component; `vswhere` confirms it remains absent. The
  installer log reports exit code 5007: quiet operations must start elevated.
- The follow-up `setup.exe ... --passive --norestart` RunAs attempt loaded the
  instance manifest but did not install the component. `vswhere` still does
  not list it and `lib\x64\spectre` is absent.
- No application artifact was produced. Do not claim the app builds until the
  component is installed and compile commands complete successfully.

To unblock from an elevated PowerShell prompt, run:
`& 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\setup.exe' modify --installPath 'C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools' --add Component.VC.14.50.18.0.x86.x64.Spectre --quiet --norestart`
Then verify with:
`& 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe' -products '*' -requires Component.VC.14.50.18.0.x86.x64.Spectre -property installationPath`

## Milestone 1 status (2026-10-01 client date)

- Foundation inputs are present: immutable revisions in `sources.lock.json`,
  preserved upstream license files in the ignored VSCodium build checkout,
  and a Desktop product overlay in `branding/product.json`.
- The pinned VSCodium checkout is prepared under `.cache/vscodium`, with only
  its local `product.json` overlay modified. The source checkout is ignored and
  is not a deliverable artifact.
- At the start of the 2026-10-01 build attempt, the x86/x64 Spectre library
  directories were empty. After installation, they contain libraries under
  `VC\Tools\MSVC\14.51.36231\lib\spectre`; the 14.51 x86/x64 Spectre
  component is the one matching this installed toolset.
- `npm ci` completed successfully from the pinned Code OSS checkout with Node
  24.18.0 and the Visual Studio 2026 MSVC 14.51 Spectre libraries.
- The main Code OSS source compilation and native/non-native extension bundles
  passed. VSCodium packaging attempts exposed environment and invocation
  issues: the tested package tree was built from the inner Code OSS checkout,
  and an early packaging attempt ran with Electron downloads disabled, leaving
  a Node executable in place of the Electron launcher. These outputs are
  diagnostic only and are not M1 artifacts.
- The locally cached Electron 42.8.1 x64 archive matches the pinned
  `build/checksums/electron.txt` SHA-256 (`7a1aff619f94ead8a377d82e1f59bfd9a31a17db5b948f82fc5e60d576fe9304`).
  This verifies the archive only; it does not validate an assembled Desktop
  package.
- M1 is **functionally complete**; the evidence below was produced on
  2026-10-01 from the pinned revisions. No agent integration is claimed at this
  gate, and nothing is published or signed.

### M1 verification evidence (2026-10-01)

Build artifacts, with SHA-256 and sizes recorded in
`.cache/vscodium/assets/build-manifest.json`:

| Artifact | Bytes | SHA-256 (first 16) |
| --- | --- | --- |
| `Moderado Desktop-win32-x64-1.135.06055.zip` | 312528587 | `F61E6FFEEF6E03C2` |
| `Moderado DesktopSetup-x64-1.135.06055.exe` | 212996704 | `1693D0AEA0AA1288` |
| `Moderado DesktopUserSetup-x64-1.135.06055.exe` | 212996967 | `AAABB391CA8FD775` |

The manifest records `desktopVersion v0.1.0+2610013`, VSCodium
`5a73682ca091082675b10c9dc3f348c1d824d94f`, Code OSS
`08d4889f9ec4a1685d257b9b95de036c8e1ce1e5`, and the pinned Moderado
reference `a293c1d84d28d1b126fc7054a0f57011edc9d62c`. `scripts/build-m1.ps1`
re-checks both editor revisions against `sources.lock.json` and rejects stale
artifacts before writing the manifest.

Distinct identity confirmed in the packaged
`VSCode-win32-x64/resources/app/product.json`: `Moderado Desktop`,
`.moderado-desktop` data folder, `moderado-desktop` URL scheme,
`Moderado.Desktop` AUMID, `moderadodesktop` mutex, Desktop-specific AppIDs and
CLSIDs, Open VSX gallery, and empty update/download URLs.

Real editor-host check, `.cache/m1-final-check/`:

- `extension-result.json` â€” folder opened and a live terminal PID returned.
- `terminal-result.txt` â€” `terminal-ok`.
- `host-profile/logs/20261001T160305/` â€” extension host started and
  `moderado.moderado-m1-smoke` activated, confirming a real host rather than a
  mocked `vscode` module.

Install/uninstall on the build account:

- `install.log` â€” UserSetup installed to a scratch directory and launched
  `Moderado Desktop.exe`.
- `uninstall.log` â€” "Uninstallation process succeededâ€¦ Removed all? Yes".

Clean-account check in a Windows Sandbox VM under `WDAGUtilityAccount`,
`sandbox-shared/result.json`:

```json
{ "account": "25A58DCF-2085-4\\WDAGUtilityAccount", "installExit": 0,
  "installed": true, "productName": "Moderado Desktop",
  "uninstallExit": 0, "executableRemoved": true }
```

### Milestone 2 evidence (agent integration)

**Vendored agent.** `scripts/vendor-moderado.ps1` exports the pinned packages
with `git archive` at commit `a293c1d84d28d1b126fc7054a0f57011edc9d62c`
(53 files, tree hash `5c279cc86652fe179fb585af6edc4a237f4d8f4a1c674f4efe31a3c9f7dded14`,
recorded in `vendor/moderado/VENDORED.json`). The CLI working tree was verified
clean and unmodified before and after. All four packages compile with
`npm run build` in `vendor/moderado`.

**Fail-closed approval boundary.** `extensions/moderado-agent/src/approval.ts`
closes the gaps the PRD records against the current core:

- A decision is honoured only when its `requestId` matches the pending request;
  a mismatch, a malformed shape, a closed view, a host-enforced timeout,
  cancellation, or a non-interactive context all **deny**.
- The host owns an explicit deadline because the core's `timeoutSeconds` field
  is not enforced.
- A write or command without a complete preview is denied rather than approved.

**Offline suite.** `npx vitest run` in `extensions/moderado-agent`:
**38 passed / 38** across 3 files (12 approval, 11 profile, 15 host). Coverage
includes approval deny on denial, timeout, mismatch, closed UI, cancellation and
non-interactive contexts; that no file is written when approval fails;
workspace-jail traversal refusal; a bounded agent turn against the vendored core
using its fake provider, asserting free-first routing selects
`mock/free-tool-model` rather than the paid model; session persistence and resume
against an isolated fixture home; and corrupt-config / corrupt-session handling.

**Typecheck and bundle.** `npx tsc --noEmit` exits 0. `npm run compile`
(esbuild) emits `dist/extension.js` + `dist/agent-core.js`, about 256 KiB total,
with `vscode` external and the vendored agent inlined.

**Real editor-host check.** The bundle was loaded by the M1 Windows editor in a
real extension host (`exthost.log` shows
`ExtensionService#_doActivateExtension moderado.moderado-agent`), and the host
check reported:

```json
{ "ok": true,
  "checks": { "found": true, "isActive": true, "expectedCommandsPresent": true,
    "commands": ["moderado.cancelRun", "moderado.configureProvider",
      "moderado.openChat", "moderado.selectModel", "moderado.togglePlanMode"] } }
```

Three bundling defects were found and fixed by making the build fail loudly
rather than silently shipping an unusable bundle: esbuild emitted ESM exports as
dead code (`0 && (module.exports = â€¦)`), the entry resolved `require` against
esbuild's generated `main.node_modules` directory, and the exported global was
never defined. `scripts/bundle.mjs` now asserts a reachable `module.exports` and
smoke-loads the bundle against a stubbed host before exiting.

### Milestone 3 evidence (shared profile compatibility)

**Round-trip against the pinned CLI.** `test/profile.test.ts` loads the sibling
CLI's compiled `apps/cli/dist/sessions.js` and exchanges real records:

| Case | Result |
| --- | --- |
| Desktop reads a session the CLI wrote | PASS |
| The CLI reads a session Desktop wrote | PASS |
| Both resolve the same session directory for one workspace | PASS |
| Both accept/reject the same session records | PASS |

A CLI-written record is found by Desktop in the CLI's own hash directory, and a
Desktop-written record is listed by the CLI's `listSessions`. The tests skip
themselves if the CLI `dist` is absent rather than silently passing.

**Credential references.** `credentialReference` reproduces the CLI's
normalization exactly (trim, lowercase, each run outside `[a-z0-9_-]` becomes one
hyphen) and `resolveCredential` preserves its precedence: environment, then
credential reference, then legacy plaintext. `WindowsCredentialStore` reaches
Credential Manager through an encoded PowerShell bridge spawned with
`shell: false`; the key travels only over stdin, and failures raise a message
that names neither the secret nor the reference.

**Coordinated config writes.** `updateConfigCoordinated` takes a `wx` lock file,
re-reads `config.json` *inside* the lock, and merges one level deep so a sibling's
connection is not dropped. Where Desktop declares a field it owns, `expected`
detects that another process changed it and refuses to write, leaving the other
process's value intact. The lock is removed afterwards and an abandoned lock
older than the timeout is reclaimed.

**Session conflicts.** `saveSessionChecked` compares the `updatedAt` Desktop last
read against what is on disk. On a mismatch it refuses and reports a
`session_conflict` event, and the test asserts the CLI's message survives. The
comparison is on the recorded timestamp rather than file mtime because mtime
granularity is too coarse to catch a same-millisecond write.

**Skills.** `discoverSkills` reads `skills/<name>/SKILL.md` from the shared
tree, bounds the size, and reports empty or unreadable entries instead of
dropping them silently. Skill bodies remain untrusted content.

**Suite.** `npx vitest run`: **58 passed / 58** across 3 files (12 approval, 31
profile/session including the CLI round-trips, 15 host). `tsc --noEmit` exits 0.
The bundle is about 403 KiB and the extension activates in the real editor host
with all six commands registered.

**Known limit.** The CLI does not participate in Desktop's lock. Desktop's write
is therefore atomic and conflict-aware, and it re-reads under the lock, but a CLI
write landing between Desktop's read and its write can still be lost. Closing
that requires a protocol both editions follow, delivered as a separate reviewed
CLI change.

### Milestone 2 follow-ups

- **Profile and session layer added.** `src/profile.ts` canonicalizes the
  workspace root (resolving symlinks, Windows verbatim prefixes, drive-letter
  case, and trailing separators) and reads the shared `config.json`,
  distinguishing *missing* from *invalid* so a corrupt profile is never
  overwritten with defaults. `mergeConfig` merges Desktop-owned fields onto the
  parsed document, so unknown CLI fields survive. `src/sessions.ts` mirrors the
  CLI's `StoredSessionSchema` and directory hash, writes atomically, and reports
  corrupt session records instead of silently skipping them.
- **Chat surface added.** A dependency-free webview renders the transcript,
  coalesces streamed assistant deltas, and presents approvals as Allow/Deny
  buttons; a modal dialog remains the fallback when no view is open. Closing the
  view denies anything still pending.
- `moderado.configureProvider` now writes the API key to Windows Credential
  Manager through the existing encoded bridge and records only the resulting
  `credentialReference` in `config.json`. A failed key write leaves
  `config.json` untouched. Keys are never typed into an editor setting or sent
  to a renderer.
- **No live provider call is evidenced.** `resolveProvider` builds a real
  `OpenAICompatibleAdapter`/`NvidiaAdapter` when a key resolves, but every
  recorded run and the editor-host check used a profile with no key, so the
  fake provider path is what actually ran. The real-adapter path is covered by
  offline construction tests, not by a verified model call.
- Sessions persist and resume, but only within Desktop. Cross-process
  round-trip against a pinned CLI release, including the workspace-hash
  compatibility question, is the next milestone's work.
- **Test-isolation defect found and fixed.** Two run tests omitted the isolated
  `moderadoHome` fixture and briefly wrote session files into the developer's
  real `~/.moderado`. Both now pass an isolated temporary home, and a test run
  was confirmed to leave the real profile unchanged (447 files before and after).
  Any future run test must pass `moderadoHome`.
- The rebuilt editor package that would carry the final AppIDs and this
  extension has not been produced. The extension is verified against the
  unpacked M1 editor, not a newly installed Desktop package.

### M1 follow-ups before M2

- Windows AppIDs and context-menu CLSIDs in `branding/product.json` were
  hand-authored placeholders. They have been replaced with freshly generated
  GUIDs, but the packages verified above were built with the placeholder values
  and must be rebuilt before those identities are treated as final.
- Artifacts are unsigned and local-only. Signing, provenance, and the update
  channel remain M4 work.

### Milestone 5 evidence (provenance and license compliance)

**Compliance gap found and fixed.** Writing the notice generator surfaced a
real defect: upstream packaging copies Electron's `LICENSES.chromium.html` into
the portable editor but **not** the Code OSS `LICENSE.txt`. The shipped package
was redistributing MIT-licensed code with no copy of that license.
`gen-provenance.ps1` refused to run because the notice was absent, which is
the failure mode it was written to have. `build-m1.ps1` now copies
`LICENSE.txt` and the Desktop license into the portable editor before the
archive is created. Confirmed present in the shipped zip:

```
LICENSE.txt
LICENSES.chromium.html
Moderado Desktop LICENSE
resources/app/extensions/moderado-agent/dist/extension.js
```

**Attestation.** `scripts/gen-provenance.ps1` writes `provenance.json` and
`THIRD-PARTY-NOTICES.md` from the build manifest, `sources.lock.json`, and the
packaged editor. It recomputes every artifact digest rather than copying it, so
a corrupted artifact cannot be blessed by re-reading the file that describes it,
and it throws on a missing pin or notice rather than emitting a plausible file.
It records `signed: false` and `published: false`: it is an **unsigned build
record**, not a signature, and does not prove anything to a third party.

**Verification is adversarial.** `verify-release.ps1` re-hashes the
attestation's artifacts and re-measures the notices it claims, rather than
trusting the attestation to agree with itself. Both tamper classes were
confirmed to fail:

| Tamper | Check that caught it |
| --- | --- |
| Altered a recorded artifact size | `provenance:licenseNoticesShip` |
| Altered a recorded artifact `sha256` | `provenance:artifactDigests` |

Full run after restoring the real attestation: **28/28 checks pass**, exit 0.

**Live provider smoke gate.** `scripts/live-provider-smoke.ps1` is the explicit
opt-in procedure AGENTS.md requires. Confirmed refusals:

| Invocation | Exit | Result |
| --- | --- | --- |
| No flags | 1 | "Refusing to run: a live smoke procedure contacts a real provider and costs money." |
| `-IUnderstandThisCallsALiveModel` with `CI=true` | 1 | "Refusing to run: a CI environment is detected." |

It performs no file mutation, runs no commands, and never writes or logs the
API key.

**Artifacts** (`v0.1.0+261002a`, built from `3e37533`):

| Artifact | Bytes | SHA-256 (first 16) |
| --- | --- | --- |
| `Moderado Desktop-win32-x64-1.135.06055.zip` | 241318263 | `61AC504082CE629A` |
| `Moderado DesktopSetup-x64-1.135.06055.exe` | 167773565 | `33247F4F3BA8C131` |
| `Moderado DesktopUserSetup-x64-1.135.06055.exe` | 167773936 | `47F8C9907F1C4D52` |

**Live provider call verified (2026-10-02).** `live/live-provider.live.ts`
under `vitest.live.config.ts` drove the production path end to end against the
real `~/.moderado` profile and the real Windows Credential Manager:

```
[live] adapter=openrouter adapterModels=385 openrouterFreeModels=22
[live] using modelId=inclusionai/ling-3.1-flash
[live] PASS modelId=inclusionai/ling-3.1-flash chunks=9 replyChars=2
Test Files  1 passed (1)
```

`replyChars=2` is the model's "ok". This is the first and only evidence that
the provider path works for real: config read, key resolved from Credential
Manager, adapter constructed, 385 models discovered, SSE stream parsed, and a
non-empty assistant reply received.

Two things were wrong on the way to that result, both in the *test*, not the
product: the option is `modelId` (not `model`), and the streamed text field is
`contentDelta` (not `content`). An earlier run had reported an empty reply and
looked like a product bug; it was the probe reading the wrong field.

Separation is enforced: `vitest.config.ts` includes only
`test/**/*.test.ts`, so nothing under `live/` can be picked up by the default
suite or by CI. The live suite is skipped without `MODERADO_LIVE=1` and skipped
outright when any CI variable is set. Both were confirmed. The default offline
suite remains 65/65 and the key is never logged or written.

An extension API (`ModeradoApi.startRun/listSessions/cancel`) was added so a host
check can drive the agent without the webview. It exposes no credentials and no
tool permissions.

**Still not verified:** a full run through the *editor UI*. Attempts to drive a
live call through a real editor host did not complete in this environment; the
renderer repeatedly crashed, so no editor-host evidence is claimed for a live
call.

**Open defect: the typecheck crash cause is unknown.** `tsgo` still crashed at
concurrency 4, reporting Windows status `0xC000012D` with no diagnostics.
Concurrency 2 builds cleanly, so the cap holds the symptom down, but this is a
mitigation, not a fix. Measured facts:

- Peak combined RSS at concurrency 4 is only ~210-330 MB, so it is **not**
  memory exhaustion.
- The same 4 projects run concurrently and **succeed** in isolation, with and
  without `--incremental`.
- `@typescript/native/lib/tsc.js` is a Node shim that spawns the real 23 MB
  native `tsc.exe` with `stdio: 'inherit'`, so the native process's output
  bypasses the build's captured streams and the real failure never reaches the
  log.

Next step for this defect: the shim swallows the useful diagnostics. Making
`tsc.js` forward the child's stderr instead of inheriting it, or capturing a
Windows Application event for the crash, would expose the actual cause.

**Still not done.** No code signing, no update channel, no publication, and no
verified live model call. The vendored agent packages carry no `license` field,
which the generated notice flags as something to confirm upstream before any
public distribution.

### GitHub Actions build workflow (added 2026-10-02, **unverified**)

`.github/workflows/build-and-release.yml` builds and verifies on `windows-2022`.
**It has never been executed** â€” there is no runner here, so "CI builds" is not
claimed anywhere in this file.

Publishing is structurally impossible: the `publish` job's `if` ends in
`&& false`, so no input combination can start it. Enabling it is a deliberate,
separate change made only once a signing certificate exists.

One change was needed for a runner to work at all: `vendor-moderado.ps1`
previously hardcoded `D:\projects\moderado` and assumed a sibling CLI checkout.
It now clones the pinned upstream commit when that path is absent. Verified
locally that the pinned commit `a293c1d84d28d1b126fc7054a0f57011edc9d62c` is
fetchable from the public CLI repository.

Two prerequisites the workflow reports rather than assumes, because missing
either fails deep in native compilation with a misleading error:

- **Spectre libraries.** GitHub hosted images do not ship them. The step reports
  `spectre: MISSING` and warns rather than failing, so a runner without them
  surfaces the real native-compile error instead of a confusing one.
- **Python 3.11.** `prepare-m1.ps1` hard-requires `py -3.11`; hosted images
  default to 3.13+, so `actions/setup-python` pins it explicitly.

`MODERADO_TSGO_CONCURRENCY=2` is set explicitly. The underlying typecheck crash
is still undiagnosed, so a runner with a different CPU or memory profile may
fail where a local build succeeds. **The first CI run may be red for that
reason.**

### Milestone 4 evidence (release readiness)

**Release verification.** `scripts/verify-release.ps1` checks artifact
checksums, manifest provenance against `sources.lock.json`, packaged editor
identity, license notices, and the bundled agent. It writes
`release-verification.json` with `signed: false` and `published: false`, and
fails loudly rather than reporting a clean run.

All 19 checks pass against the artifacts built on 2026-10-02 for
`v0.1.0+2610026`:

| Artifact | Bytes | SHA-256 (first 16) |
| --- | --- | --- |
| `Moderado Desktop-win32-x64-1.135.06055.zip` | 312763436 | `BBDB3BB046760EFF` |
| `Moderado DesktopSetup-x64-1.135.06055.exe` | 213115206 | `57D66351F425C34A` |
| `Moderado DesktopUserSetup-x64-1.135.06055.exe` | 213115578 | `4D830B853596FAEB` |

**Two defects found and fixed while finishing M4.**

- The extension check resolved the staged directory as
  `assets\..\..\vscode\extensions\...`, i.e. `.cache\vscode\...`, which does not
  exist, so it reported a present bundle as missing.
- The check also read the pinned agent from `manifest.sources.moderado`, but
  `build-m1.ps1` records it as `pinnedAgentRevisionForMilestone2`. The
  comparison silently never matched real evidence.

**A packaging-only rebuild silently dropped the agent.** Rebuilding with
`-PackingOnly` skips `vscode-min-prepack`, which is where
`compile-non-native-extensions-build` packages local extensions. The resulting
editor and zip contained **no** `moderado-agent` at all (281.8 MB zip versus
312.7 MB with the agent), while every pre-existing check still passed because
they only inspected the staging checkout. The full `build-m1.ps1` run was
required.

`verify-release.ps1` now also opens the shipped zip and asserts that
`extensions/moderado-agent/dist/extension.js` is present, so an editor that
lost the agent cannot pass verification again. That check was confirmed to
fail against the agent-less archive before the rebuild.

**Real editor host, packaged bundle.** The freshly built editor was launched
with the extension taken from the packaged output.
`.cache/m4-hostcheck/user-ext/hostcheck.json`:

```json
{ "ok": true,
  "checks": { "found": true, "isActive": true, "expectedCommandsPresent": true,
    "commands": ["moderado.cancelRun", "moderado.configureProvider",
      "moderado.openChat", "moderado.selectModel", "moderado.showSessions",
      "moderado.togglePlanMode"] } }
```

`exthost.log` records `ExtensionService#_doActivateExtension
moderado.moderado-agent`, confirming a real host rather than a stub.

**Root cause of the repeated build failures: heap exhaustion.** Seven rebuilds
failed before one succeeded, each with a *different* error and none reproducible
in isolation â€” `npm list` failing inside vsce, `tsgo exited with code 2` or `1`
with no diagnostics emitted, and `css-language-features\esbuild.mts` failing
when it builds cleanly on its own. Running every extension `tsconfig.json`
through TS7 sequentially reported `FAILCOUNT=0` each time, which ruled out a
source defect and pointed at resources.

The final failed run printed one cause:
`FATAL ERROR: MarkCompactCollector ... JavaScript heap out of memory`. That is
the **gulp** process dying, and raising its heap to 12288 genuinely fixed it.

Two fixes, of very different confidence:

- `build-m1.ps1` raises gulp's `max-old-space-size` from 8192 to 12288,
  overridable with `MODERADO_BUILD_HEAP_MB`. This is a **confirmed fix**.
- `apply-branding.ps1` caps concurrent typecheck processes. This is **only a
  mitigation** for a separate, still-unexplained crash documented below. The
  heap theory does not apply to those processes; they use a few hundred MB.

**Version/provenance loop closed.** The version hook bumps `VERSION` on every
commit, so the old `manifest:desktopVersion` check could never stay green: any
commit after a build reported a good build as stale. `build-m1.ps1` now records
`builtFromCommit`, and `verify-release.ps1` gates on that commit being an
ancestor of HEAD plus a clean source tree, with the version string reported as
informational only. Both new gates were confirmed to fail correctly â€” against a
diverged tree and against uncommitted source edits â€” before the build was
accepted.

**Suites.** `npx vitest run` 65/65 passed; `tsc --noEmit` exits 0.

**Still not done.** No code signing, no provenance attestation, no update
channel, and no publication. Publishing requires the owner's explicit
authorization and has not been requested. A live model call has not been
verified: provider resolution is implemented and unit-tested offline, but
every recorded run used the fake provider because no key was configured.

## Sidebar and settings rendering (2026-10-03 UTC)

The reported "ugly and messy" sidebar was a rendering failure, not bad layout
values. Four defects were found and fixed in `extensions/moderado-agent`.

**1. The whole stylesheet was emitted as visible body text.** In
`src/chat-view.ts` the `<style>` opening tag sat *below* the CSS, so the browser
closed `<head>` with the CSS outside any style element: it printed the entire
stylesheet as literal text in the panel and applied none of it. A stale
duplicate block (its own `<style>` plus eight repeated rules) followed it. The
stylesheet is now wrapped correctly and the duplicate deleted. `chatHtml()`
emits exactly one `<style>`, whose first rule is `body {` and which closes
before `</head>`.

**2. `.sr-only` was never defined.** It was used by the composer's "Ask
Moderado" label and by the settings model `<select>`, so both rendered as
visible text. The rule now exists, and is repeated as `.settings .sr-only`
because `.settings input, .settings select` is more specific than a bare class
and would otherwise win `width` and `display`.

**3. `#settings-host` reserved half the sidebar while empty.** The rule is
`flex: 1`, so with no children it still grew, leaving an invisible spacer above
the transcript and pushing the chat into the bottom half. `:empty { display:
none }` collapses it.

**4. Settings shared the panel with the chat.** Opening settings left the
transcript, composer, auto-approve bar, and footer mounted underneath, each
taking its own share of the flex column, so the pane was squeezed into a strip.
A `settings-open` class on `<body>` â€” rendered server-side and toggled by the
webview on open/close â€” hides the chat surface so the pane owns the sidebar.
The server-side class avoids one frame of the chat surface flashing first, and
the pane drops its own `border-top` because `#panel-bar` already draws one.

**5. The settings gear fired twice per click.** `#open-settings` had its click
listener registered in two places. The static toolbar is never re-rendered, so
both copies stayed live: one click sent two `openSettings` messages, and the
host answers that by re-reading the profile and awaiting provider model
discovery. The gear therefore issued two provider requests that raced on the
same `settings` state. The duplicate registration is removed.

**6. Two 1px borders met at the toolbar seam.** `#panel-bar` draws a
`border-bottom` and the pane drew its own `border-top`, stacking into what reads
as a 2px line. The open state now removes the pane's border.

**7. Every update dragged the transcript back to the bottom.** The message
handler assigned `scroll.scrollTop = scroll.scrollHeight` unconditionally, so a
reader who scrolled up to re-read earlier output was yanked down by the next
streamed token and could never read back. The handler now measures the
distance to the tail *before* rewriting the DOM and only follows it when it was
already in view (within 24px).

**8. The collapsed auto-approve chevron pointed the wrong way.** It used
`&#9652;` (UPPER LEFT TRIANGLE) against `&#9662;` (down) when open, which does
not read as "expand". It now uses `&#9656;` (right), pairing with the existing
down triangle.

Regression tests added: "wraps every stylesheet in a style element", "defines
sr-only so the composer label is not shown", "does not reserve space for an
empty settings host", "gives the settings pane the whole sidebar while it is
open", "wires the settings gear exactly once", "does not stack two borders
where the toolbar meets the pane", "points the collapsed auto-approve chevron
the right way", and "does not drag the transcript back down when the reader
scrolled up". Each was confirmed to fail before the fix it covers.

**Branding was re-checked, not assumed.** An earlier note claimed the build
still showed the VSCodium logo. That was wrong. In the packaged editor,
`resources/app/out/media/code-icon.svg` is the Moderado mark (dark disc, white
"M", orange accent) and the four `letterpress-*.svg` files are the Moderado
watermark, minified by the build from the branded 918â€“1087 byte originals.
VSCodium's own watermark at `.cache/vscodium/src/stable/.../letterpress-dark.svg`
is a different mark entirely (an irregular `codium_grey_dark_letterpress`
blob), so the overlay is a real, visible change.

One branding gap remains and is **not** fixed: `apply-branding.ps1` does not
cover `src/vs/sessions/contrib/chat/browser/media/letterpress-sessions-*.svg`,
so the Sessions/Chat centre watermark still ships the Code OSS atom glyph.

**Build and verification.** Rebuilt with `scripts/build-m1.ps1`, because a
`-PackingOnly` run is known to drop the agent.

The first full run was killed part-way through: gulp's prepack and packing both
finished, `prepare_assets.sh` archived the previous zip, and then the process
died with the new zip truncated at exactly 8,388,608 bytes and
`build-manifest.json` still naming the previous commit. There was no error on
either log stream, and 1.2 TB of free disk, so nothing in the build failed on
its own merits. The cause was external: the build was started as a background
process and then terminated when a long-running shell command polling it was
interrupted twice. The lesson is to let the build run without interrupting the
session that owns it.

Recovery used `scripts/build-m1.ps1 -AssetsOnly`, which skips prepack and
packing and only runs `prepare_assets.sh`. That was safe here because the
already-packed `VSCode-win32-x64` was current, which was confirmed *before*
resuming rather than assumed: its bundled agent contained every fix, and a
`-AssetsOnly` run still re-runs the agent build, branding, and the artifact
freshness check, so a stale editor could not have been blessed.

The fix was then verified end to end, not only in source. Reading the shipped
archive's `resources/app/extensions/moderado-agent/dist/agent-core.js` (483,810
bytes) directly out of the zip confirms: the pinned-scroll guard present, the
right-pointing chevron present and the old glyph absent, exactly one
`open-settings` registration, the seam rule and `#settings-host:empty` present,
and `<title>Moderado</title>` followed immediately by `<style>`.

- `npx vitest run`: 148/148 across 6 files.
- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `scripts/gen-provenance.ps1`, then `scripts/verify-release.ps1`: 28/28 pass,
  exit 0. An earlier run failed `provenance:builtFromMatchesManifest` and
  `provenance:artifactDigests` because `provenance.json` still named the
  previous commit; regenerating it from the new manifest fixed both.
- `build-manifest.json`: `builtFromCommit 1f6e96f`, `desktopVersion
  v0.1.0+2610038`, three artifacts: zip 312,803,964 B, Setup 213,120,614 B,
  UserSetup 213,120,980 B.

**The duplicate settings-gear listener still exists in a separate worktree** at
`.kilo/worktrees/copper-clementine/`, which was left untouched.

**Not verified.** The fixes are confirmed in the source, the bundle, and the
packaged files. The panel has not been re-opened in a running editor after this
build, so the visual result is asserted from the emitted markup rather than
from a screenshot, and a live model call still has not been made. Nothing is
published or signed.

## Desktop-owned Gateway/provider checkpoint (2026-10-06 UTC)

- Implementation is complete in this worktree across Tasks 1-8: Desktop-owned
  provider catalog, discovery, OpenAI-compatible transport, free-first model
  router, Gateway login, host wiring, and Settings/chat GUI. Every step used
  offline fake providers/mocks; no live inference ran.
- Contributor guidance now states Desktop owns Gateway/provider adapters,
  discovery, model policy, transport, and routing, adapting CLI `v0.4.8`
  behavior without using CLI provider code at runtime. Pinned contracts, core,
  and tools remain at CLI `v0.3.10` (`a293c1d8…`); only the `sources.lock.json`
  role description changed, not the tag or commit.
- Offline verification (run from `extensions/moderado-agent` in this worktree):
  `npm test` 14 files / 296 tests pass; `npx tsc -p tsconfig.json --noEmit`
  exit 0; `npm run compile` emits `dist/agent-core.js` 506.6 KiB with
  `activate()`.
- Editor-host build not run: `.\scripts\build-m1.ps1 -AssetsOnly` from the
  worktree root fails because this worktree has no `.cache/vscodium` checkout
  (`Resolve-Path` on `.cache\vscodium` throws). No packaged-asset manifest,
  real-editor Gateway UI inspection, or live inference is claimed.
- Public release remains blocked on owner authorization; nothing is published
  or signed.

## Gateway/provider design checkpoint (2026-10-06 UTC)

- The owner approved a Desktop-owned Gateway/provider implementation that
  borrows CLI `v0.4.8` behavior without changing the sibling CLI repository or
  advancing Desktop's current vendored package snapshot. The existing pinned
  core/contracts/tools remain in use; Desktop will own provider transport and
  routing at the host boundary.
- Design spec: `docs/superpowers/specs/2026-10-06-desktop-gateway-provider-design.md`.
  It is committed as `61a859a` and the owner approved it on 2026-10-06.
  The spec clarifies that manual keys use native host-side prompts and never
  enter the webview. Implementation has not started.
- Implementation plan:
  `docs/superpowers/plans/2026-10-06-desktop-gateway-provider.md`. It splits
  the work into nine test-first units across catalog, discovery, transport,
  routing, login, host wiring, GUI, and docs. The owner must choose
  subagent-driven or inline execution before implementation starts.
- No source tests or builds were run while writing the design/plan. The spec
  and plan checks were documentation review only; the implementation plan
  lists the required verification commands.
- Live catalog inspection command:
  `Invoke-RestMethod -Uri 'http://127.0.0.1:4788/v1/models' | ConvertTo-Json -Depth 12`.
  Outcome: HTTP success, 10 route entries with IDs, providers, owners,
  capabilities, and data notes; no pricing fields. The owner confirmed every
  route in this Gateway catalog is Free.
- Documentation whitespace check: `git diff --cached --check` passed after
  removing trailing whitespace. Desktop-local `.githooks` were active at
  `.githooks`; the design commit ran them and produced connected version
  `v0.1.0+2610061`.

## Windows build resumed from Linux (2026-10-07 UTC)

- Built Windows x64 `v0.1.0+2610073` from commit `4360f1df178670cfc42ddf83940976c951ea7082`
  using Windows PowerShell invoked from Linux. The prepared editor checkout is
  `D:\projects\moderado-desktop\.cache\vscodium`; this Linux checkout has no
  prepared editor sources. Tracked contents matched after CRLF normalization
  before the Linux-specific test correction below. No sibling CLI files were modified.
- Linux commands: `npm ci` in `vendor/moderado` and
  `extensions/moderado-agent`, then vendor `npm run build`, extension
  `npm test`, `npm run typecheck`, and `npm run compile`. Builds/typecheck exit 0;
  bundle 507 KiB. Initial tests failed twice because Windows backslashes are
  literal filename characters on Linux. Changed only those traversal test
  inputs to portable forward slashes. `npm test -- test/host.test.ts` then
  passed 29/29; full suite passed 292 with four Windows-only cases skipped.
- Windows commands, from `D:\projects\moderado-desktop`:
  `$env:MODERADO_TSGO_CONCURRENCY = '2'; .\scripts\build-m1.ps1` exited 0;
  extension tests passed 296/296. Extension `npm run typecheck` also exited 0.
- The first packaged-host launch exposed missing
  `@vscodium/native-keymap/build/Release/keymapping.node` in the prepared
  dependency tree. Running `node install.js` in that installed package failed
  because its checksum parser does not strip the `*` binary-file marker on
  Windows checksum entries. In the ignored build cache only, backed up
  `checksum.txt` as `checksum.txt.original` and replaced
  ` *native-keymap-` with `  native-keymap-`, preserving the expected hashes.
  With `$env:npm_config_build_from_source_native_keymap = 'false'`,
  `node install.js` then downloaded and verified the pinned binary successfully.
  This is a local preparation workaround, not a committed upstream fix.
- After verifying the completed prepack still contained
  `.build/extensions/moderado-agent/dist/agent-core.js`, ran
  `.\scripts\build-m1.ps1 -PackingOnly` to repackage the restored dependency;
  exit 0. Log: `.cache/build-native-repack.log`. The first attempt to redirect
  output inside Windows PowerShell aborted on an npm stderr notice; the
  successful rerun redirected output from the Linux shell instead.
- Offline real-editor check:
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -File
  D:\projects\moderado-desktop\.cache\build-hostcheck\run.ps1`.
  Uses isolated profile/user-data/workspace directories and the packaged agent
  as the development-extension path. Result `.cache/build-hostcheck/result.json`:
  agent active, seven commands registered, session listing valid. The initial
  probe incorrectly expected `listSessions()` to return an array; corrected
  it to inspect `{ sessions, invalid }` and reran successfully. No model call.
- `.\scripts\gen-provenance.ps1` and `.\scripts\verify-release.ps1` exited 0;
  all 28 checks passed in the Windows checkout. Additional ZIP inspection
  confirmed the agent and native keyboard binary match the packaged files,
  with `DesktopOpenAIAdapter`, `DesktopModelRouter`, and Gateway login present.

Final artifacts under `D:\projects\moderado-desktop\.cache\vscodium\assets`:

| Artifact | Bytes | SHA-256 |
| --- | --- | --- |
| `Moderado Desktop-win32-x64-1.135.06055.zip` | 312902751 | `A4A5DB5C220096E0773833590EDF572A3EB2DE50088F70E42ED30C28C0803286` |
| `Moderado DesktopSetup-x64-1.135.06055.exe` | 213157106 | `8BD09EEA6D42C37E552A10F8D63559D8A21ECFC1F9CAA5ECFBFF3224252CAE47` |
| `Moderado DesktopUserSetup-x64-1.135.06055.exe` | 213157476 | `A7B49F452F110D66E0ADA8709F9F7C893869DEE8F9A80EB12F74A6BC875DA3DC` |

Unsigned and unpublished. No fresh clean-account install/uninstall, visual
Gateway/settings inspection, or live inference is claimed for these artifacts.
The portable traversal test correction and this handoff remain uncommitted
## Version history rewrite (2026-10-07, approved by owner)

Rewrote all 56 VERSION stamps from `f8c131f` through `20ab95b` so that the 22
`feat:` commits advance `p` 1..22 (v0.1.1+2610016 .. v0.1.22+261007a), while
all `fix:`/`docs:`/`build:`/`ci:`/`test:`/`chore:` commits keep the running
`p` and only the build counter moves. Build suffixes (+26100DD letters) were
kept verbatim from the original commits.

- Method: `cherry-pick -n` replay of the 56 pick list onto a clean base at
  `32a9cd4`, with VERSION rewritten per commit, metadata preserved, and a
  revert branch `backup-pre-rewrite` left intact. Two reconciliation commits
  (`cf16aff`, `4ff6cf2`, `52d077c`) were dropped as meaningless post-rewrite;
  `2bbf9e1` (hook wiring) was reworded into the final p=22 commit.
- Verified: 56/56 stamps matched the map exactly; author dates and authors
  preserved (e.g. original `f8c131f` 2026-10-01T17:26:01-06:00 -> new
  `01e3799` same stamp/auth); `git log --reverse` order unchanged.
- Tests: `npx tsc --noEmit` exit 0; `npx vitest run`: 333 passed, 4 skipped
  (16 test files), exit 0.
- Pushed: `git push --force-with-lease origin rewrite-replay:master` ->
  `52d077c...25ea5a8` (forced update). Remote `origin/master` now at
  `25ea5a809f5a6e38836ece14fa354585ddf72e05` (= v0.1.22+261007a).

Local backup branches left: `backup-pre-rewrite` (old master tip), and the
rewritten lineage on `rewrite-replay` until remote sync is confirmed.
in the Linux checkout; the verified Windows build uses the recorded clean commit.
## Linux packaging (.deb / .rpm)

New packaging scripts (`scripts/build-deb.sh`, `scripts/build-rpm.sh`) build
Debian and RedHat packages from the already-built editor tree (`.cache/vscodium/VSCode-linux-x64`).

- `.deb` (verified locally): `moderado-ide_0.1.22~261007a_amd64.deb`
  (214,467,058 bytes; SHA-256 `293c6242a39a5297f704179fa20c25dd7092fcfa5e00ef91fa308abda577a562`).
  Installs `moderado-ide` into `/opt/moderado-ide/`, `/usr/bin/moderado-ide`
  symlink, desktop entry, vector icon, and `%doc`.
- `.rpm` (build-ready; `rpmbuild` is missing on this host so it could not run):
  `packaging/rpm/moderado-ide.spec` + `scripts/build-rpm.sh`. Requires
  `sudo dnf install -y rpm-build` (or `yum install -y rpm-build`).

Files:
- `packaging/deb/DEBIAN/control` — Debian control metadata (depends on the
  VSCodium/Code-OSS runtime libraries).
- `packaging/rpm/moderado-ide.spec` — RPM spec (Requires + %files list).
- `packaging/common/{moderado-ide.desktop,moderado-ide.svg,moderado-ide.appdata.xml,copyright}` — shared metadata.
- `scripts/build-deb.sh` — Debian builder (uses `dpkg-deb --root-owner-group`).
- `scripts/build-rpm.sh` — RedHat builder (`rpmbuild -bb --target=x86_64`).

Notes:
- The Linux build produced by `scripts/build-linux.mjs` is a *portable tar.gz
  only* (`Moderado IDE-linux-x64-*.tar.gz`); system `.deb`/`.rpm` packaging is
  a separate step implemented here.
- The `.deb` artifact is a local, unsigned development build
  (`signed: false`, `published: false`); publishing is disabled in CI pending
  a code signature.


## Linux packaging merged into master

Merged `rewrite-replay` (packaging commit `9a7f533`) into local `master` at
owner request, without creating a branch. Retained master's version hooks;
resolved rewritten-history conflicts using the rewritten AGENTS.md, HANDOFF.md,
and VERSION. Preserved the existing uncommitted pre-commit edit and local .deb.

Fresh verification commands and outcomes:
- `cd extensions/moderado-agent && npm test`: 333 passed, 4 skipped, exit 0.
- `npm run typecheck && npm run compile` in that package: both exit 0.
- `node --test scripts/test/build-linux.test.mjs`: 4 passed, exit 0.
- `bash -n scripts/build-deb.sh` and `sh -n scripts/build-rpm.sh`: exit 0.

No fresh installer build, install/launch test, signing, or publishing performed.

## Build directory and installer output (2026-10-07)

Owner requested installers outside the repository root, then renamed the
repository's `.cache` directory to `build`. Moved the local directory and
updated active build/vendor/smoke scripts, Windows CI artifact paths, README,
installation guidance, and Git ignore rules. Historical evidence above retains
its original paths. OS-specific fixture `profile/.cache` remains an OS cache.
Both Linux installer scripts now create `build/installers` by default and
create explicit custom output directories as well. Corrected RPM temporary
subdirectory creation to use portable `/bin/sh` syntax.

Verification:
- New offline installer tests failed before implementation (missing default
  editor/output paths and RPM directory creation); all four passed afterward.
- `node --test scripts/test/*.test.mjs`: 8 passed, exit 0; external package
  builders are mocked, file copies and output routing are real.
- In `extensions/moderado-agent`: `npm test` (333 passed, 4 skipped),
  `npm run typecheck`, and `npm run compile`: exit 0.
- `node scripts/smoke-linux.mjs`: exit 0; packaged extension activated and a
  fake-provider turn completed under isolated profile state. Result:
  `build/linux-hostcheck-k68Phj/result.json`.
- `bash -n scripts/build-deb.sh`, `sh -n scripts/build-rpm.sh`, and
  `node --check` for build-linux.mjs, smoke-linux.mjs, vendor-moderado.mjs:
  exit 0. `git diff --check`: exit 0.

Work is on master, with the pre-existing uncommitted hook edit preserved.
No real installer rebuild or publishing. PowerShell is unavailable here;
Windows paths were reviewed but not executed on Windows.

## Debian packaging and GUI investigation (2026-10-07)

Owner reported inaccessible minimize/maximize/close controls and apparently
fixed agent width after installing a local .deb. Work remains on master with
prior uncommitted changes and the hook edit preserved.

Confirmed Debian defects fixed:
- Missing /usr/bin/moderado-ide: install a symlink to the upstream CLI wrapper
  /opt/moderado-ide/bin/moderado-ide, rather than raw Electron.
- Use VERSION for archive/control version, retain Debian-supported '+', and
  calculate Installed-Size. Require amd64 for the x64 editor payload.
- Match StartupWMClass to product nameShort (Moderado IDE), retain desktop %U.
- Declare omitted runtime libraries/xdg-utils from the pinned upstream list;
  remove inappropriate VSCodium conflicts/replacements so editions coexist.

New actual-dpkg archive regression initially failed for the missing launcher.
Unsupported-architecture regression also failed before the amd64 guard.
`node --test scripts/test/*.test.mjs`: 10 passed, exit 0.
In extensions/moderado-agent, `npm test`: 333 passed, 4 skipped; `npm run
 typecheck` and `npm run compile`: exit 0. `bash -n scripts/build-deb.sh` and
`git diff --check`: exit 0. Focused independent review checked the packaging
changes; URI-placeholder and architecture concerns were addressed.

`./scripts/build-deb.sh > build/deb-build-check.log 2>&1`: exit 0, produced
build/installers/moderado-ide_0.1.22+2610082_amd64.deb (214467076 bytes).
Actual archive inspection verified wrapper symlink, root/root ownership and
4755 mode of chrome-sandbox, current version and amd64 metadata. Extracted
CLI --version exited 0. `apt-get -s install ./build/installers/
moderado-ide_0.1.22+2610082_amd64.deb`: exit 0; dependency resolution succeeds
and includes previously absent xdg-utils. This was only an install simulation;
the installed system package was not upgraded, and no packages were published.

GUI evidence uses isolated HOME/editor state and Playwright already installed
in the pinned editor checkout, not a new runtime dependency. The environment is
Ubuntu 24.04 under WSL2/WSLg 1.0.71, with two reported 1920x1080 displays.
- Installed package activation and fake-provider smoke:
  `node build/smoke-installed.mjs`: exit 0, result
  build/linux-hostcheck-ZifgcQ/result.json.
- `node build/gui-wsl-check.mjs`: exit 0; actual editor sash drag enlarged the
  sidebar from 300 to 520 pixels. Extension does not fix the sidebar width.
- `node build/gui-controls-verify.mjs > build/gui-controls-verify.log 2>&1`:
  exit 0; temporary settings selected window.controlsStyle=custom. Clicked
  maximize/restore and awaited close-button/page-close event successfully.
  Maximized bounds 0,0,1920,1032 fit the reported display. Screenshot/result
  location build/deb-gui-check-IaJyex. Minimize click produced no minimized
  state or native event; direct BrowserWindow.minimize() behaved similarly.
- `node build/gui-native-check.mjs > build/gui-native-check.log 2>&1`: exit 0;
  temporary native titlebar kept maximized client bounds within the display,
  but likewise reported no minimized state.

No fix for WSLg minimize or the user's off-screen placement is claimed.
Off-screen placement did not reproduce with clean state. docs/INSTALL.md now
explains the sidebar divider and a tested custom-controls diagnostic setting;
no existing user settings or shared Moderado profile were changed.
Unrelated icon/font and RPM dependency issues found during inspection remain
outside this Debian/window investigation.

Final artifact SHA-256:
90ecf65bb18390cf9b3c4d17d376017c5efe8d0c5d1886b917aa3e2b79bcfe80.
After the final rebuild, `dpkg-deb --extract` into build/deb-archive-check
confirmed %U desktop dispatch and the wrapper link. `node
build/smoke-deb-archive.mjs > build/deb-archive-smoke.log 2>&1` exited 0:
the final archive's packaged extension activated and completed the fake turn.

## Commit and push milestone (2026-10-07)

Owner requested pushing all pending source changes on master, including the
previously preserved pre-commit hook edit. Fresh pre-commit verification:
- `node --test scripts/test/*.test.mjs`: 10 passed, exit 0.
- In extensions/moderado-agent, `npm test`: 333 passed, 4 skipped;
  `npm run typecheck` and `npm run compile`: exit 0.
- Shell syntax checks for both installer scripts and IDE version hooks,
  VERSION validation/build-counter check, and `git diff --check`: exit 0.
- `git fetch origin`: exit 0; origin/master has no commits missing locally.

Ignored build directories and installers stay local; this source push is not
an installer publication or a claim that WSLg window issues are fixed.

## Linux installer rebuild (2026-10-08 UTC)

Owner requested rebuilding both Linux installers. This fresh clone has no cached editor sources. Reused the installed Linux editor at `/opt/moderado-ide`, whose product commit matches pinned Code OSS `08d4889f9ec4a1685d257b9b95de036c8e1ce1e5`, and rebuilt the vendored engine and current agent. This is a package rebuild, not a new editor-source compilation. Restored the copied sandbox to mode 4755 before final packaging.

RPM corrections: derive Version/Release from VERSION, use RPM dependency generation rather than invalid Debian syntax, exclude unused foreign-architecture utilities and private library provides/requires, preserve native binaries, fix the CLI symlink and license/doc file declarations. No new application runtime dependencies. `rpmbuild` and its libraries were downloaded with apt-get download and extracted under build/toolchain; no system installation performed.

Commands and outcomes:
- npm ci --prefix vendor/moderado; npm ci --prefix extensions/moderado-agent: exit 0.
- npm run build --prefix vendor/moderado: exit 0.
- npm test --prefix extensions/moderado-agent: 333 passed, 4 skipped, 16 files passed.
- npm run typecheck --prefix extensions/moderado-agent; npm run compile --prefix extensions/moderado-agent: exit 0.
- PATH="$PWD/build/toolchain/bin:$PATH" node --test scripts/test/rpm-package.test.mjs: failed first on invalid dependency syntax; foreign-utility test also failed without the exclusion, then passed with it.
- PATH="$PWD/build/toolchain/bin:$PATH" node --test scripts/test/*.test.mjs: 11 passed.
- node scripts/smoke-linux.mjs: exit 0; isolated editor host activated the agent and completed a fake turn.
- ELECTRON_RUN_AS_NODE=1 native-module check: keymapping, spdlog, sqlite3, watcher, node-pty loaded successfully.
- DONT_PROMPT_WSL_INSTALL=1 extracted Debian bin/moderado-ide --version: exit 0; 1.135.06055, pinned editor commit, x64.

Build logs are under build/logs. No public release, installer publication, or system installation was performed. RPM target-distro installation remains unverified on this Ubuntu host.

Final results:
- ./scripts/build-deb.sh > build/logs/deb-build-final.log 2>&1: exit 0.
- PATH="$PWD/build/toolchain/bin:$PATH" ./scripts/build-rpm.sh > build/logs/rpm-build-verified.log 2>&1: exit 0. RPM emitted expected missing-build-id and absolute-symlink warnings for the preserved upstream payload.
- dpkg-deb --extract plus Python hash/mode/symlink comparisons: passed; editor and agent match the staged tree, sandbox 4755, CLI symlink correct.
- python3 build/verify-installers.py: exit 0; streamed final RPM archive matches editor and agent hashes, sandbox 4755, CLI symlink correct, version 0.1.22+2610083 x86_64, no foreign-architecture or private-library package dependencies.
- cd build/installers && sha256sum --check SHA256SUMS: both OK.
- git diff --check; sh -n scripts/build-rpm.sh; bash -n scripts/build-deb.sh: exit 0.

Artifacts: build/installers/moderado-ide_0.1.22+2610083_amd64.deb and build/installers/moderado-ide-0.1.22-2610083.x86_64.rpm. Checksums and provenance: build/installers/SHA256SUMS and build-manifest.json. Packaging fixes and this handoff remain uncommitted.

## Settings provider/model refresh repair (2026-10-08 UTC)

Owner reports the installed Debian application gets stuck while configuring provider/models and cannot close or shut down. Confirmed renderer defects: open Settings ignored updated HTML while reporting discovery status, leaving models and provider controls stale; visible model select had no change listener, and save used a different hidden control. Whole-window freeze on the owner's machine was not reproduced.

Renderer now compares host-rendered content while Settings is open, refreshes changed controls, preserves same-provider nonsecret input drafts/search/focus/caret, and synchronizes visible model selection through the validated host choice handler. Identical snapshots do not recreate the form; empty status clears correctly. No credential persistence or approval boundary changes. Advanced VERSION build counter to v0.1.22+2610084 for distinguishable installers. Prior uncommitted RPM changes retained.

Verification:
- MODERADO_PLAYWRIGHT_PATH=/mnt/d/projects/moderado-ide/.cache/vscodium/vscode/node_modules/playwright/index.mjs node --test scripts/test/settings-webview.test.mjs: failed before fix, 0 options instead of 2; passed after fix. Uses existing pinned editor Playwright, not a new dependency; explicit env enables browser check.
- MODERADO_PLAYWRIGHT_PATH=... PATH="$PWD/build/toolchain/bin:$PATH" node --test scripts/test/*.test.mjs: 12 passed, 0 skipped. Browser test covers live discovery updates, retained endpoint/search/caret, model selection/save, provider controls, and closing during loading.
- npm test --prefix extensions/moderado-agent: 333 passed, 4 skipped, 16 files passed. Profile/security suites included.
- npm run typecheck --prefix extensions/moderado-agent; npm run compile --prefix extensions/moderado-agent: exit 0.
- xvfb-run -a node build/gui-settings-check.mjs: exit 0. Real packaged Linux editor used an isolated mock HTTP Gateway catalog and isolated profile/editor state; models loaded, model selected, Settings closed, and BrowserWindow close completed. Result build/settings-gui-38nuVU/result.json.
- node scripts/smoke-linux.mjs: exit 0; isolated fake-provider turn completed.
- Focused independent review of renderer/test: no blocking issues identified.

These tests do not establish that the owner's particular desktop/window-manager freeze has been resolved. No real user profile writes, live model calls, system installation, or publication.

Updated artifacts and final checks:
- ./scripts/build-deb.sh > build/logs/settings-deb-build.log 2>&1: exit 0, build/installers/moderado-ide_0.1.22+2610084_amd64.deb.
- PATH="$PWD/build/toolchain/bin:$PATH" ./scripts/build-rpm.sh > build/logs/settings-rpm-build.log 2>&1: exit 0, build/installers/moderado-ide-0.1.22-2610084.x86_64.rpm.
- Extracted updated Debian payload hashes, launcher target and sandbox mode checks: passed.
- python3 build/verify-installers.py: exit 0, updated RPM payload hashes/metadata/mode/dependencies verified; manifest and checksums updated for build 4.
- cd build/installers && sha256sum --check SHA256SUMS: both OK.
- git diff --check: exit 0. Source changes remain uncommitted; no remote update performed.

## Complete Settings workflow and source push (2026-10-08 UTC)

Owner requested an editable preset-filled Base URL, masked API Key paste, automatic free-model discovery plus Reload, Save settings, per-chat history deletion, and About. Features/General screenshots were FYI only; owner chose working Moderado controls only and simpler pages. Implemented Features (paid/unknown model opt-ins, web search, history at startup, approval timeout) and General (preferred reply language). Preferences persist in native editor configuration and apply to new tasks. Narrow sidebars use horizontal wrapping navigation.

Security: staged immutable credential references prevent conflict/cancellation/timeout from overwriting old linked credentials. Existing canonical references remain readable; pinned CLI v0.4.8 resolves stored references verbatim, requiring no schema/shared-engine change. Browser-token reuse retains its existing reference. Edited endpoints cannot inherit a stored key silently. Key drafts clear on save/close/provider changes; exact-key errors are redacted and credential-reflecting catalogs are rejected. Native credential failures report a safe, actionable message. History deletion is native-confirmed, workspace-scoped, rejects symlinks, removes image snapshots, and refuses active runs. No CLI repository writes or new application runtime dependencies.

Verification:
- New offline regressions failed first for editable URLs, key submissions, secret storage, custom provider reload, missing-key validation, browser reference reuse, credential echo, preferences, and history deletion.
- npm test --prefix extensions/moderado-agent > build/logs/settings-verified-suite.log 2>&1: exit 0, 383 passed, 4 skipped, 19 files passed. Includes profile compatibility/security fixtures.
- npm run typecheck --prefix extensions/moderado-agent > build/logs/settings-verified-typecheck.log 2>&1: exit 0.
- npm run compile --prefix extensions/moderado-agent > build/logs/settings-verified-compile.log 2>&1: exit 0.
- MODERADO_PLAYWRIGHT_PATH=/mnt/d/projects/moderado-ide/.cache/vscodium/vscode/node_modules/playwright/index.mjs PATH="$PWD/build/toolchain/bin:$PATH" node --test scripts/test/*.test.mjs > build/logs/settings-complete-browser.log 2>&1: 12 passed, 0 skipped. Existing pinned editor Playwright used; no new dependency.
- node scripts/smoke-linux.mjs > build/logs/settings-verified-agent-smoke.log 2>&1: exit 0; real packaged host activated and fake-provider turn completed in isolated state.
- dbus-run-session -- python3 build/run-keyring-gui.py > build/logs/settings-verified-gui.log 2>&1: exit 0. Complete real Linux editor flow verified with local mock HTTP provider and isolated profiles/keyring: default/edited URL, unsaved-key model discovery, no plaintext key in shared config, saved key and preferences survive restart, all Settings pages, exact About version, chat deletion, window close. Encryption backend gnome_libsecret reported available. Result build/settings-complete-gui-aeMwqb/result.json.
- The WSL environment without a recognized OS keyring correctly refused secure key saving. Test-only keyring packages were downloaded/extracted under build/toolchain; no system installation and no acceptance of weaker encryption.
- Focused independent functional/security reviews completed; identified reference reuse/conflict defects fixed and tested.
- git diff --check and IDE-local hook shell syntax checks: exit 0; core.hooksPath=.githooks verified. git fetch origin and git rev-list --left-right --count master...origin/master: 0 0 before commit.

Owner explicitly authorized committing/pushing all changes. Source only; ignored build artifacts and keyring fixtures remain local. Linux packages will be rebuilt from the committed version; no public installers, signing, or release publication authorized. Native Windows/macOS credential behavior is not claimed verified by these Linux checks.

## Windows handoff and pending source push (2026-10-08 UTC)

Owner requested pushing all changes before switching to Windows for functional testing. Completed pending fixes: cross-platform snapshot symlink/identity checks, shared image-sidecar path derivation, safe profile parse diagnostics, macOS ad-hoc signing/verification, recursive macOS artifact upload paths, and browser regression updates for the compact model dropdown.

Verification:
- npm test --prefix extensions/moderado-agent: exit 0, 395 passed, 4 skipped, 19 files passed.
- npm run typecheck --prefix extensions/moderado-agent: exit 0.
- MODERADO_PLAYWRIGHT_PATH=/mnt/d/projects/moderado-ide/.cache/vscodium/vscode/node_modules/playwright/index.mjs PATH="$PWD/build/toolchain/bin:$PATH" node --test scripts/test/*.test.mjs: exit 0, 21 passed, 0 skipped. Includes real offline browser interaction, macOS command/signing plans and YAML workflow parse.
- git diff --check: exit 0. git fetch origin and git rev-list --left-right --count master...origin/master: 0 0 before commit.

Windows CI previously failed three snapshot/deletion security tests; those cases were corrected and verified locally, but native Windows CI still requires rerunning. macOS/Windows installers have not yet been produced by the new manual workflow. The reported Ubuntu profile problem cannot be confirmed on the offline VM; missing/corrupt/unreadable diagnostics are now distinct and do not reveal config contents. No public release, signing certificate, or notarization is claimed.

## Chat composer and history enhancements (2026-10-08 UTC)

- Added bounded (100-entry) prompt history to webview state. Up/Down browses
  submitted prompts at the textarea's first/last line and restores the unsent
  draft; multiline caret movement remains native. Attachment-only submissions
  do not add blank prompts to history.
- Added a Rename action to each Chat History row. The host validates the
  session ID, prompts natively, limits names to 120 characters, and stores the
  custom display name in workspace-local IDE state; shared CLI session records
  and schema are unchanged.
- Added requirements F14/F15 and offline tests for prompt history and rename.
- `npm --prefix extensions/moderado-agent test -- test/chat-view.test.ts test/settings-host.test.ts`:
  **109/109 pass**.
- `npm --prefix extensions/moderado-agent run typecheck`: **exit 0**.
- `npm --prefix extensions/moderado-agent run compile`: **exit 0**, 560 KiB bundle.
- `node --check scripts/test/settings-webview.test.mjs`: **exit 0**.
- `node --test scripts/test/settings-webview.test.mjs`: browser test **skipped**
  because `MODERADO_PLAYWRIGHT_PATH` is not configured in this environment.
- `git diff --check`: **pass**. Source changes remain uncommitted and unpushed.

## Free-model label cleanup (2026-10-08 UTC)

- API Config model options omit the duplicate access-tier suffix only when a
  free model ID already ends in `:free`; all other tier labels remain visible.
- Regression test first failed on `company/model-ver-flash:free — free_trial`,
  then passed after the label fix.
- `npm --prefix extensions/moderado-agent test -- test/settings-view.test.ts`:
  **12/12 pass**; `npm --prefix extensions/moderado-agent run typecheck`: **pass**.
- The next all-platform Actions run must include this source change before its
  artifacts can be considered current.

## Windows Spectre toolchain follow-up (2026-10-09 UTC)

- Fixed Windows `MSB8040` by sharing `scripts/ensure-windows-build-tools.ps1`
  between local preparation/build scripts and Actions. It selects VS 2022,
  provisions its x86/x64 Spectre component when requested, and verifies the
  actual Spectre static libraries before node-gyp runs.
- `node --test scripts/test/workflow.test.mjs`: **3/3 pass**;
  PowerShell parser checks for the helper and both Windows build scripts pass;
  `git diff --check`: **pass**.
- Pushed as `6952a0be8ff76fc3c0b09e3e6b738b8d8b4bba97`. Windows-only workflow
  run [37863116573](https://github.com/marcuz-apl/moderado-ide/actions/runs/37863116573)
  passed prerequisite provisioning, vendored package build, and the extension
  offline suite. Pinned editor source preparation is still running; native
  `@vscode/deviceid` compilation and installer verification are not yet
  confirmed.
- macOS x64/arm64 verification run
  [37862317695](https://github.com/marcuz-apl/moderado-ide/actions/runs/37862317695)
  remains in progress without uploaded artifacts. Do not claim installers
  verified or publish until the corresponding jobs and artifact checks pass.

## Local Windows x64 installer build (2026-10-09 UTC)

- Provisioned Visual Studio 2022 Build Tools with
  `.\scripts\ensure-windows-build-tools.ps1 -InstallIfMissing`; verified the
  x86 and x64 Spectre libraries were present.
- Ran
  `$env:MODERADO_BUILD_HEAP_MB='12288'; $env:npm_config_loglevel='error'; .\scripts\build-m1.ps1`
  on the existing pinned VSCodium `5a73682ca091082675b10c9dc3f348c1d824d94f`
  and Code OSS `08d4889f9ec4a1685d257b9b95de036c8e1ce1e5` checkouts. The complete
  Windows x64 editor prepack, native/package step, and Inno Setup builds exited
  successfully. Log: `build/logs/windows-local-build.log`.
- The first local attempt exposed Windows PowerShell 5.1 treating benign child
  process stderr (including Node's `DEP0180` warning) as terminating under
  `$ErrorActionPreference='Stop'`. `build-m1.ps1` now runs its native build
  steps with stderr tolerated but checks each process exit code. The workflow
  regression test and PowerShell parser checks pass.
- Fresh outputs in `build/vscodium/assets`:
  - `Moderado IDE-win32-x64-1.135.06055.zip` (312,859,853 bytes),
    SHA-256 `8fbb8e14f02e72b9125f0505014a0115b562c759c72fb73f60a6522f258011ab`.
  - `Moderado IDESetup-x64-1.135.06055.exe` (213,173,722 bytes),
    SHA-256 `5c674b6ce893bfa374cf76dd3ca989ba979c2ec3a7cdf0ad461f1dbfe9b2cb8f`.
  - `Moderado IDEUserSetup-x64-1.135.06055.exe` (213,174,060 bytes),
    SHA-256 `30fd665e9391184a51e77d7a350bc458186ed1831f34181afa34db846539c3f7`.
- Re-ran `.\scripts\build-m1.ps1 -PackingOnly` after installing the
  latest API Config webview bundle so the test installers show model names
  without the `free_trial` suffix.
- All three sizes and hashes match the generated build manifest. Inspected the
  portable ZIP and confirmed it contains the agent bundle and all shipped
  license files. This was a local unsigned build; no installer was installed,
  signed, published, or uploaded.

## macOS installer architecture (2026-10-09 UTC)

The owner-triggered installer workflow now builds macOS arm64 only, targeting
Apple Silicon (M-series) Macs. The `macos_arch` dispatch input and Intel x64
job were removed; selecting `platform=macos` or `platform=all` runs the arm64
job on `macos-14`. The generic local build script still accepts an explicit
architecture, but the installer workflow no longer offers or uploads Intel
artifacts.
