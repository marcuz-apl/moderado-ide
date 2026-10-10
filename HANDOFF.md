# Project Handoff

Updated: 2026-10-10
Branch: master
Release source commit: `5432a4a88027bb0d3185dc528a9de78a371e6629`
Status: v0.1.30 is published as the latest stable release. The owner withdrew the v0.1.29 GitHub Release; its source tag remains intact.

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
