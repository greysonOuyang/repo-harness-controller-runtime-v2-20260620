# T3 Report: Version and Release Branch Strategy

## Scope

- Issue: 开源发布治理、版本线与分支整理
- Task: T3 — 制定版本与发布分支策略
- Allowed paths: `tasks/reports/**`, `docs/versioning.md`

## Evidence reviewed

- `package.json` currently declares package version `1.4.0`, license `MIT`, repository URL `https://github.com/Ancienttwo/repo-harness.git`, and `private: true`.
- `docs/CHANGELOG.md` records the package line `1.0.0` through `1.4.0`.
- `src/cli/controller/runtime-config.ts` defines `CONTROLLER_TOOL_SURFACE = controller-chatgpt-bridge-v8`, `CONTROLLER_SCHEMA_VERSION = 10`, and `CONTROLLER_TOOL_SURFACE_VERSION = 8`.
- `src/cli/v81-entry.ts` extends the existing CLI program and does not introduce a new Controller surface generation.
- `LICENSE` is MIT with `Copyright (c) 2026 AncientTwo`.
- `git branch --all --verbose --no-abbrev` and `git tag --list --sort=version:refname` show mixed branch naming: package semver tags up to `v0.8.0`, historical `v3.x` to `v5.2.3`, and live remote branches named `release/v8.1`, `package/v8.1-full-ready`, and `feature/v8.1-*`.
- `origin/main` currently points to `987f485` while `upstream/main` points to `50ae349`.
- `git rev-list --left-right --count refs/remotes/origin/main...refs/remotes/upstream/main` reports `83 334`.

## Unique recommendation

Adopt `1.x` as the only package release line and keep `controller-chatgpt-bridge-v8` as the compatibility line. Treat `v8.1` only as an internal additive implementation train inside V8, not as the npm/package version.

## Why not lower or rename the package to `8.1`

`8.1` is not the current package lineage. It is an implementation label layered on top of an unchanged V8 Controller surface. Lowering or renaming the package to `8.1`, `0.8.1`, or a similar form would:

1. Break monotonic package history after `1.0.0` through `1.4.0`.
2. Misrepresent the compatibility contract, because the public MCP surface is still V8.
3. Leave branches, tags, and release notes with two different meanings for the same number.

## Compatibility statement

Recommended public statement:

> `repo-harness` package `1.4.x+` implements the `controller-chatgpt-bridge-v8` surface. `v8.1` identifies an additive implementation train within V8 and does not imply a new package-major or protocol-major release.

## Branch strategy

- `main` is the only long-lived public integration branch.
- `release/1.x` or `release/1.4` may be cut temporarily from `main` for stabilization.
- `feature/<topic>` is the only allowed feature branch pattern going forward.
- Protocol-train branch names such as `release/v8.1` or `package/v8.1-*` should not be reused.

## Branch archive rules

- Archive or rename historically interesting but misleading version branches before deleting them.
- Delete merged or superseded branches after evidence is preserved in changelog or reports.
- Keep upstream branches as reference only until a later task defines explicit upstream sync policy.

## Follow-up branch operations to perform later

Do not execute these in this task:

1. Retarget release automation and docs from `release/v8.1` to `main` plus optional `release/1.x`.
2. Rename or archive `origin/release/v8.1`, then delete it after maintainers confirm `main` is authoritative.
3. Merge or supersede `origin/feature/v8.1-runtime-storage-isolation*` into `main`, then delete the stale variants.
4. Merge or supersede `origin/feature/v8.1-multi-repository*` into `main`, then delete the stale variants.
5. Delete `origin/package/v8.1-full-ready` and `origin/codex/package-v8.1-full-ready` after their packaging evidence is recorded elsewhere.
6. Start package release tagging at real `v1.x.y` tags for this public fork.
7. In a later governance slice, decide whether `upstream` remains a fetch-only audit remote or a periodically merged source.

## Residual risks

- `package.json` still points `repository.url` at the upstream repository, so public release metadata is not yet aligned with the intended fork identity.
- The repo currently has no `v1.x` tags, so the first public release will need an explicit tag normalization decision when publishing.
- The visible branch divergence from upstream is large enough that future “sync back” expectations should not be implied without a separate policy.
