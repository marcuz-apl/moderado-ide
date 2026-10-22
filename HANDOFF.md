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
- `63385ea` (`v0.1.32+261021d`) `feat: refresh the built-in provider list and point Moderado at modr.alfazen.org`: `provider-catalog.ts` drops the `agnes-ai` and `orcarouter` presets, renames the `moderado-cloud` label to `Moderado`, and sets `MODERADO_BASE_URLS.production` to `https://modr.alfazen.org/v1`; `provider-setup.ts` drops the `Gateway` tag; `gateway-login.ts` moves `AUTHORIZE_URL`, `TOKEN_URL`, and the default base URL to `modr.alfazen.org` and names the saved connection `Moderado`. `README.md`, `PRD.md`, `CHANGELOG.md`, and the `scripts/publish-release.mjs` release notes were updated to match.
- Verification: focused `npx vitest run` over the seven affected test files passed 200 tests; full `npm test` passed 442 with 4 skipped; `npm run typecheck` passed; `npm run compile` produced `extensions/moderado-agent/dist/` (4x `modr.alfazen.org`, 0x `agnes-ai`/`orcarouter`, `Moderado` label present). No live provider call, editor smoke test, build dispatch, or release.
- Pushed to `master` only after run `39632261922` published `v0.1.31+261021c`: the rebuild's `publish` job checks out the moving `master` HEAD, so pushing earlier would have put these notes into the v0.1.31 release. The published v0.1.31 notes are unchanged and correct.
- The owner still has to test the new provider menu before any v0.1.32 release.

## 2026-10-21 v0.1.32 Gateway key retention and simplified key box (unreleased)

- The owner's second test run showed three defects, all traced to the same place: the API Config pane had two controls for one fact. The "Gateway access" dropdown and the API key box could disagree, and the host believed the dropdown.
- `b8e7cb2` (`v0.1.32+261021i`) `fix: keep a stored Gateway key when only the model changes`: `parseSettingsForm` no longer defaults an absent login method to `public`, and the pane no longer sends one for an ordinary save, so saving a model choice keeps the profile's `credentialReference`. The key box is now the only credential control: a pasted key always means manual access, and the access dropdown is gone. `host.ts` reports a free Gateway route selected without a key by name before the request is sent, and `provider-transport.ts` distinguishes a rejected key from a missing one. `Moderado: Remove Saved Connection` deletes a stale connection from the shared profile.
- Owner profile repair (not a code change): the stale `moderado` connection was removed from `~/.moderado/config.json` and its orphaned `moderado/provider/moderado` credential was deleted, which clears "Moderado · Custom" from the picker. The `moderado-cloud` record had lost its `credentialReference` and `authMethod` while the secret remained in Credential Manager, so the pointer was restored to `moderado/provider/moderado-cloud-54027c34-fd6b-4753-b242-8c5d07f1ee37` with `authMethod: manual`. A backup of `config.json` was kept beside it.
- Verification: full `npm test` passed 455 with 4 skipped; `npm run typecheck` passed; `npm run compile` produced `extensions/moderado-agent/dist/`. The webview script is parsed by `test/webview-script.test.ts`, which catches TypeScript syntax that reaches the browser. No live provider call, editor smoke test, build dispatch, or release.
- Not pushed yet: the same `master`-HEAD hazard applies to the rebuild's publish job, which has already completed for v0.1.31 but could run again. The owner still has to test before any v0.1.32 release.

## 2026-10-21 v0.1.32 retire the "Moderado Cloud" product name (unreleased)

- The owner asked for "Moderado Cloud" to become "Moderado" across the codebase. Scope was checked before editing, because the two names are not equivalent in kind: "Moderado Cloud" was the old product name, while "Moderado Gateway" names the gateway service and was left alone.
- Done in IDE-owned code: `MODERADO_CLOUD_BASE_URLS` is now `MODERADO_BASE_URLS`, and `test/branding.test.ts` asserts the old product name never appears in the provider picker, the Settings pane, the chat surface, or the Gateway rejection messages. The IDE-owned surfaces that read "Moderado" already did.
- Deliberately unchanged: the `moderado-cloud` connection id and the `moderado/provider/moderado-cloud` Credential Manager reference. Those are the shared profile contract the Moderado CLI reads from `~/.moderado/config.json`, so renaming them would orphan the owner's stored key and break CLI parity. `test/branding.test.ts` asserts both values so the exception is deliberate rather than accidental.
- Not changed, and why: the remaining "Moderado Cloud" strings are in `vendor/moderado/**` (`packages/contracts/src/provider.ts` gateway error messages and the `packages/providers/src/presets.ts` label). `vendor/moderado` is a hash-pinned snapshot of the pinned CLI commit `a3479fff`, regenerated by `scripts/vendor-moderado.mjs` from `sources.lock.json`, and its tree hash is recorded in `vendor/moderado/VENDORED.json`. AGENTS.md forbids editing the sibling CLI repository from this repository and requires a shared change to be a separate, reviewed CLI change followed by an advance of the pinned revision. A hand edit of the vendored copy would be silently reverted by the next re-vendor and would desync the integrity record.
- Scope boundary, stated by the owner on 2026-10-22: the CLI repository at `E:\projects\moderado` is not to be touched from this project. It was not edited, committed, or tagged here; its tree was verified clean at `ee285d8` with no file modified during this session. The CLI-side rename of the old product name belongs to the CLI project, and this repository only picks it up by advancing the pinned revision and re-vendoring.
- Those vendored strings cannot reach the user through the IDE. The IDE never constructs `GatewayError` and never imports `GATEWAY_ERROR_CODES`, `GatewayError`, or the vendored `PROVIDER_PRESETS`; the vendored gateway error path only fires for the gateway host (`isModeradoGatewayUrl`), while the IDE uses its own `src/provider-discovery.ts` for the Gateway and the only vendored discovery call is `fetchOpenRouterFreeModels` in the live smoke script, which targets OpenRouter. The eight remaining hits in `dist/agent-core.js` are the bundled contracts strings.
- Verification: full `npm test` passed 460 with 4 skipped across 21 files; `npm run typecheck` passed; `npm run compile` produced `extensions/moderado-agent/dist/`. No live provider call, editor smoke test, build dispatch, or release.

## 2026-10-22 v0.1.33 the Moderado Gateway serves free routes only (unreleased)

- The owner decided that Moderado will not handle paid models, and asked for three API Config changes.
- `settings-view.ts`: the model picker's `Paid` tab is not rendered for the `moderado-cloud` preset, `paidTab` is false for it, and `eligibleModels` returns only `auto`, free, and local models for it. A paid route is therefore neither selectable nor counted in the "listed" summary. Other providers keep the Free/Paid tabs and the `Allow paid models` preference.
- `settings-view.ts`: the Gateway key note is now "Free Gateway models need a website API key. Sign in with browser to get API Key".
- `settings-view.ts`: the `Provider:` and `Owner:` rows are gone from the selected-model details. Capabilities and the route's data note remain. `SettingsModel.provider` and `SettingsModel.ownedBy` are still populated by discovery but are no longer rendered anywhere; they were left in place rather than reshaping the discovery contract.
- `test/settings-view.test.ts` gained three cases for the above, and the existing metadata-escaping case was updated: it no longer expects the provider and owner values in the HTML, and still asserts the escaping of the capabilities and data note.
- Left alone for the owner to decide: the `moderado-cloud` preset description in `provider-catalog.ts` still offers "public access", which after this change reaches no Gateway route. It was not edited because it was not in the requested scope.
- Verification: full `npm test` passed 463 with 4 skipped across 21 files; `npm run typecheck` passed; `npm run compile` produced `extensions/moderado-agent/dist/`. No live provider call, editor smoke test, build dispatch, or release.

## 2026-10-22 v0.1.33 token usage beside the title, local runtime labels (unreleased)

- Two owner-requested presentation changes.
- The top bar: `.brand-title` had `margin-right: auto`, which pushed the token usage to the far right, away from the title. That auto margin moved to `#panel-bar button:first-of-type`, so the session, history, and settings buttons stay right-aligned while the usage sits directly beside `MODERADO`. `.token-usage` moved from `text-align: right` to `left` and from `0.62rem` to `0.72rem`, with opacity `0.75` to `0.85`. The usage text itself is unchanged (`In: … | Out: … | Total: … | Rate: … tok/s`); the owner described it as "Token Rate … tps", which was a loose transcription of that line, so the wording was left alone.
- The API Provider menu: the option separator for a tagged provider is now ` - ` instead of ` · `, which renders the local runtimes as `Ollama - Local` and `LM Studio - Local`. A custom endpoint renders as `Name - Custom` for the same reason. The underlying `ProviderChoice.label` and `tag` are unchanged, so the preset labels, the saved connection display names, and the composer footer still read `Ollama` and `LM Studio`.
- `test/chat-view.test.ts` gained a case for the usage position and font size and one for the two local runtime labels; the existing local-tag case was updated to the new separator.
- Verification: full `npm test` passed 465 with 4 skipped across 21 files; `npm run typecheck` passed; `npm run compile` produced `extensions/moderado-agent/dist/`. No live provider call, editor smoke test, build dispatch, or release.

## 2026-10-22 v0.1.34 auto-approve toggles in the row, and the version hook fix (unreleased)

### Version hooks

- The owner asked to fix the commit issues. The bug: a `fix:` commit bumped the patch. Reproduced in a scratch repo: `feat:` then `fix:` produced `v0.1.34` then `v0.1.35`.
- Root cause, confirmed by probing the hooks: Git runs `pre-commit` FIRST and writes `COMMIT_EDITMSG` only afterwards in `prepare-commit-msg`. So `pre-commit` always read the *previous* commit's message, and a `fix:` inherited an earlier `feat:` and bumped the patch. The wrong order was recorded in `docs/planning/release-v0.1.30/findings.md` and is corrected there.
- `e88c111` (`v0.1.34+2610226`) `fix: decide the version bump from the real commit message`: `pre-commit` now only advances the daily build counter, which is always safe, and `post-commit` moves the semver from the real commit message and amends the commit so the tree and the subject carry the same identifier. `post-commit` marks its nested amend with `ALFAZEN_VERSION_AMEND`, because `--no-verify` skips `pre-commit` and `commit-msg` but not `post-commit`. The merge guard now only rejects commits with two or more parents, so a root commit is still bumped.
- Verified in a scratch repo: `feat:` bumps the patch, `fix:`/`docs:`/`chore:` only advance the build, `release(patch):` and `release(minor):` bump as intended, a root commit is bumped, an amend does not double-bump, a merge commit is left alone, and a `feat!` without `ALFAZEN_MAJOR_APPROVED=1` still commits and warns. The same commit in this repository produced `v0.1.34+2610226`, a build-only bump, which is the live regression test.

### Auto-approve row

- The owner asked to move the auto-approve checkboxes into the `Auto-approve:` row, in front of each category, so the privileges are reachable without clicking the row to open a panel.
- `chat-view.ts`: the row is now `Auto-approve:` followed by the five toggle items, each a checkbox, its icon, and its label. The row is a plain container, not a button, because a checkbox inside a button is invalid markup.
- The now-dead expansion machinery was removed rather than left behind: `AutoApproveState.expanded`, the `autoApproveExpanded` view field, `autoApproveSummary`, the `toggleAutoApprovePanel` message, and the `.aa-head`, `.aa-chevron`, `.aa-grid`, and `.aa-body` styles. Toggling still posts `setAutoApprove` to the host, so the renderer still never decides that an action is approved.
- The safety caveat is a popup on a warning mark beside the `Auto-approve:` label, so it occupies no row space. The mark carries the text as `aria-label` and as `data-warning`, and the stylesheet turns it into the popup on hover and on keyboard focus, because a webview renders no native `title` tooltip. The separate note line, the `.aa-note` style, and the `title` attribute were removed.
- `test/chat-view.test.ts` gained a case that each checkbox precedes its own label, and a case that the warning is a popup on the mark with no note line and no native title attribute; the cases that asserted the old summary text, the expand control, and the chevron were replaced.
- Verification: full `npm test` passed 465 with 4 skipped across 21 files; `npm run typecheck` passed; `npm run compile` produced `extensions/moderado-agent/dist/`. No live provider call, editor smoke test, build dispatch, or release.

### Chat transcript differentiation

- The owner asked whether the chat should tell the user's input from Moderado's replies by background colour, and then asked for the user's input to be indented as well.
- Every transcript row already carried its provenance as a CSS class (`user` / `assistant` / `tool` / `error`), so the whole change is CSS in `chat-view.ts`; no markup, state, or protocol changed.
- `chat-view.ts`: `li.user` now takes the focus-border accent, a tinted background (`--vscode-textBlockQuote-background`, falling back to `--vscode-list-inactiveSelectionBackground`), rounded right corners, and a left margin of `1rem` so the request is inset from the reply. The base `li` rule and the `li.error` / `li.tool` accents are unchanged, and the reply keeps the panel canvas so the answer keeps the full reading width in the narrow sidebar.
- The treatment is deliberately asymmetric: the request is a quoted instruction, the reply is the payload. The `.who` labels (`YOU` / `MODERADO`) are kept, so the distinction is never carried by colour alone and survives a monochrome or high-contrast theme.
- `test/chat-view.test.ts` gained a module-scope `cssRule` helper that extracts one declaration block from the generated stylesheet, plus a case that the user row is tinted and accented while the base row is not, and a case that the user row's left margin is greater than the base row's. The two cases were first written inside the `moderado settings pane` describe, where the module-scope helper was not yet reachable, and were moved to the `chat view` describe.
- Verification: full `npm test` passed 468 with 4 skipped across 21 files; `npm run typecheck` passed; `npm run compile` produced `extensions/moderado-agent/dist/`. No live provider call, editor smoke test, build dispatch, or release.

### Markdown replies

- The owner approved option B from the advice: a small purpose-built renderer in the extension host, rather than the editor's own Markdown engine. The reasons recorded at the time: the built-in engine is created with `html: true` in `extensions/markdown-language-features/src/markdownEngine.ts` of the pinned Code OSS source, so raw HTML in a reply would pass straight through and would have to be sanitized; the command is asynchronous, which does not fit the synchronous streaming path; and it is a built-in extension's private command rather than a stable API.
- `3f59240` (`v0.1.36+261022b`) `docs: require Markdown formatting for chat replies` added PRD row F16, because AGENTS.md requires the requirement to exist before the code.
- `18aeeaf` (`v0.1.36+261022d`) `fix: show code in the chat in a monospace font`: the chat stylesheet set `pre { font-family: inherit }`, so every snippet in a reply and in the approval preview was rendered in the proportional interface font. It now uses `var(--vscode-editor-font-family, monospace)`.
- `extensions/moderado-agent/src/markdown.ts` is the renderer. It escapes every literal character, emits only `p h1-h6 ul ol li pre code strong em del blockquote a hr br`, and links only `http`, `https`, and `mailto` targets. Raw HTML in a reply is shown as the text it is. Nested inline constructs are bounded at depth 8 so pathological input cannot recurse without limit. It is not a general Markdown implementation: tables, reference links, footnotes, and raw HTML are not supported.
- `chat-view.ts`: `transcriptEntryHtml` renders only a `assistant` entry as Markdown, inside a `div.md`. The user's own input, tool output, and errors keep their `pre` form, because the request is literal text and machine output should keep looking like machine output.
- Two decisions differ from the advice given before the work started. First, an unterminated code fence renders as a code block rather than as plain text: the block appears once when the fence opens and does not change when the fence closes, so it does not flicker while the reply streams. Second, no render cache was added. Measured with a throwaway benchmark, `renderMarkdown` takes 0.060 ms for a 465-character reply, so a full 200-entry transcript parses in about 12 ms, and the streaming path re-renders a single row roughly 16 times a second. A cache would not pay for itself; if profiling later shows it matters, the place to add it is a per-index memo in `viewSnapshot`, not a text-keyed map, because the streaming row changes on every tick and would churn a text-keyed cache.
- Images become links to the image. The chat's content security policy is `default-src 'none'`, so no remote image can load; rendering an `img` tag would produce a broken image.
- `test/markdown.test.ts` is a new file with 14 cases: headings and paragraphs, inline emphasis and links, fenced code, an unterminated fence, flat and nested lists, block quotes and rules, escaped raw HTML, refused link schemes, images, a word-internal underscore, a label that tries to break out of an anchor, bounded nesting, and an empty reply. `test/chat-view.test.ts` gained a case that only a reply is Markdown and a case for the reply's styles.
- Verification: full `npm test` passed 485 with 4 skipped across 22 files; `npm run typecheck` passed; `npm run compile` produced `extensions/moderado-agent/dist/` at 588 KiB. No live provider call, editor smoke test, build dispatch, or release.

### Local runtime key box

- The owner asked to prefill the API Key box of `Ollama - Local` and `LM Studio - Local` with "Running on local LLM server - No API key is needed".
- The text is the input's **placeholder**, not a filled value. A filled value would be submitted with the form, saved as a credential, and would then make the pane report "Key stored" and the compact active line report "Ollama · key stored". Both would be false: a local runtime never had a key. The placeholder shows the same message, is never submitted, and leaves the box empty.
- `requiresApiKey` cannot carry this signal on its own: the Moderado Gateway is also `requiresApiKey: false` and is not a local runtime. `provider-setup.ts` therefore carries an explicit `local` flag on `ProviderChoice`, taken from the preset's own `local` metadata, and `extension.ts` passes it into the settings pane's choice. `SettingsProviderChoice.local` is the flag the pane reads.
- `settings-view.ts`: the key box's placeholder is "Key stored · paste to replace" when a credential exists, the local-runtime message for a local runtime, and "Paste API key" otherwise. The note under the box follows the same three cases, so a local runtime no longer shows the contradictory "Paste a key and save. It is stored in Credential Manager and never shown again." line. The separate local note moved into that line and the old `requiresApiKey === false` branch was removed.
- The note under the box keeps the short form "This local runtime needs no API key." because the placeholder is clipped by the narrow sidebar, while the placeholder keeps the owner's full wording.
- `test/chat-view.test.ts` gained a case that the local runtimes carry the message, that the box holds no value, that the "Paste a key and save" line is gone, and that the Gateway and a hosted provider still say "Paste API key". `test/provider-setup.test.ts` gained a case for the `local` flag. The existing local-runtime case was updated to set `local: true` on its provider literal, which is the shape the host now sends.
- Verification: full `npm test` passed 487 with 4 skipped across 22 files; `npm run typecheck` passed; `npm run compile` produced `extensions/moderado-agent/dist/` at 589 KiB. No live provider call, editor smoke test, build dispatch, or release.

### Session management: context compaction

- The owner asked for session management functions, naming compaction. Investigation confirmed there was none anywhere: `host.ts` passed the whole stored transcript as `conversationHistory` on every turn, the engine only bounds `policy.maxSteps`, and nothing in the IDE consumed the `progress` events the engine already emits. A long chat therefore grew until the provider refused it.
- `extensions/moderado-agent/src/context-budget.ts` is new. `compactConversation` walks the cut forward until the estimated prompt fits, never opens the tail on a tool result (a provider rejects a tool message with no preceding call), and replaces what it dropped with a digest of one line per message, bounded at 24 lines so a very long chat cannot rebuild the prompt.
- The digest is emitted as an ordinary **user** turn, not a system message: the engine replaces a leading system message with its own prompt, which would have discarded the digest.
- The estimate is four characters per token plus a small per-message overhead. It errs high, which is the safe direction: an early compaction is harmless, an over-long prompt is refused.
- Compaction costs no model call. A model-written summary would need a second provider request per compaction, could fail, and would be non-deterministic; the deterministic digest is the smallest implementation that solves the failure.
- The **record is not reduced**. `host.ts` now saves `[...recorded, ...conversationOf(result.messages).slice(sent.length)]`, so the stored chat keeps every message it had plus the new ones. This also fixes a latent issue where a compacted prompt would have shortened the stored conversation.
- `Context budget (tokens)` was added to `SettingsPreferences` and the Advanced card (4000 to 200000, default 48000), validated by `parsePreferenceChange` like every other preference.
- Visibility: the engine event union has no type for this, so the host emits a `progress` status beginning with the exported `COMPACTED_STATUS_PREFIX` and `extension.ts` appends it to the transcript as a `Context` note. Other progress events still only reach the output channel.
- Tests: eight unit cases in `test/context-budget.test.ts` (estimate, untouched short chat, digest content, fitting the budget, the tail kept under a tiny budget, the tool-result boundary, the digest bound, no mutation), two host cases in `test/host.test.ts` (an oversized chat is summarised, the stored record keeps every message and the note is emitted; a chat that fits is untouched), and the preference cases in `test/settings-preferences.test.ts`.
- Verification: full `npm test` passed 516 with 4 skipped across 24 files; `npm run typecheck` passed; `npm run compile` produced `extensions/moderado-agent/dist/` at 599 KiB. No live provider call.

### Composer footer workspace label

- The owner reported that the bottom row of the panel read `Microsoft VS Code` where it used to read `moderado-ide`.
- Cause: `workspaceLabel` was `workspaceRoot.split(/[\\/]/).pop()`, and `workspaceRoot` falls back to `process.cwd()` when the window has no folder open. In an extension host that working directory is the editor's install folder, so on Windows the label became `Microsoft VS Code`. Nothing in the branding overlay was involved, and no editor process is running on this machine.
- `extension.ts` now computes the label with `workspaceFolderLabel`: the folder's display name when a folder is open, else the last path segment, and `Moderado IDE` when there is no folder at all, so a host path is never shown. `workspaceRoot` itself is unchanged, because it is the file-tool jail root and the session directory key, and moving it is a separate decision.
- Not changed, and worth a decision later: the jail root and the session directory are fixed at activation, so opening a folder in a window that started without one leaves the agent scoped to the old root and only the label would be correct. Raising this rather than changing it here.
- Tests: three unit cases in `test/settings-host.test.ts` for a named folder, a folder with no name, and no folder at all.
- Verification: full `npm test` passed 506 with 4 skipped across 23 files; `npm run typecheck` passed; `npm run compile` produced `extensions/moderado-agent/dist/` at 595 KiB.

### Transcript copy and edit

- The owner reported that a past message of theirs could not be copied or edited, and that a model's output could not be copied.
- The cause was not a blocked selection: there is no `user-select: none` in the panel. `applyUpdate` assigned `transcript.innerHTML` on every `update` message and the delta path replaced a row with `outerHTML`, so any selection was destroyed under the reader, including mid-drag. Selection was also impossible while a reply was streaming, which is exactly when output is usually wanted.
- `chat-view.ts` now renders each row as a head with the label and its actions, then the body. `Copy` is on every row, because a reply, a command's output and an error are all things a reader reuses. `Edit` is only on the user's own row. Both are text-only buttons with `data-entry-action`, delegated on `#transcript`, so a row that a streamed token replaces keeps working actions.
- `Edit` reads the rendered row's `textContent`, which is the text exactly as displayed, and puts it in the composer with the caret at the end. It does not rewrite the transcript, so no turn is silently removed from the record.
- The clipboard is the host's: the renderer posts `copyToClipboard` and `extension.ts` calls `vscode.env.clipboard.writeText`, bounded by `CLIPBOARD_MAX_CHARS` (200 000). The payload is never echoed back into the view. `navigator.clipboard` was rejected because a webview's permission for it is not reliable under this CSP.
- Selection is preserved by holding rather than by restoring: `selectionInTranscript()` checks whether the selection's common ancestor is inside `#transcript`, and while it is, an incoming `update` or `delta` is kept in `heldUpdate` and applied on `selectionchange` once the selection is released. Rows are also only rewritten when `update.rows` differs from the last rows written, so an unrelated update no longer drops a selection or a row's hover state.
- Tests: three cases in `test/chat-view.test.ts` for the per-kind actions, the hover-reveal CSS, and the hold-and-delegate behaviour in the emitted script; three host cases in `test/settings-host.test.ts` for the clipboard write, the size bound, and a non-string payload. `test/webview-script.test.ts` parses the emitted script and passes.
- Verification: full `npm test` passed 503 with 4 skipped across 23 files; `npm run typecheck` passed; `npm run compile` produced `extensions/moderado-agent/dist/` at 595 KiB. No live provider call, editor smoke test, build dispatch, or release.

### Provider catalog cache

- The owner reported that switching back to a provider took a while to bring up the free model list, and asked whether the gateway's response time was the cause.
- Measured on the owner's machine with the same request the IDE makes: `GET https://modr.alfazen.org/v1/models` took 1.36 s cold (DNS 0.24 s, TLS 0.70 s) and 0.35 s warm, leaving roughly 0.23 s of origin time. `GET https://integrate.api.nvidia.com/v1/models` took 1.25 s cold (TLS alone 1.17 s) and 0.27 s warm. So the delay is the provider's, and the local runtimes are instant only because `127.0.0.1` needs neither DNS nor TLS.
- Two avoidable costs were found. The gateway answers with `cache-control: no-store` and `cf-cache-status: DYNAMIC`, so the origin is hit every time, and the IDE kept no copy either. And `loadModelsForPreset` aborted the previous discovery, which drops the pooled connection, so a request that was aborted had to pay for DNS and TLS again: the 1.3 s cold figure rather than the 0.35 s warm one.
- `extensions/moderado-agent/src/catalog-cache.ts` is the cache: one entry per endpoint, keyed by the connection id and the base URL with the trailing slash and case ignored, so an edited endpoint is a different catalog. Entries are fresh for five minutes, the cache is bounded at 32 endpoints, and it holds public model metadata only.
- `extension.ts`: `loadModelsForPreset` now shows a cached catalog at once and refreshes it in the background when it is stale. The foreground path is unchanged when there is no entry. A failed background refresh keeps the cached list and only reports the failure. The `Reload models` action, a pasted key, and a save all force a fresh request, because the cached catalog was fetched with a different credential or endpoint.
- The abort of the previous discovery was removed from `loadModelsForPreset`. The request is left to finish and its result is discarded by the existing `request !== discoveryRequest` guard, so the connection stays in the pool. The aborts that remain are the ones that mean the work is genuinely over: closing the pane and deactivating the extension.
- `test/catalog-cache.test.ts` is a new file with six cases for the key, the time to live, deletion, and the bound. `test/settings-host.test.ts` gained four host-level cases: switching back does not ask the provider again, a stale entry is refreshed in the background without blanking the list, an explicit reload does ask again, and an edited Base URL asks again.
- The classification of a model does not depend on the paid and unknown preferences, so the cached catalog stays valid when those change; the preferences only decide which models the pane shows, and that is applied when the pane renders.
- Verification: full `npm test` passed 497 with 4 skipped across 23 files; `npm run typecheck` passed; `npm run compile` produced `extensions/moderado-agent/dist/` at 591 KiB. The gateway latency figures come from a read-only catalog request; no inference call, editor smoke test, build dispatch, or release.
