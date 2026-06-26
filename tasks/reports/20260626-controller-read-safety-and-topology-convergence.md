# Controller Read Safety And Topology Convergence

- Date: 2026-06-26
- Scope: task-run/job read safety, controller lifecycle health verification, and merged worktree cleanup

## Runtime read-safety changes

- `get_task_run` now returns bounded, redacted tails by default and omits local absolute paths unless `include_paths=true`.
- `get_task_run_log` now defaults to a 32 KiB bounded tail and redacts repo/worktree absolute paths.
- `list_task_runs` now returns summary-safe entries by default.
- Runtime `get_job` / `list_jobs` now default to `detail_level=summary`; full durable payloads require explicit opt-in.
- Controller service health verification now computes the Local Controller fingerprint against the target `--repo`, fixing false unhealthy results in detached lifecycle checks.

## Verification evidence

- `bun run check:type`
- `bun test tests/cli/controller-service.test.ts`
- `bun test tests/runtime/target-architecture.test.ts`
- `bash scripts/verify-controller-v8.sh`

All commands passed on 2026-06-26 in this worktree.

## Git topology convergence

- Ran `git fetch origin --prune`.
- Removed merged linked worktrees:
  - `/private/tmp/repo-harness-controller-runtime-followup`
  - `/Users/greyson/.repo-harness/controller/repositories/repo_123b7cf58b6b17b5cbe46a56/worktrees/iss-20260623-dde2e7-t4-273e44ac`
  - `/Users/greyson/.repo-harness/controller/repositories/repo_123b7cf58b6b17b5cbe46a56/worktrees/iss-20260623-dde2e7-t6-73bf8513`
  - `/Users/greyson/.repo-harness/controller/repositories/repo_123b7cf58b6b17b5cbe46a56/worktrees/iss-20260624-6732ee-t14-d0d56398`
  - `/private/tmp/repo-harness-main-fix`
- Deleted merged branches:
  - `codex/controller-runtime-followup`
  - `controller/iss-20260623-dde2e7-t4-273e44ac`
  - `controller/iss-20260623-dde2e7-t6-73bf8513`
  - `controller/iss-20260624-6732ee-t14-d0d56398`
- Preserved non-merged historical branches because they still carry large unique histories:
  - `archive/local-main-pre-convergence-20260624`
  - `codex/v81-current-snapshot-20260623`

## Recovery artifacts

- Dirty merged worktrees were backed up before deletion under `/tmp/repo-harness-worktree-backups/`.
- Backup files include:
  - `repo-harness-controller-runtime-followup.patch`
  - `iss-20260623-dde2e7-t4-273e44ac.patch`
  - `iss-20260623-dde2e7-t6-73bf8513.patch`
  - `iss-20260624-6732ee-t14-d0d56398.patch`

## Resulting topology

- `git worktree list` now contains only the active worktree at `/Users/greyson/DevProjects/repo-harness-controller-runtime`.
- Active local branches remaining:
  - `feature/controller-repository-management`
  - `main`
  - `release/1.4`
  - preserved historical branches listed above
- `feature/controller-repository-management` is `0` behind `origin/main` at the time of cleanup (`git rev-list --left-right --count origin/main...feature/controller-repository-management` => `0 4`).
