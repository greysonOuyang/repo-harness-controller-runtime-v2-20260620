# Architecture Invariants

> Status: **Runtime Authority**

These invariants are the architectural constitution of repo-harness Controller Runtime. Implementation Tasks may improve how they are enforced, but may not weaken them without an accepted ADR.

## Invariant 1 — MCP Requests Do Not Own Long Work

**Target Architecture — MUST**

Any operation that may exceed a short request budget MUST become a durable Job and return an identifier before execution completes.

This includes:

- Agent execution;
- heavy checks;
- edit-session verification with long checks;
- repository commands;
- integration;
- release gates;
- multi-repository rollout;
- schedule-driven work.

**Migration Rule**

While some current tool handlers still await long operations, new handlers MUST use the durable Job path, and touched legacy handlers SHOULD be migrated rather than copied.

## Invariant 2 — Persist Before Execute

**Target Architecture — MUST**

The system MUST persist accepted intent, identity, scope, deadline, and idempotency data before starting a Worker or external session.

Forbidden order:

```text
spawn -> later attempt to save
```

Required order:

```text
validate -> persist -> acknowledge -> dispatch
```

## Invariant 3 — Every Mutation Is Idempotent

**Target Architecture — MUST**

Every write or execution command MUST have a stable idempotency identity derived from:

```text
requestId + repoId + operationType + semanticKey
```

A repeated request MUST reuse or return the original accepted entity. It MUST NOT create duplicate Jobs, Runs, Issues, Occurrences, integrations, or releases.

Schedule-triggered work uses:

```text
scheduleId + repoId + occurrenceWindow
```

## Invariant 4 — Task Is Intent; Run Is Attempt

**Current Implementation and Target Architecture — MUST**

A Task defines one objective, scope, dependencies, checks, risk, and acceptance criteria. A Run records one Agent execution attempt.

A failed Run remains failed. Retry creates a new Run. Historical Runs are evidence and cannot resurrect a terminal Task.

Run success does not by itself mean Task completion.

## Invariant 5 — Job and Run Are Distinct

**Target Architecture — MUST**

A Job represents an asynchronous system operation. A Run represents an Agent attempt.

A dispatch Job may create or link a Run. Check, command, verification, integration, release, and reconciliation Jobs do not need an Agent Run.

Job status MUST NOT be inferred solely from “a Run was dispatched.” It reaches terminal state only when its owned operation reaches terminal state.

## Invariant 6 — One Logical Scheduler Owns Each Repository

**Target Architecture — MUST**

One logical Repo Actor owns repository-local ordering, claims, conflict decisions, integration, and release freeze.

Multiple Workers may execute concurrently, but no other component may independently decide repository-local write ordering.

Focus is presentation state, not an execution lock.

## Invariant 7 — Repository Failures Are Isolated

**Target Architecture — MUST**

A blocked, overloaded, corrupt, or disconnected repository MUST NOT block unrelated repositories.

Global resource limits may delay work fairly, but repository locks, heavy-check queues, dirty workspaces, integration conflicts, or release freezes remain repository-scoped.

## Invariant 8 — Unknown Write Scope Is Conservative

**Target Architecture — MUST**

A non-read-only Task with empty or unknown allowed paths claims repository-wide write scope for conflict purposes.

Unknown scope MUST NOT be interpreted as proof that two write operations are independent.

A Task may regain concurrency only after scope becomes explicit or execution is isolated in a Worktree with serialized integration.

## Invariant 9 — Workspace Has One Writer

**Target Architecture — MUST**

One checkout Workspace may have at most one active write owner.

Read-only work may run concurrently. Independent write work must either:

- wait for the Workspace claim;
- execute in a separate Worktree;
- use an external branch/provider.

Direct Edit and Workspace Agent execution use the same single-writer boundary.

## Invariant 10 — Worktrees Enable Execution Concurrency, Not Integration Concurrency

**Target Architecture — MUST**

Worktree executions may run concurrently when resources allow. Integration into one target checkout is serialized.

Integration MUST validate the reviewed diff, target revision, supported file operations, and current workspace state. Conflicts preserve the Worktree and surface an explicit state; they are not silently rebased or overwritten.

## Invariant 11 — Locks Protect Transactions; Leases Protect Execution

**Target Architecture — MUST**

Short locks protect atomic state decisions. Long execution is protected by renewable Leases.

A Lease includes:

```text
leaseId
resourceKey
ownerJobId
fencingToken
acquiredAt
expiresAt
heartbeatAt
```

A stale Worker MUST NOT update state after a newer fencing token has taken ownership.

## Invariant 12 — Durable Truth Is Not In Memory

**Current Implementation and Target Architecture — MUST**

In-memory maps, promises, queues, UI state, and chat history are caches or coordination aids only.

Accepted work, lifecycle state, ownership, evidence, and terminal outcomes MUST be recoverable from persisted state.

When Controller restart loses an in-memory optimization, persisted indexes or bounded reconciliation must restore correct behavior.

## Invariant 13 — Hot Reads Use Bounded Projections

**Target Architecture — MUST**

Status and list endpoints MUST read bounded indexes or materialized projections.

They MUST NOT linearly scan all history, load complete logs, calculate every repository revision, or reconcile every historical entity for one compact response.

Explicit detail tools may perform bounded entity-specific reads.

## Invariant 14 — Execution and Observation Are Independent

**Target Architecture — MUST**

Heavy work MUST NOT prevent health, repository status, Job status, Run status, or controller context queries from responding.

Gateway and projection availability are separate from Worker health. A Worker crash may degrade readiness but MUST NOT take down lightweight observation.

## Invariant 15 — State Writes Are Atomic

**Current Implementation is partial; Target Architecture — MUST**

Lifecycle snapshots, indexes, Job records, Run metadata, results, verification records, and Lease state MUST be written atomically.

Readers must never observe a half-written JSON document. Append-only event logs must use complete records and tolerate a trailing incomplete record after a crash.

## Invariant 16 — Evidence Binds to Exact Revision

**Target Architecture — MUST**

Verification evidence includes:

```text
repoId
checkoutId
revision
check or command identity
environment fingerprint
executedAt
artifact reference
```

If relevant repository state changes, prior evidence becomes stale for completion purposes unless the check contract explicitly proves it remains valid.

## Invariant 17 — Worker Self-Report Is Not Acceptance

**Current Implementation and Target Architecture — MUST**

An Agent may report that implementation is complete. The Controller determines completion using reviewed diff or integrated revision, required checks, acceptance criteria, and risk policy.

High-risk or destructive work requires explicit human acceptance after evidence passes.

## Invariant 18 — Retry Preserves History

**Current Implementation and Target Architecture — MUST**

Retry creates a new attempt or occurrence. It does not mutate the failed attempt into success.

The original error, output, timestamps, resource ownership, and evidence remain addressable.

## Invariant 19 — Cancellation Is Scoped

**Target Architecture — MUST**

Cancelling one subscriber, Job, or client request MUST NOT terminate a shared execution still required by another active subscriber.

Shared checks and deduplicated work maintain independent subscriber state. The shared Worker may be terminated only when no active owner remains or policy explicitly requires global cancellation.

## Invariant 20 — Conflict Is Usually a Waiting State

**Target Architecture — SHOULD**

Resource contention is modeled as:

```text
waiting_for_workspace
waiting_for_worktree
waiting_for_heavy_check
waiting_for_integration
waiting_for_release_barrier
waiting_for_dependency
```

It should not be reported as execution failure unless the deadline expires, policy is violated, or the conflict is irrecoverable.

## Invariant 21 — Scheduled Work Is Bounded

**Target Architecture — MUST**

A Schedule does not own a forever-running Agent. Each trigger creates one bounded Occurrence with:

- an idempotency window;
- scope;
- budget;
- maximum active count;
- deadline;
- retry/backoff policy;
- stop conditions;
- an explicit outcome.

A valid outcome may be `nothing_to_do`.

## Invariant 22 — Automation Does Not Invent Unlimited Work

**Target Architecture — MUST**

Automated triage may create a Candidate Finding. It may create or update a formal Issue/Task only when evidence and configured policy justify it.

The same semantic problem must deduplicate across occurrences. “The Agent suggests an optimization” is not sufficient evidence by itself.

## Invariant 23 — External Side Effects Remain Explicit

**Current Implementation and Target Architecture — MUST**

The system MUST NOT automatically force-push, rewrite history, publish packages, deploy to production, merge changes, delete unique remote work, or execute destructive data operations without explicit same-request authorization and the required review boundary.

## Invariant 24 — One Rule Has One Owning Document

**Target Architecture — MUST**

Normative architecture rules live in the document assigned by `governance.md`. Other documents link to the owner rather than maintaining a competing copy.

Versioned design documents cannot override the current set.

## Invariant 25 — Architecture Claims Must Expose Migration Gaps

**Target Architecture — MUST**

A target rule must not be written as though it already exists.

Every material gap between Current Implementation and Target Architecture must be either:

- linked to an Issue/Task;
- recorded in `migration-roadmap.md`;
- covered by an explicit Migration Rule.

## Review Use

Every architecture-sensitive Task should cite the invariants it affects. Verification should include a statement that the resulting implementation preserves them or an accepted ADR that changes them.
