# Shared Skills Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make only enabled, validated shared-profile skills available to the agent through the pinned core's read-only `load_skill` tool.

**Architecture:** Harden `discoverSkills()` in the IDE profile adapter, then pass the intersection of discovered skills and the pinned config's `enabledSkills` list to `AgentLoop.run({ skills })`. Keep skill bodies out of webview messages and system prompt text; the core returns a selected body through its existing read-only tool and labels it advisory.

**Tech Stack:** TypeScript, Node.js filesystem APIs, pinned `@moderado/core`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-23-profile-mcp-skills-acceptance-design.md`

## Global Constraints

- Do not add a profile field or editor setting; use the pinned `enabledSkills` config field.
- Treat every `SKILL.md` body as untrusted data, never as approval or authority.
- Never write the developer's real `~/.moderado` in automated tests.
- Do not edit the sibling CLI or generated `vendor/moderado` files.
- Add no runtime dependency.

---

### Task 1: Bound and validate skill discovery

**Files:**
- Modify: `extensions/moderado-agent/src/profile.ts`
- Test: `extensions/moderado-agent/test/profile.test.ts`

**Interfaces:**
- Preserve `discoverSkills(customHome?)` return shape `{ skills, invalid }`.
- Keep the existing 256 KiB per-file maximum; add limits of 64 entries and 1 MiB total skill content.
- Skill names must match the pinned core's `^[a-z0-9][a-z0-9_-]{0,63}$` loader rule.

- [x] Add failing tests for symlinked skill folders/files, escaped real paths, invalid names, the 65th entry, and total content over 1 MiB.
- [x] Run `npx vitest run test/profile.test.ts` in `extensions/moderado-agent`; the new cases failed before the implementation changes.
- [x] Implement `lstat`/`realpath` containment checks and stop accepting entries once the count or aggregate byte budget is exhausted. Record rejected entries by name and reason only.

  Use a containment check based on `path.relative`, not a string prefix:

  ```ts
  function staysInside(root: string, target: string): boolean {
    const relative = path.relative(root, target);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
  }
  ```

- [x] Rerun `npx vitest run test/profile.test.ts`; profile discovery tests pass.

### Task 2: Select enabled skills and expose them through the core loader

**Files:**
- Modify: `extensions/moderado-agent/src/host.ts`
- Test: `extensions/moderado-agent/test/host.test.ts`

**Interfaces:**
- Read `enabledSkills` from the already validated shared profile. A missing, malformed, or empty list enables no user skills.
- Pass only matching discovered entries as `skills` to `AgentLoop.run`; do not append bodies to `skillContext`.

- [x] Add a fake-provider host test with two discovered skills and `enabledSkills: ['one']`; have the provider request `load_skill('one')` and assert the returned text includes only skill `one`.
- [x] Add a malformed `enabledSkills` case and verify unselected skill content is not available.
- [x] Run `npx vitest run test/host.test.ts`; the new selection test failed before implementation.
- [x] Wire the filtered list into the existing `AgentLoop.run` options and preserve the core's advisory warning.

  Selection is a strict intersection; do not fall back to all discovered skills:

  ```ts
  const enabledNames = new Set(validEnabledSkillsFromConfig);
  const skills = discoverSkills(this.options.moderadoHome).skills
    .filter(skill => enabledNames.has(skill.name));
  ```

- [x] Rerun `npx vitest run test/host.test.ts test/profile.test.ts`.

### Task 3: Update product evidence

**Files:**
- Modify: `PRD.md`
- Modify: `HANDOFF.md`

- [x] Remove the claim that discovered skills are not injected only after the focused host/profile tests pass.
- [x] Record the actual test commands and state that skill text remains advisory and bounded.
- [x] Run `git diff --check`.
