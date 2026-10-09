# Release findings

- Current release before this task: `v0.1.28+261009d`; v0.1.29 is now the current stable release.
- Release build version: `v0.1.29+261009j`; source commit: `dad8515123e5d411a9805781661f50f5a99cd6ea`.
- Full platform Actions run: https://github.com/marcuz-apl/moderado-ide/actions/runs/37961060432. Linux x64, Windows x64, macOS arm64, and macOS x64 all succeeded.
- Stable release: https://github.com/marcuz-apl/moderado-ide/releases/tag/v0.1.29%2B261009j. It contains 19 assets; the publishing script verified local manifests and hashes and checked the uploaded asset names, sizes, and available GitHub digests.
- Linux manifest matches the build tar artifact. DEB metadata reports `moderado-ide`, version `0.1.29+261009j`, architecture `amd64`; the CI RPM package job succeeded.
- Public release copies use the names in `docs/INSTALL.md`: Windows product version `0.1.29`; macOS and Linux names use `0.1.29+261009j`; manifests are platform-specific.
- Release delta: Gateway Dev/Prod URL switch; provider catalog and free-model label refinements; About card and metadata; Windows installer version alignment; Intel macOS x64 build.
- Windows installers are unsigned; macOS packages are ad-hoc signed and not notarized; Linux runtime installation has not been verified on native Linux; no update channel exists. No live provider call is claimed.
- The owner plans to test v0.1.29 before deciding whether to remove v0.1.28. Keep the older release and tag as history and rollback point unless asked otherwise.
