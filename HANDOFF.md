# Project Handoff

Updated: 2026-10-21
Branch: master
Release source commit: `bc1500eb485522088a2fbb855ca6862d511843c2`
Status: v0.1.31 is published as the latest stable release (rebuilt tag `v0.1.31+261021c`). The owner withdrew the v0.1.29 GitHub Release; its source tag remains intact.

## Summary

The user tested the Windows v0.1.29 portable build from fix commit `37f494c` and confirmed the UI works. The fix removes TypeScript-only syntax from the plain JavaScript emitted into the shared Moderado webview. The owner manually deleted the v0.1.29 GitHub Release because that release was not runnable; its source tag remains on origin. Stable v0.1.30 is now published for Windows x64, Linux x64, macOS Apple Silicon arm64, and macOS Intel x64.

## Completed

- The shared fix was tested on Windows from the `moderado-ide-windows-x64` artifact of run `37971334294`.
- Canceled obsolete partial 0.1.29 macOS run `37980860696` and Linux run `37980869742` after the owner selected a new 0.1.30 release.
- Full release workflow publishes only after a successful all-platform default-source build; partial-platform builds remain build-only.
- Published stable release: [Moderado IDE v0.1.30](https://github.com/marcuz-apl/moderado-ide/releases/tag/v0.1.30%2B261009t), tag `v0.1.30+261009t`, source commit `5432a4a88027bb0d3185dc528a9de78a371e6629`.
- Release workflow run `37985155914` passed all four platform builds and the publisher. Linux sysroot fetching required passing `GITHUB_TOKEN` to the Linux build step; the release commit includes that fix.

## Release limits

- Windows installers are unsigned.
- Linux packages are unsigned; native Linux installation was not verified.
- macOS packages are ad-hoc signed, not Developer ID signed or notarized.
- There is no automatic update channel. No live provider request was used as release evidence.
- The owner removed v0.1.29 and asked for a new 0.1.30 release; do not recreate the 0.1.29 release or remove its source tag.

## Verification

- Windows fix build run `37971334294` completed successfully; user confirmed that app was responsive.
- `node --check scripts/publish-release.mjs`, hook syntax, connected patch-version prediction, and `git diff --check` passed for the preparation changes.
- Workflow run `37985155914` completed successfully; `gh release view` confirmed a non-draft stable release with 19 assets and platform-specific manifests.

## Next action

The next action is for the owner to test the v0.1.30 packages. The 0.1.29 GitHub Release is absent; keep its source tag and the v0.1.28 release intact.

## 2026-10-10 CLI v0.4.10 Gateway flow (unreleased)

## 2026-10-10 Moderado IDE v0.1.31 release

- Released [Moderado IDE v0.1.31](https://github.com/marcuz-apl/moderado-ide/releases/tag/v0.1.31%2B2610102) from source commit `f9e4632939d13ec392cbeb9635ffd1806ab782f3`, tag `v0.1.31+2610102`, with 19 assets.
- Pre-release build-only runs all succeeded: Linux run `38078257847`, Windows/macOS arm64 run `38078259882`, and macOS Intel run `38078261756`.
- The owner authorized release and dispatch of full-platform run `38081616708`. All four build/verify jobs and the stable GitHub release publisher succeeded.
- Release verification: non-draft, non-prerelease, 19 assets, target commit `f9e4632939d13ec392cbeb9635ffd1806ab782f3`, published at `2026-10-10T20:55:50Z`. No live provider calls were used as test evidence.

- Advanced the pinned Moderado contracts/core/tools baseline from `v0.4.8+261006d` to `v0.4.10+2610105`, regenerated the vendored snapshot, and updated the documented source revision and verification notes.
- Kept Gateway access in the IDE's unified Settings → API Config provider flow, matching CLI `v0.4.10`'s merge of `/login` into `/connect`. Gateway is tagged in the provider list, and its access methods are labeled public paid access, browser website key, and manual website key.
- The existing free/paid route contract remains: model listing and paid routes can work without a website key; free routes require one; Gateway AUTO may dispatch either tier and is labeled unknown cost.
- New test coverage verifies that the unified provider list exposes Gateway and that its access wording and AUTO route description match the CLI flow. Focused verification passed: `npm test -- --run test/settings-view.test.ts test/settings-host.test.ts test/model-router.test.ts test/provider-catalog.test.ts test/provider-discovery.test.ts test/provider-transport.test.ts test/host.test.ts test/profile.test.ts` passed 220 tests in 8 files. Vendored `npm run typecheck` and IDE `npm run typecheck`, `npm run compile`, and `git diff --check` passed.
- Windows-only test fixtures now use a junction fallback instead of privileged file symlinks. Full `npm test` passed 425 of 425 tests after the fallback. No live provider calls or releases were performed.

## 2026-10-09 Gateway free-route key contract (unreleased)

- The IDE now accepts the Gateway's optional `access: 'free' | 'paid'` route field and classifies advertised free and paid routes explicitly. Catalogs without the field remain readable and are labeled unknown cost. Gateway AUTO is also labeled unknown cost because the server may choose a free or paid route. No numeric prices are invented for Gateway metadata.
- Existing manual/browser credentials continue to be sent by the host as bearer keys for Gateway completion requests. Keyless mode is described as paid-route access; a Gateway 401 gives Moderado website key setup guidance. Direct BYOK and local transports were not changed.
- Focused verification: `npm test -- --run test/model-router.test.ts test/host.test.ts test/provider-catalog.test.ts test/provider-discovery.test.ts test/provider-transport.test.ts test/settings-view.test.ts` passed 139 tests. The Settings discovery path now also passes Gateway access metadata to the router; `test/settings-host.test.ts` passed 41 tests after its Gateway fixture was updated to include `access: 'free'`. Final `npm run typecheck`, `npm run compile`, and `git diff --check` passed.
- Full `npm test` passed 419 of 424 tests. Five existing symlink fixture cases in `attachments.test.ts` and `sessions.test.ts` could not create Windows symlinks (`EPERM`). Both test files have the exact same Git object hashes as `HEAD` (`c7cddaf7f1641c981011da8bcf2e147ddf30eb06` and `ecd03b051167c7b9ae6f2005496c91bfdcd1dbe3`). A separate Node file-symlink probe also returned `EPERM`. No live provider calls, IDE package build, deployment, or release were performed.

## 2026-10-21 Approval and New Session P0 fixes

- `write_file` approvals no longer fail as "no complete preview": the host wraps the run tool registry and supplies a unified-diff preview built from the jailed target and its current content (new files use `/dev/null`). Vendored packages were not modified.
- `apply_patch` approvals now accept the generated per-file diff as the complete preview, because the core leaves `targetFile` empty for an edits array. A summary string that is not a generated diff is still refused.
- New Session now creates a distinct session: `startNewSession` marks the next run as fresh instead of `startRun` reloading the workspace's latest chat.
- Added host end-to-end tests with a stubbed provider transport covering approved and denied `write_file`, multi-file `apply_patch`, existing-file write diffs, `edit_file`, and New Session; added `hasCompletePreview` cases.
- Verification: focused `npx vitest run test/approval.test.ts test/host.test.ts` passed 69 tests; full `npm test` passed 430 with 4 skipped; `npm run typecheck` passed. No live provider calls, editor smoke test, or release.

## 2026-10-21 Approval and Auto-Approve audit (unreleased)

- `73ab7fa` (`v0.1.31+2610214`) `fix: keep automatic approval decisions out of the approval card`: the raw `approval_request` event no longer paints the Allow/Deny card. Only `askHuman` owns that state, so auto-approved requests and requests the coordinator refuses before prompting (incomplete preview, non-interactive, aborted) no longer leave a stale card that cannot be answered.
- `cead633` (`v0.1.31+2610215`) `fix: honor disabled auto-approve categories for read and web tools`: the vendored read, search, diff, and web tools never request approval, so the Read files and Fetch web content composer categories were inert. `AgentHost` now raises `requiresApproval` for those tools when their category is off (`withApprovalGates`, IDE-owned wrapper, vendor untouched) and the extension supplies the live category predicate. The gate only adds a requirement; it never removes one, and an unclassified tool is treated as not pre-approved.
- Plan mode applies no category gate: core policy denies every approval-required action before the handler, so gating reads there would block planning instead of asking. Mutations and commands already require approval and remain denied in Plan mode.
- Audit confirmations: auto-approve runs inside `askHuman`, after the coordinator's complete-preview, non-interactive, abort, and request-id checks, so it cannot bypass them. Timeout/cancel settle through the coordinator's abort signal, which clears the pending card. Auto-approve preferences remain in-memory and reset to safe defaults on reload (not listed among persisted preferences in PRD F13).
- Remaining gap: MCP is not wired into the extension, so the Use MCP servers category is still inert and PRD F8 (explicit per-server trust before launch, separate from per-call approval) is unimplemented. Do not describe MCP as trusted or jailed until that flow exists.
- Verification: focused `npx vitest run test/host.test.ts test/settings-host.test.ts` passed 101 tests. Full `npm test` passed 435 with 4 skipped; `npm run typecheck` passed. No live provider calls, editor smoke test, push, or release.

## 2026-10-21 Documentation and changelog refresh (unreleased)

- Corrected the latest published release to v0.1.31 across `PRD.md`, `docs/INSTALL.md`, `docs/ROADMAP.md`, and `docs/UPSTREAM.md`, with the tag `v0.1.31+2610102`, source commit `f9e4632939d13ec392cbeb9635ffd1806ab782f3`, and workflow run `38081616708`.
- Added `CHANGELOG.md` entries for v0.1.31 and the unreleased P0/approval fixes, and updated the release progression (v0.1.29 withdrawn).
- Fixed relative links: `docs/ROADMAP.md` now points to `../HANDOFF.md` and `INSTALL.md`; `docs/INSTALL.md` points to `../LICENSE`.
- Marked MCP server discovery/trust (F8) as unimplemented in `PRD.md` and `docs/PROFILE.md`; the Use MCP servers toggle is inert. Documented that skill files are discovered and validated but not yet injected into agent runs.
- Verification: relative-link checker reported all links resolve; `git diff --check` passed. No code change, live provider call, build, push, or release in this step.

## 2026-10-21 Streaming performance and credential bridge timeout (unreleased)

- `297600d` (`v0.1.31+2610218`) `perf: coalesce streamed renders and cache session recents`: streamed assistant deltas are coalesced and painted at most every 60 ms. The webview receives a single-row `{ type: 'delta', index, html }` update (appending the first row, replacing it thereafter) instead of rebuilding the whole transcript per token. A full render is forced when the document is not ready, the transcript shape changed beyond one appended row, or the 200-entry cap shifted rows. The RECENT list is cached and invalidated on New Session, show-all/toggle-history, rename, delete, resume, and run completion, so streaming no longer rescans session files. `transcriptEntryHtml` is now shared by full and delta updates.
- `e7e6b42` (`v0.1.31+2610219`) `fix: bound the Windows credential bridge with a timeout`: `WindowsCredentialStore` races the bridge runner against a validated timeout (default 5 s; rejects non-finite, ≤0, or >5 s values) and `defaultRunner` kills a hung `powershell.exe` after 5 s and settles once. Failures stay sanitized to `Windows Credential Manager operation failed. Set the provider environment variable to continue.`
- Out of scope (deferred): pruning superseded credential references/secrets — the review's P2 note that old staged keys are never deleted remains open. MCP is still not wired in (PRD F8).
- Verification: focused `npx vitest run test/credentials.test.ts test/chat-view.test.ts test/settings-host.test.ts` passed 134 tests; full `npm test` passed 442 with 4 skipped; `npm run typecheck` passed; `git diff --check` passed. No live provider calls, editor smoke test, build, or release.
- Owner decision: withdraw the published `v0.1.31+2610102` GitHub Release and rebuild v0.1.31 from this line, keeping the original source tag. The release deletion and four-platform workflow dispatch are blocked until a valid `gh` session is available (see the rebuild entry below).

## 2026-10-21 v0.1.31 rebuild published

- The owner chose to withdraw the `v0.1.31+2610102` GitHub Release and rebuild v0.1.31 with the Order 1/2/4 fixes. Per the v0.1.29 precedent, the GitHub Release was deleted but the `v0.1.31+2610102` source tag was kept.
- `scripts/publish-release.mjs` release notes describe the approval, session-isolation, streaming, credential-bridge, and 0.1.31 provider-label changes.
- Completed: full-platform run `39632261922` (`platform=all`, ref `master`, source `bc1500eb485522088a2fbb855ca6862d511843c2`) succeeded across all four build/verify jobs and the publisher.
- Published [Moderado IDE v0.1.31](https://github.com/marcuz-apl/moderado-ide/releases/tag/v0.1.31%2B261021c) as the latest stable release, tag `v0.1.31+261021c`, 19 assets, non-draft, non-prerelease, published `2026-10-21T17:18:17Z`. The old `+2610102` tag and build remain immutable history.
- Refreshed `PRD.md`, `docs/INSTALL.md`, `CHANGELOG.md`, and `HANDOFF.md` with the rebuilt tag, source commit, and run id. `docs/ROADMAP.md` cites only the version, so it needed no change.

## 2026-10-21 v0.1.32 provider menu refresh and Moderado production endpoint (unreleased)

- Owner decisions: the Moderado production base URL is `https://modr.alfazen.org/v1`; the OAuth `authorize` and `oauth/token` endpoints also move to `modr.alfazen.org`; "Moderado - Custom" in the owner's picker is stale saved-connection data (not a code preset), so only Agnes AI and OrcaRouter are removed in code; the Settings picker entry is renamed to `Moderado`.
- `63385ea` (`v0.1.32+261021d`) `feat: refresh the built-in provider list and point Moderado at modr.alfazen.org`: `provider-catalog.ts` drops the `agnes-ai` and `orcarouter` presets, renames the `moderado-cloud` label to `Moderado`, and sets `MODERADO_CLOUD_BASE_URLS.production` to `https://modr.alfazen.org/v1`; `provider-setup.ts` drops the `Gateway` tag; `gateway-login.ts` moves `AUTHORIZE_URL`, `TOKEN_URL`, and the default base URL to `modr.alfazen.org` and names the saved connection `Moderado`. `README.md`, `PRD.md`, `CHANGELOG.md`, and the `scripts/publish-release.mjs` release notes were updated to match.
- Verification: focused `npx vitest run` over the seven affected test files passed 200 tests; full `npm test` passed 442 with 4 skipped; `npm run typecheck` passed; `npm run compile` produced `extensions/moderado-agent/dist/` (4x `modr.alfazen.org`, 0x `agnes-ai`/`orcarouter`, `Moderado` label present). No live provider call, editor smoke test, build dispatch, or release.
- Pushed to `master` only after run `39632261922` published `v0.1.31+261021c`: the rebuild's `publish` job checks out the moving `master` HEAD, so pushing earlier would have put these notes into the v0.1.31 release. The published v0.1.31 notes are unchanged and correct.
- The owner still has to test the new provider menu before any v0.1.32 release.

## 2026-10-21 v0.1.32 Gateway key retention and simplified key box (unreleased)

- The owner's second test run showed three defects, all traced to the same place: the API Config pane had two controls for one fact. The "Gateway access" dropdown and the API key box could disagree, and the host believed the dropdown.
- `b8e7cb2` (`v0.1.32+261021i`) `fix: keep a stored Gateway key when only the model changes`: `parseSettingsForm` no longer defaults an absent login method to `public`, and the pane no longer sends one for an ordinary save, so saving a model choice keeps the profile's `credentialReference`. The key box is now the only credential control: a pasted key always means manual access, and the access dropdown is gone. `host.ts` reports a free Gateway route selected without a key by name before the request is sent, and `provider-transport.ts` distinguishes a rejected key from a missing one. `Moderado: Remove Saved Connection` deletes a stale connection from the shared profile.
- Owner profile repair (not a code change): the stale `moderado` connection was removed from `~/.moderado/config.json` and its orphaned `moderado/provider/moderado` credential was deleted, which clears "Moderado · Custom" from the picker. The `moderado-cloud` record had lost its `credentialReference` and `authMethod` while the secret remained in Credential Manager, so the pointer was restored to `moderado/provider/moderado-cloud-54027c34-fd6b-4753-b242-8c5d07f1ee37` with `authMethod: manual`. A backup of `config.json` was kept beside it.
- Verification: full `npm test` passed 455 with 4 skipped; `npm run typecheck` passed; `npm run compile` produced `extensions/moderado-agent/dist/`. The webview script is parsed by `test/webview-script.test.ts`, which catches TypeScript syntax that reaches the browser. No live provider call, editor smoke test, build dispatch, or release.
- Not pushed yet: the same `master`-HEAD hazard applies to the rebuild's publish job, which has already completed for v0.1.31 but could run again. The owner still has to test before any v0.1.32 release.
