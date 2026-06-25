# Controller Runtime System Overview

> Status: **Runtime Authority**

## 1. System Definition

repo-harness Controller Runtime is an **Agent Engineering Control Plane** for repository-backed software work.

It receives decisions and requests from ChatGPT, a local UI, CLI clients, or optional GitHub integrations; converts accepted work into durable repository-scoped state; schedules deterministic tools or optional Agents; isolates concurrent execution; and records evidence required for review, recovery, and release.

The Controller Runtime does not replace the managed repository's build, test, deployment, or release systems. Those systems remain the final execution authority for product behavior.

## 2. Architectural Thesis

The approved topology is:

```text
Clients
  -> Thin Gateway
     -> Global Control Plane
        -> Per-Repository Actor
           -> Durable Job Queue
              -> Isolated Worker
                 -> Workspace / Worktree / External Provider
                    -> Evidence Plane
                       -> Projection Plane
```

The design follows six principles:

1. decisions and execution are separate responsibilities;
2. every accepted long operation becomes durable before it starts;
3. one repository owns its own ordering and conflict decisions;
4. workers may fail without taking down the Gateway;
5. completion is evidence-backed and revision-specific;
6. observation is lightweight and independent from execution.

## 3. Current Implementation

The current repository already contains important parts of this model:

- MCP HTTP and stdio entry points under `src/cli/mcp/`;
- multi-repository registry, checkout identity, runtime storage, and locks under `src/cli/repositories/`;
- Issue, Task, readiness, effective state, verification, governance, and worklog logic under `src/cli/controller/`;
- persistent Agent Runs and worktree integration under `src/cli/agent-jobs/`;
- transactional Direct Edit sessions under `src/cli/editing/`;
- Local Bridge Jobs and localhost UI under `src/cli/local-bridge/`;
- persisted checks, artifacts, logs, and runtime bindings under Controller Home and `.ai/harness/` compatibility links.

Current implementation also has architectural gaps:

- MCP request handling and some long-running operations still share one Node process and call stack;
- repository-scoped locks may cover more work than the short state mutation they protect;
- some operation classes are only partially represented as durable Local Jobs;
- in-memory maps still participate in shared-check and queue behavior;
- a logical Per-Repository Actor is not yet an explicit runtime component;
- schedules and bounded occurrences are not yet first-class entities;
- Gateway, Controller Daemon, and Worker are not fully separated processes.

These gaps are migration work, not permission to ignore the target boundaries below.

## 4. Target Architecture

### 4.1 Thin Gateway

The Thin Gateway owns:

- HTTP/MCP transport;
- authentication and authorization context;
- schema validation;
- repository resolution;
- compact read-model queries;
- durable command acceptance;
- immediate acknowledgement with a Job or entity identifier.

The Thin Gateway MUST NOT own:

- Agent process lifetime;
- command or check execution;
- long repository scans;
- worktree creation or integration;
- release decisions;
- retry loops;
- mutable in-memory state required for recovery.

A write or execution request should normally return:

```json
{
  "accepted": true,
  "jobId": "JOB-...",
  "status": "queued",
  "next": "get_job"
}
```

### 4.2 Global Control Plane

The Global Control Plane owns:

- the repository registry;
- global worker and Agent quotas;
- fairness across repositories;
- cross-repository Portfolio Workflows;
- global schedules and wake-up delivery;
- system-wide health and capacity projections.

It MUST NOT directly mutate repository-local Issue, Task, Job, Run, Edit Session, integration, or release state. It sends repository-scoped commands to the owning Repo Actor.

### 4.3 Per-Repository Actor

Each enabled repository has one logical Repo Actor.

The Repo Actor owns repository-local decisions for:

- Issue and Task transitions;
- Task dependency resolution;
- request deduplication;
- resource claims and execution leases;
- Workspace and Worktree placement;
- Heavy Check queues;
- Integration queues;
- Release Freeze;
- orphan and stale reconciliation;
- repository-local scheduling priorities.

The Actor is a single logical owner, not necessarily a permanent operating-system thread. Its commands MUST be serialized through one mailbox or equivalent durable ordering mechanism.

Separate repositories have separate Actors. A blocked repository MUST NOT block unrelated repository Actors.

### 4.4 Workflow Plane

The Workflow Plane owns durable intent:

- Issues;
- Tasks and dependencies;
- acceptance criteria;
- Schedules;
- Occurrences;
- Portfolio Workflow nodes;
- human review requirements.

It does not own worker PIDs, logs, command output, or transient process state.

### 4.5 Durable Execution Plane

The Durable Execution Plane owns asynchronous operation state:

- Jobs;
- Agent Runs;
- Check executions;
- repository commands;
- edit verification;
- integration operations;
- release-gate executions.

Accepted long work MUST be persisted before a Worker starts. A Worker MUST be able to finish, fail, time out, or become orphaned without relying on the original client connection.

### 4.6 Workspace Plane

The Workspace Plane owns deterministic repository placement and mutation resources:

- active checkout identity;
- Workspace single-writer claim;
- Worktree allocation;
- Git index and ref claims;
- patch integration;
- cleanup and preservation rules.

It does not decide business acceptance. It reports deterministic outcomes and evidence.

### 4.7 Evidence Plane

The Evidence Plane owns immutable or append-only execution evidence:

- localized diffs;
- revision hashes;
- check results;
- logs and output tails;
- command results;
- integration records;
- verification decisions;
- release manifests;
- worklog events.

Evidence is addressable by stable identifiers and MUST be bounded when returned through MCP.

### 4.8 Projection Plane

The Projection Plane owns compact read models:

- active Job indexes;
- request-id indexes;
- Task-to-Run indexes;
- repository summaries;
- project boards;
- current focus;
- attention items;
- recent event tails;
- UI and MCP snapshots.

A projection may be rebuilt from durable state. It MUST NOT become the sole authority for a lifecycle transition.

## 5. Process Topology

### Current Implementation

The MCP server, Controller logic, Local Bridge, checks, and parts of execution can share a Node process. Local Agent workers use child processes, and GitHub execution uses external provider sessions.

### Target Architecture

The minimum process separation is:

```text
repo-harness-gateway
repo-harness-controller-daemon
repo-harness-worker [0..N]
```

#### Gateway process

- serves MCP/HTTP;
- reads compact projections;
- accepts commands;
- remains responsive during heavy work.

#### Controller daemon

- owns global scheduling and Repo Actors;
- persists Job and Lease decisions;
- performs reconciliation;
- delivers Schedule Occurrences;
- does not execute arbitrary long commands itself.

#### Worker processes

- execute Agent sessions, checks, commands, integration, or release gates;
- stream bounded events to durable storage;
- heartbeat their leases;
- can be terminated or restarted independently.

### Migration Rule

Until the processes are fully separated:

- long operations MUST still be Job-backed;
- synchronous child-process APIs MUST NOT be used in the MCP request path;
- repository locks MUST be released after the state transaction, not after the long operation;
- status reads MUST avoid scanning or refreshing full history;
- a failed request connection MUST NOT be treated as cancellation of accepted work.

## 6. Command Flow

A normal write or execution command follows:

```text
Client request
  -> Gateway validates identity and schema
  -> resolve repoId + checkoutId
  -> build idempotency key
  -> Repo Actor validates intent and resource policy
  -> persist Job and command event atomically
  -> Gateway returns accepted Job ID
  -> Scheduler assigns Worker
  -> Worker acquires Lease
  -> Worker executes and emits heartbeats/events
  -> terminal outcome persisted
  -> reconciliation updates linked Task/Run/Occurrence
  -> Projection Plane updates compact views
```

The client may disconnect after acknowledgement. The Job remains authoritative.

## 7. Query Flow

A normal read follows:

```text
Client query
  -> Gateway validates and resolves repository
  -> read bounded projection or one entity by ID
  -> optionally reconcile only that active entity
  -> return compact response
```

Read paths MUST NOT:

- await heavy checks;
- scan all historical Jobs or Runs;
- load complete logs by default;
- refresh every entity to answer a recent-list query;
- acquire a long-lived repository write lock.

Detailed evidence is fetched through explicit entity or artifact tools with limits such as `maxBytes`, `limit`, or event cursor.

## 8. Repository Boundary

The stable repository boundary is `repoId`. A checkout is identified separately by `checkoutId`.

Repository-owned runtime state is stored under Controller Home, with repository-local `.ai/harness/` paths retained as compatibility bindings where required.

A repository remote URL may change without changing the meaning of existing Issue, Task, Job, Run, or Edit Session records. Remote mapping changes require diagnosis and explicit migration; they MUST NOT silently rebind durable entities to a new `repoId`.

## 9. Safety Boundary

The Controller Runtime may automate local, reversible engineering work. It MUST retain explicit authorization for destructive or externally visible actions, including:

- force push;
- history rewrite;
- destructive database operations;
- remote branch deletion with unique work;
- merge;
- package publication;
- production deployment;
- externally visible Issue closure where policy requires review.

Risk metadata controls verification depth and execution policy. It is not a reason to create ceremony for ordinary local work.

## 10. Non-Goals

The target architecture does not require:

- a centralized database before file-backed state proves insufficient;
- distributed transactions across repositories;
- one permanent process per repository;
- an Agent for deterministic integration or verification bookkeeping;
- multiple competing candidate implementations by default;
- automatic approval of architecture, production release, or destructive work.

The desired system is durable and observable, not maximally elaborate.
