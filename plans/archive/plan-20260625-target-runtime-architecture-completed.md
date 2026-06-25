# Target Controller Runtime Architecture Migration

> **Status**: Completed
> **Completed At**: 2026-06-25
> **Runtime Authority**: `docs/architecture/current/`

## Objective

Implement the approved control-plane topology without removing existing product capabilities:

```text
Thin Gateway -> Global Scheduler -> Repo Actor -> Durable ExecutionJob
             -> isolated Worker -> Evidence / Artifact / Projection planes
```

## Delivered boundaries

- durable persist-before-execute MCP command acceptance;
- request-id and semantic-key idempotency;
- independently restartable Controller Daemon;
- per-repository actor mailbox and conservative resource claims;
- renewable leases with fencing tokens;
- isolated Worker processes and reconciliation;
- global fairness, repository/provider/heavy-check/host budgets;
- indexed Execution Jobs, Agent Runs, Local Jobs, Schedule Occurrences and Portfolio workflows;
- bounded Schedule/Occurrence engine and Portfolio DAG/Saga;
- exact-revision evidence, bounded artifacts and materialized projections;
- exclusive Release Gate and external-side-effect authorization;
- split health/readiness/repository health endpoints;
- compatibility projection for legacy MCP, Issue/Task/Run, Edit Session and Local Bridge contracts.

## Acceptance

The migration is accepted only when `check:type`, `check:runtime-architecture`, focused runtime tests, Scheduler-to-Worker smoke tests, MCP tool-surface compatibility, package dry-run and source-manifest checks pass. Full Bun-native tests remain a release-environment gate when Bun is unavailable in the packaging environment.
