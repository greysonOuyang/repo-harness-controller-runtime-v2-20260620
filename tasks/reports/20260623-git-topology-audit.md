# Git Topology Audit Report

- Date: 2026-06-23
- Repository inspected: `/Users/greyson/DevProjects/repo-harness-controller-runtime`
- Execution worktree: `/Users/greyson/DevProjects/repo-harness-controller-runtime/.ai/harness/worktrees/iss-20260623-dde2e7-t1-6de59a70`
- Scope mode: read-only inspection only
- Data freshness note: no `git fetch` was run, so remote refs reflect the locally cached state visible in this worktree at inspection time.

## Executive Summary

1. The repository currently contains two disconnected commit histories.
   - `main` and `upstream/main` are rooted at `e8d6af6` and currently point to `50ae349`.
   - The active v8.1 product line (`feature/v8.1-runtime-storage-isolation-ready`, `origin/main`, `origin/release/v8.1`) is rooted at `b9f4c95` and currently points to `987f485`.
   - `git merge-base main feature/v8.1-runtime-storage-isolation-ready` returns no common ancestor.
2. `origin/main`, `origin/release/v8.1`, and `origin/feature/v8.1-runtime-storage-isolation-ready` all point to the same commit `987f485`, while local `main` points to a different history at `50ae349`.
3. The current isolated worktree is clean. No tracked or untracked file modifications were present before this report was created.
4. There is one clear local-only commit not present on any remote-tracking branch: `ab474fc` on `codex/v81-current-snapshot-20260623`.
5. The current controller worktree branches (`controller/iss-20260623-dde2e7-t1-6de59a70`, `controller/iss-20260623-dde2e7-t2-b6bb5653`) do not introduce unique commits; they point to `987f485`, which is already present on multiple `origin/*` refs.

## Repository State

### Worktree and status

- Current branch: `controller/iss-20260623-dde2e7-t1-6de59a70`
- `git status --short --branch` before report write: `## controller/iss-20260623-dde2e7-t1-6de59a70`
- Untracked files before report write: none
- Additional linked worktrees observed:
  - `/Users/greyson/DevProjects/repo-harness-controller-runtime` on `feature/v8.1-runtime-storage-isolation-ready`
  - `/Users/greyson/.repo-harness/controller/repositories/repo_123b7cf58b6b17b5cbe46a56/worktrees/iss-20260623-dde2e7-t2-b6bb5653` on `controller/iss-20260623-dde2e7-t2-b6bb5653`

### Smallest relevant verification run

- Command: `bun scripts/inspect-project-state.ts --repo . --format text`
- Result:
  - `mode: audit`
  - `legacy_contract_version: current-v1`
  - `drift_signals: (none)`
  - `required_decisions: (none)`

## Remotes

| Remote | URL |
| --- | --- |
| `origin` | `https://github.com/greysonOuyang/repo-harness-controller-runtime.git` |
| `upstream` | `https://github.com/Ancienttwo/repo-harness.git` |

## Local Branches

| Branch | Head | Root | Upstream | Track | State vs `main` | State vs current feature | Assessment | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `codex/v81-current-snapshot-20260623` | `ab474fc` | `e8d6af6` | `(none)` | `(none)` | merge-base `52103a6`, `1 ahead / 24 behind` | no merge-base, `311 ahead / 83 behind` | Local-only snapshot branch on the old `main` lineage; disconnected from current v8.1 product history. | Preserve only if the snapshot commit is needed for evidence; otherwise close after its contents are either merged onto the intended line or archived. |
| `controller/iss-20260623-dde2e7-t1-6de59a70` | `987f485` | `b9f4c95` | `(none)` | `(none)` | no merge-base, `83 ahead / 334 behind` | merge-base `987f485`, `0 / 0` | Current audit worktree branch; no unique code relative to current product feature. | Do not publish as a durable branch. Safe to treat as temporary controller execution state. |
| `controller/iss-20260623-dde2e7-t2-b6bb5653` | `987f485` | `b9f4c95` | `(none)` | `(none)` | no merge-base, `83 ahead / 334 behind` | merge-base `987f485`, `0 / 0` | Sibling controller execution branch; no unique code. | Same as T1: keep ephemeral, exclude from release governance decisions. |
| `feature/v8.1-runtime-storage-isolation-ready` | `987f485` | `b9f4c95` | `origin/feature/v8.1-runtime-storage-isolation-ready` | `=` | no merge-base, `83 ahead / 334 behind` | merge-base `987f485`, `0 / 0` | Appears to be the current product line actually mirrored by `origin/main` and `origin/release/v8.1`. | Treat this as the active release candidate line until naming is normalized. |
| `main` | `50ae349` | `e8d6af6` | `origin/main` | `[ahead 334, behind 83]` | merge-base `50ae349`, `0 / 0` | no merge-base, `334 ahead / 83 behind` | Local `main` is on a different history from `origin/main`. The configured upstream relationship is misleading and high-risk. | Highest-priority governance item: decide whether local `main` should be renamed, archived, or detached from `origin/main` before any public release work. |

## Remote Branches

### `origin/*`

| Branch | Head | Root | State vs local `main` | State vs current feature | Assessment | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| `origin/main` | `987f485` | `b9f4c95` | no merge-base, `83 ahead / 334 behind` | merge-base `987f485`, `0 / 0` | Remote default branch name currently points to the v8.1 product line, not the local `main` history. | Before public release, explicitly choose whether this remains the canonical product line or whether branch naming must be realigned. |
| `origin/release/v8.1` | `987f485` | `b9f4c95` | no merge-base, `83 ahead / 334 behind` | merge-base `987f485`, `0 / 0` | Alias of `origin/main` at inspection time. | Keep only if a release alias is intentionally part of governance; otherwise consider pruning later. |
| `origin/feature/v8.1-runtime-storage-isolation-ready` | `987f485` | `b9f4c95` | no merge-base, `83 ahead / 334 behind` | merge-base `987f485`, `0 / 0` | Another alias of the same head commit. | Good candidate to collapse after branch policy is defined. |
| `origin/feature/v8.1-runtime-storage-isolation-final` | `315983c` | `b9f4c95` | no merge-base, `68 ahead / 334 behind` | merge-base `315983c`, `0 ahead / 15 behind` | Slightly behind the ready branch on the same history. | Likely superseded by `-ready`; keep only if release evidence points to this exact stop-point. |
| `origin/feature/v8.1-runtime-storage-isolation` | `8b5a929` | `b9f4c95` | no merge-base, `67 ahead / 334 behind` | merge-base `8b5a929`, `0 ahead / 16 behind` | Older stop-point on the same history. | Candidate for later cleanup after documenting lineage. |
| `origin/feature/v8.1-multi-repository-final` | `a1a2f6e` | `b9f4c95` | no merge-base, `39 ahead / 334 behind` | merge-base `a1a2f6e`, `0 ahead / 44 behind` | Distinct feature branch on the same v8 root. | Review whether its changes are already incorporated downstream; archive or merge intentionally. |
| `origin/feature/v8.1-multi-repository` | `9f45990` | `b9f4c95` | no merge-base, `30 ahead / 334 behind` | merge-base `9f45990`, `0 ahead / 53 behind` | Earlier state of the same feature track. | Candidate for later cleanup after confirming supersession by `-final`. |
| `origin/package/v8.1-full-ready` | `da18989` | `b9f4c95` | no merge-base, `71 ahead / 334 behind` | merge-base `010b937`, `2 ahead / 14 behind` | Packaging branch diverged slightly from current feature line. | Keep only if packaging artifacts must remain reproducible from branch tip. |
| `origin/codex/package-v8.1-full-ready` | `a27d38e` | `b9f4c95` | no merge-base, `70 ahead / 334 behind` | merge-base `010b937`, `1 ahead / 14 behind` | Similar packaging side branch with one fewer unique commit than `origin/package/v8.1-full-ready`. | Consolidate policy with the packaging branch above; likely not both needed long-term. |
| `origin/v7-1-runtime-efficiency` | `cd49250` | `b9f4c95` | no merge-base, `5 ahead / 334 behind` | merge-base `cd49250`, `0 ahead / 78 behind` | Legacy v7.1 branch on the v8-rooted history. | Keep only if it anchors a documented support or migration line. |

### `upstream/*`

| Branch | Head | Root | State vs local `main` | Assessment | Recommendation |
| --- | --- | --- | --- | --- | --- |
| `upstream/main` | `50ae349` | `e8d6af6` | merge-base `50ae349`, `0 / 0` | Local `main` is identical to upstream main. | Strong evidence that local `main` tracks upstream lineage, not the current origin default line. |
| `upstream/codex/release-0.7.5` | `75b7a50` | `e8d6af6` | merge-base `75b7a50`, `0 ahead / 16 behind` | Historical upstream release branch behind upstream main. | Keep only as upstream reference; not part of current publish line. |
| `upstream/codex/deep-research-mcp-trigger-guidance` | `b27885d` | `e8d6af6` | merge-base `e60a1d6`, `1 ahead / 18 behind` | Active upstream topic branch. | Reference only; no action in this repository without explicit sync intent. |
| `upstream/codex/lane-runtime-pr4-pr5` | `2260dd2` | `e8d6af6` | merge-base `e60a1d6`, `7 ahead / 18 behind` | Active upstream topic branch. | Same as above. |
| `upstream/codex/repo-harness-codegraph-s0` | `a4c5483` | `e8d6af6` | merge-base `50ae349`, `1 ahead / 0 behind` | Upstream branch ahead of local/upstream main by 1 commit. | Indicates active upstream development continuing past `50ae349`. |
| `upstream/codex/repo-harness-codegraph-s1` | `9efd134` | `e8d6af6` | merge-base `50ae349`, `2 ahead / 0 behind` | Upstream branch ahead by 2 commits. | Same pattern: upstream has active post-main topic work. |
| `upstream/codex/repo-harness-codegraph-s2` | `6befcb4` | `e8d6af6` | merge-base `50ae349`, `3 ahead / 0 behind` | Upstream branch ahead by 3 commits. | Same as above. |
| `upstream/codex/repo-harness-codegraph-s2-perf` | `7756d83` | `e8d6af6` | merge-base `50ae349`, `4 ahead / 0 behind` | Upstream branch ahead by 4 commits. | Same as above. |
| `upstream/codex/repo-harness-codegraph-s2-perf-cache` | `7707a21` | `e8d6af6` | merge-base `50ae349`, `5 ahead / 0 behind` | Upstream branch ahead by 5 commits. | Same as above. |
| `upstream/codex/repo-harness-codegraph-s2-warm-path` | `8a0ef86` | `e8d6af6` | merge-base `50ae349`, `6 ahead / 0 behind` | Upstream branch ahead by 6 commits. | Same as above. |
| `upstream/codex/repo-harness-codegraph-s2-module` | `6008c39` | `e8d6af6` | merge-base `50ae349`, `7 ahead / 0 behind` | Upstream branch ahead by 7 commits. | Same as above. |
| `upstream/codex/repo-harness-codegraph-s2-streaming-manifest` | `6008c39` | `e8d6af6` | merge-base `50ae349`, `7 ahead / 0 behind` | Duplicate pointer to the same commit as `-s2-module`. | Later cleanup candidate on the upstream side if duplicated intentionally. |
| `upstream/codex/repo-harness-codegraph-s3-write-file` | `e37d3bf` | `e8d6af6` | merge-base `50ae349`, `8 ahead / 0 behind` | Upstream branch ahead by 8 commits. | Reference only. |
| `upstream/codex/repo-harness-codegraph-s3-index-sync` | `d32804e` | `e8d6af6` | merge-base `50ae349`, `9 ahead / 0 behind` | Upstream branch ahead by 9 commits. | Reference only. |
| `upstream/codex/repo-harness-codegraph-s3-apply-patch` | `8dcbc73` | `e8d6af6` | merge-base `50ae349`, `10 ahead / 0 behind` | Upstream branch ahead by 10 commits. | Reference only. |
| `upstream/codex/repo-harness-codegraph-s3-path-mutations` | `d8979aa` | `e8d6af6` | merge-base `50ae349`, `11 ahead / 0 behind` | Upstream branch ahead by 11 commits. | Reference only. |
| `upstream/codex/repo-harness-codegraph-s3-module` | `43cd5b3` | `e8d6af6` | merge-base `50ae349`, `12 ahead / 0 behind` | Upstream branch ahead by 12 commits. | Reference only. |
| `upstream/codex/repo-harness-codegraph-s3-failure-index-recovery` | `43cd5b3` | `e8d6af6` | merge-base `50ae349`, `12 ahead / 0 behind` | Duplicate pointer to the same commit as `-s3-module`. | Same as above. |
| `upstream/codex/repo-harness-codegraph-s4-security-hardening` | `49f1e69` | `e8d6af6` | merge-base `50ae349`, `13 ahead / 0 behind` | Upstream branch ahead by 13 commits. | Reference only. |
| `upstream/codex/repo-harness-codegraph-s4-observability` | `5550113` | `e8d6af6` | merge-base `50ae349`, `14 ahead / 0 behind` | Upstream branch ahead by 14 commits. | Reference only. |
| `upstream/codex/repo-harness-codegraph-s4-migration` | `1acbf14` | `e8d6af6` | merge-base `50ae349`, `15 ahead / 0 behind` | Upstream branch ahead by 15 commits. | Reference only. |
| `upstream/codex/repo-harness-codegraph-s4-module` | `4121959` | `e8d6af6` | merge-base `50ae349`, `17 ahead / 0 behind` | Furthest-ahead upstream topic branch observed. | Reference only; confirms upstream continues beyond the local old-main line. |

## Tags

Observed tags, sorted by semantic-looking version order:

`v0.1.2`, `v0.1.3`, `v0.1.4`, `v0.1.5`, `v0.2.0`, `v0.2.1`, `v0.2.2`, `v0.2.3`, `v0.2.4`, `v0.3.0`, `v0.4.0`, `v0.4.1`, `v0.4.2`, `v0.4.3`, `v0.5.0`, `v0.5.1`, `v0.5.2`, `v0.5.3`, `v0.6.0`, `v0.7.0`, `v0.7.1`, `v0.7.2`, `v0.7.3`, `v0.7.4`, `v0.7.5`, `v0.8.0`, `v3.4.0`, `v3.5.0`, `v3.6.0`, `v4.0.0`, `v4.0.1`, `v5.0.0`, `v5.0.1`, `v5.0.2`, `v5.1.0`, `v5.1.1`, `v5.1.2`, `v5.2.0`, `v5.2.1`, `v5.2.2`, `v5.2.3`

Tag observations:

- The repository contains at least three visible version eras:
  - `v0.x` tags on the `repo-harness` line.
  - `v3.x` to `v5.x` tags from earlier `project-initializer` / `agentic-dev` naming eras.
- The mixed tag families reinforce the need to separate product versioning from Controller protocol versioning before open-source release messaging.

## Merge and divergence findings

### Local branches merged into local `main`

- `main`

### Local branches not merged into local `main`

- `codex/v81-current-snapshot-20260623`
- `controller/iss-20260623-dde2e7-t1-6de59a70`
- `controller/iss-20260623-dde2e7-t2-b6bb5653`
- `feature/v8.1-runtime-storage-isolation-ready`

Interpretation:

- This result is expected once the repository is split across two unrelated histories.
- It should not be read as “all v8.1 work is pending merge into local main”; instead it proves local `main` is not the same product line as current `origin/main`.

### Remote branches merged into `origin/main`

- `origin/HEAD -> origin/main`
- `origin/feature/v8.1-multi-repository`
- `origin/feature/v8.1-multi-repository-final`
- `origin/feature/v8.1-runtime-storage-isolation`
- `origin/feature/v8.1-runtime-storage-isolation-final`
- `origin/feature/v8.1-runtime-storage-isolation-ready`
- `origin/main`
- `origin/release/v8.1`
- `origin/v7-1-runtime-efficiency`

Interpretation:

- Every observed `origin/*` topic branch is already reachable from `origin/main`.
- This suggests the `origin` side is mostly carrying retained aliases and checkpoints rather than independent active heads.

### Remote branches not merged into `origin/main`

- `origin/codex/package-v8.1-full-ready`
- `origin/package/v8.1-full-ready`
- all observed `upstream/*` branches

Interpretation:

- The two `origin` packaging branches remain outside the current `origin/main` tip by 1-2 commits and should be reviewed as possible release artifact branches.
- All `upstream/*` branches are expected to be outside `origin/main` because they belong to the separate upstream lineage.

## Unpushed commits and dirty state

### Dirty state

- No dirty tracked files were present before creating this report.
- No untracked files were present before creating this report.

### Local commits not present on any remote-tracking branch

| Branch | Commit | Status | Note |
| --- | --- | --- | --- |
| `codex/v81-current-snapshot-20260623` | `ab474fc` | local-only commit | `git branch -r --contains ab474fc` returned no remote branch. |

### Local branches without upstream, but whose tip commit already exists remotely

| Branch | Commit | Remote refs containing commit | Note |
| --- | --- | --- | --- |
| `controller/iss-20260623-dde2e7-t1-6de59a70` | `987f485` | `origin/main`, `origin/release/v8.1`, `origin/feature/v8.1-runtime-storage-isolation-ready` | Branch name is local-only, but code is already represented on `origin`. |
| `controller/iss-20260623-dde2e7-t2-b6bb5653` | `987f485` | `origin/main`, `origin/release/v8.1`, `origin/feature/v8.1-runtime-storage-isolation-ready` | Same as above. |

### Upstream tracking anomaly

- Local `main` tracks `origin/main`, but the two refs have no merge-base.
- This is the most dangerous branch-topology issue found in the audit because ordinary ahead/behind indicators become semantically misleading across unrelated histories.

## Orphaned or governance-risk branches

The following are not “orphaned” in the Git object sense, but they are governance-risk refs because they either lack an upstream, duplicate another published head, or sit on an unexpected lineage:

- `main`
  - Risk: tracks the wrong remote branch name for its actual lineage.
- `codex/v81-current-snapshot-20260623`
  - Risk: unique local commit, no upstream, old-main lineage.
- `controller/iss-20260623-dde2e7-t1-6de59a70`
- `controller/iss-20260623-dde2e7-t2-b6bb5653`
  - Risk: ephemeral execution refs that should not leak into public branch policy.
- `origin/release/v8.1`
- `origin/feature/v8.1-runtime-storage-isolation-ready`
- `origin/main`
  - Risk: three branch names currently alias the same head, which obscures canonical release intent.
- `origin/codex/package-v8.1-full-ready`
- `origin/package/v8.1-full-ready`
  - Risk: packaging side branches diverged slightly from current release tip and are not merged into `origin/main`.

## Recommended next governance actions

1. Decide which history becomes the public canonical line.
   - Current evidence says the publishable v8.1 product line is the `b9f4c95 -> 987f485` history, while local `main` remains an upstream-derived line.
2. Untangle branch naming before any open-source release motion.
   - Specifically resolve the `local main` vs `origin/main` unrelated-history mismatch.
3. Define a canonical public release branch set.
   - At minimum decide among `origin/main`, `origin/release/v8.1`, and `origin/feature/v8.1-runtime-storage-isolation-ready`.
4. Review whether `ab474fc` from `codex/v81-current-snapshot-20260623` must be preserved.
   - It is the only clearly unpushed commit found.
5. Treat controller execution branches as private operational refs.
   - They are implementation artifacts, not product branches.
6. Evaluate whether packaging branches need durable retention.
   - If not, they are later cleanup candidates once release reproducibility is documented.

## Evidence commands run

```bash
git status --short --branch
git status --short --untracked-files=all
git rev-parse --show-toplevel
git rev-parse --git-common-dir
git worktree list --porcelain
git remote -v
git branch -vv --all
git tag --list --sort=version:refname
git for-each-ref --format='%(refname:short)|%(objectname:short)|%(committerdate:iso8601)|%(upstream:short)|%(upstream:trackshort)|%(subject)' refs/heads refs/remotes
git branch --merged main
git branch --no-merged main
git branch -r --merged origin/main
git branch -r --no-merged origin/main
git log --graph --decorate --oneline --boundary --all --simplify-by-decoration --max-count=120
git rev-list --max-parents=0 <ref>
git merge-base <refA> <refB>
git rev-list --left-right --count <refA>...<refB>
git branch -r --contains <sha>
bun scripts/inspect-project-state.ts --repo . --format text
```
