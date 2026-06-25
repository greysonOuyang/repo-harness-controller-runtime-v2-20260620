# Plan Governance

`plans/` is the repository-owned business-intent and implementation-planning layer. It is **not the runtime execution queue** and is never scanned on the MCP, health, Job status, or scheduler hot paths.

## Directory contract

- `plans/prds/` — product intent and acceptance boundary.
- `plans/sprints/` — ordered delivery backlog derived from a PRD.
- `plans/plan-*.md` — reviewable implementation plans and scope contracts.
- `plans/archive/` — completed, superseded, abandoned, or historical plans.

A Plan describes why and how work should be performed. Runtime execution is owned by `ExecutionJob`, Agent `Run`, `EditSession`, `Verification`, resource `Lease`, event and evidence records in Controller Home.

## Lifecycle

```text
Draft -> Reviewed -> Active -> Completed | Superseded | Abandoned -> Archive
```

Only an explicitly selected plan may be considered active. Existing scripts may project the selected plan into a Task checklist, but the plan file itself does not acquire resources, start a Worker, or determine Job terminal state.

## Performance and retention

- Gateway and Controller health paths must not scan this directory.
- Historical plans remain available for audit but are moved to `plans/archive/` when their status is known.
- Unknown legacy plans remain preserved rather than being silently declared complete.
- Large logs, generated artifacts, runtime state, credentials, dependencies and Worktrees must never be stored here.

## Current architecture migration

The 2026-06-25 target runtime migration is recorded in `plans/archive/plan-20260625-target-runtime-architecture-completed.md`. Its executable authority is the code under `src/runtime/` and the current architecture documents under `docs/architecture/current/`.
