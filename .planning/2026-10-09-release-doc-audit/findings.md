# Release findings

- Current stable release before this task: `v0.1.28+261009d`.
- Current build `VERSION` at the release source commit is `v0.1.29+261009j`; build source commit is `dad8515123e5d411a9805781661f50f5a99cd6ea`.
- Full platform workflow run: https://github.com/marcuz-apl/moderado-ide/actions/runs/37961060432.
- The workflow builds Windows x64, Linux x64, macOS arm64, and macOS x64, then stores artifacts in Actions. Its publish job is deliberately disabled.
- The README now has separate Apple Silicon and Intel download links for v0.1.28, processor-selection guidance, and a five-step first-run quickstart. README commits after build start are documentation-only and are not the build source.
- The provider design/spec and implementation plan remain separate at `docs/superpowers/specs/desktop-gateway-provider-design.md` and `docs/superpowers/plans/desktop-gateway-provider.md`; date prefixes were removed. Commit `e69601d` is docs-only and pushed.
- Public filenames follow `docs/INSTALL.md`: Windows uses `Moderado-IDE-win32-x64-0.1.29-{portable,Setup,User-Setup}`; macOS/Linux include full connected version `0.1.29+261009j`; manifests have platform-specific names.
- Release delta: Gateway Dev/Prod URL switch; provider catalog/free-model label refinements; About card and metadata; Windows installer version alignment; Intel macOS workflow and artifacts.
- Do not claim native Linux install, Windows signing, or macOS notarization. Do not claim live-provider testing.
- The owner plans to test v0.1.29 before deciding whether to remove v0.1.28. Recommended default: keep the old release/tag as history and rollback; no change to v0.1.28 was requested now.
