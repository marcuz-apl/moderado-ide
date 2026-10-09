# Task plan: official Moderado IDE v0.1.29 release

## Objective

Publish v0.1.29 for Windows x64, Linux x64, macOS Apple Silicon, and macOS Intel using the documented asset names; update the quickstart and release docs; enable safe publishing for future full builds.

## Phases

1. Review release delta, repository state, and naming conventions — complete.
2. Update README quickstart and macOS architecture guidance — complete.
3. Keep the superpowers spec and plan separate and remove date prefixes — complete.
4. Build and verify all four platform artifacts — complete; Actions run `37961060432` passed all platform jobs.
5. Verify manifests and hashes, and apply public names — complete.
6. Tag the exact build commit and publish stable release — complete; `v0.1.29+261009j` targets `dad8515123e5d411a9805781661f50f5a99cd6ea`.
7. Update release docs and handoff; verify, commit, and push the workflow change — complete.

## Decisions

- Keep v0.1.28 and its tag available until the owner tests v0.1.29 and explicitly requests otherwise.
- Windows installers are unsigned; Linux runtime installation remains unverified on native Linux; macOS is ad-hoc signed, not notarized; there is no update channel.
- Publishing runs only for an explicitly dispatched complete `all` build with the default source commit. Partial and custom-source builds do not publish.
