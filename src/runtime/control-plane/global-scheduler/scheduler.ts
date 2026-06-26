import { spawn, type ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import { join } from 'path';
import { cpus, freemem, loadavg } from 'os';
import { listRepositories } from '../../../cli/repositories/registry';
import { ensureControllerHome } from '../../../cli/repositories/controller-home';
import { getExecutionJob, listActiveExecutionJobs, transitionExecutionJob } from '../../execution/jobs/store';
import { releaseExecutionLeases } from '../../resources/leases/store';
import { RepoActorRegistry } from '../repo-actor/registry';
import { reconcileExecutionJobs } from './reconciliation';
import { tickSchedules } from '../../workflow/schedules/engine';
import { tickPortfolioWorkflows } from '../../workflow/portfolio/engine';
import { readJsonFile, writeJsonAtomic } from '../../shared/json-files';


interface SchedulerState {
  schemaVersion: 1;
  updatedAt: string;
  loopStartedAt?: string;
  lastTickAt?: string;
  lastDispatchAt?: string;
  lastReconcileAt?: string;
  lastRepoDispatch: Record<string, number>;
}

function schedulerStatePath(controllerHome: string): string {
  return join(ensureControllerHome(controllerHome), 'scheduler', 'state.json');
}

export interface SchedulerHealthSnapshot {
  schemaVersion: 1;
  updatedAt: string;
  loopStartedAt?: string;
  lastTickAt?: string;
  lastDispatchAt?: string;
  lastReconcileAt?: string;
  lastRepoDispatch: Record<string, number>;
}

export function readSchedulerHealthSnapshot(controllerHome: string): SchedulerHealthSnapshot {
  return readJsonFile<SchedulerHealthSnapshot>(schedulerStatePath(controllerHome), {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    lastRepoDispatch: {},
  });
}

export interface SchedulerConfig {
  maxWorkers: number;
  maxConcurrentRepositories: number;
  pollIntervalMs: number;
  maxHeavyChecks: number;
  maxAgentProcesses: number;
  maxCodexProcesses: number;
  maxClaudeProcesses: number;
  maxGitHubProcesses: number;
  minFreeMemoryMb: number;
  maxLoadPerCpu: number;
}

export interface SchedulerRuntimeBinding {
  controllerPid?: number;
  controllerStartedAt?: string;
}

export class GlobalScheduler {
  private readonly controllerHome: string;
  private readonly actors: RepoActorRegistry;
  private readonly children = new Map<string, ChildProcess>();
  private readonly config: SchedulerConfig;
  private readonly controllerPid: number;
  private readonly controllerStartedAt?: string;
  private lastScheduleTick = 0;
  private lastPortfolioTick = 0;
  private lastReconcile = 0;
  private lastPersistedAt = 0;
  private readonly lastRepoDispatch = new Map<string, number>();
  private readonly loopStartedAt = new Date().toISOString();
  private lastTickAt = this.loopStartedAt;
  private lastDispatchAt: string | undefined;
  private lastReconcileAt: string | undefined;

  constructor(
    controllerHome: string,
    config: Partial<SchedulerConfig> = {},
    runtime: SchedulerRuntimeBinding = {},
  ) {
    this.controllerHome = controllerHome;
    this.actors = new RepoActorRegistry(controllerHome);
    this.config = {
      maxWorkers: Math.max(1, config.maxWorkers ?? Number(process.env.REPO_HARNESS_MAX_WORKERS ?? 4)),
      maxConcurrentRepositories: Math.max(1, config.maxConcurrentRepositories ?? Number(process.env.REPO_HARNESS_MAX_ACTIVE_REPOS ?? 4)),
      pollIntervalMs: Math.max(50, config.pollIntervalMs ?? 250),
      maxHeavyChecks: Math.max(1, config.maxHeavyChecks ?? Number(process.env.REPO_HARNESS_MAX_HEAVY_CHECKS ?? 2)),
      maxAgentProcesses: Math.max(1, config.maxAgentProcesses ?? Number(process.env.REPO_HARNESS_MAX_AGENT_PROCESSES ?? 4)),
      maxCodexProcesses: Math.max(1, config.maxCodexProcesses ?? Number(process.env.REPO_HARNESS_MAX_CODEX_PROCESSES ?? 3)),
      maxClaudeProcesses: Math.max(1, config.maxClaudeProcesses ?? Number(process.env.REPO_HARNESS_MAX_CLAUDE_PROCESSES ?? 2)),
      maxGitHubProcesses: Math.max(1, config.maxGitHubProcesses ?? Number(process.env.REPO_HARNESS_MAX_GITHUB_PROCESSES ?? 2)),
      minFreeMemoryMb: Math.max(64, config.minFreeMemoryMb ?? Number(process.env.REPO_HARNESS_MIN_FREE_MEMORY_MB ?? 512)),
      maxLoadPerCpu: Math.max(0.25, config.maxLoadPerCpu ?? Number(process.env.REPO_HARNESS_MAX_LOAD_PER_CPU ?? 1.5)),
    };
    this.controllerPid = runtime.controllerPid ?? process.pid;
    this.controllerStartedAt = runtime.controllerStartedAt;
    const state = readJsonFile<SchedulerState>(schedulerStatePath(controllerHome), { schemaVersion: 1, updatedAt: new Date().toISOString(), lastRepoDispatch: {} });
    for (const [repoId, timestamp] of Object.entries(state.lastRepoDispatch)) {
      if (Number.isFinite(timestamp)) this.lastRepoDispatch.set(repoId, timestamp);
    }
  }

  private persistState(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastPersistedAt < 1_000) return;
    this.lastPersistedAt = now;
    writeJsonAtomic(schedulerStatePath(this.controllerHome), {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      loopStartedAt: this.loopStartedAt,
      lastTickAt: this.lastTickAt,
      lastDispatchAt: this.lastDispatchAt,
      lastReconcileAt: this.lastReconcileAt,
      lastRepoDispatch: Object.fromEntries(this.lastRepoDispatch),
    } satisfies SchedulerState);
  }

  private pidAlive(pid: number | undefined): boolean {
    if (!pid || pid <= 0) return false;
    try { process.kill(pid, 0); return true; } catch { return false; }
  }

  private terminateWorkerProcessGroup(pid: number | undefined, signal: NodeJS.Signals = 'SIGTERM'): void {
    if (!pid || pid === process.pid) return;
    if (process.platform !== 'win32') {
      try {
        process.kill(-pid, signal);
        return;
      } catch { /* fall back to the direct PID */ }
    }
    try { process.kill(pid, signal); } catch { /* already exited */ }
  }

  private cleanupSpawnedWorkers(): void {
    for (const child of this.children.values()) {
      this.terminateWorkerProcessGroup(child.pid);
    }
    this.children.clear();
  }

  private spawnWorker(repoId: string, jobId: string): boolean {
    const tracked = this.children.get(jobId);
    if (tracked?.pid && this.pidAlive(tracked.pid)) return false;
    const current = getExecutionJob(this.controllerHome, repoId, jobId);
    if (current.status !== 'running') return false;
    if (current.workerPid && this.pidAlive(current.workerPid)) return false;
    const entry = fileURLToPath(new URL('../../execution/workers/worker-entry.ts', import.meta.url));
    const bun = Boolean(process.versions.bun);
    const loader = fileURLToPath(new URL('../../shared/node-ts-loader.mjs', import.meta.url));
    const workerArgs = [
      '--controller-home', this.controllerHome,
      '--repo-id', repoId,
      '--job-id', jobId,
      '--controller-pid', String(this.controllerPid),
    ];
    if (this.controllerStartedAt) workerArgs.push('--controller-started-at', this.controllerStartedAt);
    const args = bun
      ? [entry, ...workerArgs]
      : ['--loader', loader, entry, ...workerArgs];
    const child = spawn(process.execPath, args, {
      stdio: ['ignore', 'ignore', 'ignore'],
      detached: process.platform !== 'win32',
      env: { ...process.env, REPO_HARNESS_EXECUTION_WORKER: '1' },
    });
    child.unref();
    this.children.set(jobId, child);
    if (child.pid) {
      transitionExecutionJob(this.controllerHome, repoId, jobId, 'running', { workerPid: child.pid, heartbeatAt: new Date().toISOString() }, { workerPid: child.pid });
    }
    child.once('error', (error) => {
      this.children.delete(jobId);
      try {
        const current = getExecutionJob(this.controllerHome, repoId, jobId);
        releaseExecutionLeases(this.controllerHome, repoId, jobId, current.leaseRefs);
      } catch { /* job may already be terminal or replaced */ }
      try {
        transitionExecutionJob(this.controllerHome, repoId, jobId, 'failed', {
          error: { code: 'WORKER_SPAWN_FAILED', message: error.message, retryable: true },
          leaseRefs: [],
        });
      } catch { /* job may already be terminal */ }
    });
    child.once('exit', () => this.children.delete(jobId));
    return true;
  }

  private resourcePressure(): { pressured: boolean; freeMemoryMb: number; loadPerCpu: number } {
    const freeMemoryMb = freemem() / (1024 * 1024);
    const loadPerCpu = loadavg()[0] / Math.max(1, cpus().length);
    return {
      pressured: freeMemoryMb < this.config.minFreeMemoryMb || loadPerCpu > this.config.maxLoadPerCpu,
      freeMemoryMb,
      loadPerCpu,
    };
  }

  private agentProvider(job: { payload: { arguments?: Record<string, unknown> } }): 'codex' | 'claude' | 'github-copilot' {
    const agent = job.payload.arguments?.agent;
    if (agent === 'claude' || agent === 'github-copilot') return agent;
    return 'codex';
  }

  async tick(): Promise<void> {
    const now = Date.now();
    this.lastTickAt = new Date(now).toISOString();
    if (now - this.lastReconcile >= 5_000) {
      reconcileExecutionJobs(this.controllerHome);
      this.lastReconcile = now;
      this.lastReconcileAt = new Date(now).toISOString();
    }
    const repositories = listRepositories(this.controllerHome).filter((repo) => repo.enabled && !repo.removedAt);
    if (now - this.lastScheduleTick >= 30_000) {
      await tickSchedules(this.controllerHome, repositories.map((repo) => repo.repoId));
      this.lastScheduleTick = now;
    }
    if (now - this.lastPortfolioTick >= 1_000) {
      tickPortfolioWorkflows(this.controllerHome);
      this.lastPortfolioTick = now;
    }
    const active = listActiveExecutionJobs(this.controllerHome);
    const running = active.filter((job) => job.status === 'running');
    const runningCount = running.length;
    let capacity = this.config.maxWorkers - runningCount;
    if (capacity <= 0) {
      this.persistState();
      return;
    }
    let heavyCapacity = this.config.maxHeavyChecks - running.filter((job) => job.type === 'check' || job.type === 'verify-edit').length;
    const runningAgents = running.filter((job) => job.type === 'agent-run' || job.type === 'dispatch-task');
    let agentCapacity = this.config.maxAgentProcesses - runningAgents.length;
    const providerCapacity = new Map([
      ['codex', this.config.maxCodexProcesses - runningAgents.filter((job) => this.agentProvider(job) === 'codex').length],
      ['claude', this.config.maxClaudeProcesses - runningAgents.filter((job) => this.agentProvider(job) === 'claude').length],
      ['github-copilot', this.config.maxGitHubProcesses - runningAgents.filter((job) => this.agentProvider(job) === 'github-copilot').length],
    ] as const);
    const pressure = this.resourcePressure();
    if (pressure.pressured) {
      // Under host pressure, keep one recovery slot available so queued read-only
      // or bounded repository work does not stall forever behind a global stop.
      capacity = Math.min(capacity, 1);
      heavyCapacity = Math.min(heavyCapacity, 1);
      agentCapacity = 0;
      providerCapacity.set('codex', 0);
      providerCapacity.set('claude', 0);
      providerCapacity.set('github-copilot', 0);
    }
    if (capacity <= 0) {
      this.persistState();
      return;
    }
    const priorityWeight: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };
    const agingWindowMs = 30 * 60_000;
    const effectivePriority = (job: (typeof active)[number], at = Date.now()): number => {
      const age = Math.max(0, at - Date.parse(job.queuedAt));
      return Math.max(0, priorityWeight[job.priority] - Math.floor(age / agingWindowMs));
    };
    const compareWaiting = (left: (typeof active)[number], right: (typeof active)[number]): number => {
      const at = Date.now();
      return effectivePriority(left, at) - effectivePriority(right, at)
        || left.queuedAt.localeCompare(right.queuedAt)
        || left.jobId.localeCompare(right.jobId);
    };
    const waiting = active.filter((job) => job.status !== 'running' && job.status !== 'dispatched');
    const topByRepo = new Map<string, (typeof active)[number]>();
    for (const job of waiting.slice().sort(compareWaiting)) {
      if (!topByRepo.has(job.repoId)) topByRepo.set(job.repoId, job);
    }
    const repoIds = [...topByRepo.keys()].sort((left, right) => {
      const leftTop = topByRepo.get(left)!;
      const rightTop = topByRepo.get(right)!;
      const priority = effectivePriority(leftTop) - effectivePriority(rightTop);
      if (priority !== 0) return priority;
      const fairness = (this.lastRepoDispatch.get(left) ?? 0) - (this.lastRepoDispatch.get(right) ?? 0);
      return fairness || leftTop.queuedAt.localeCompare(rightTop.queuedAt) || left.localeCompare(right);
    });
    const runningRepos = new Set(running.map((job) => job.repoId));
    for (const repoId of repoIds) {
      if (capacity <= 0) break;
      if (!runningRepos.has(repoId) && runningRepos.size >= this.config.maxConcurrentRepositories) continue;
      const top = topByRepo.get(repoId);
      if (top && (top.type === 'check' || top.type === 'verify-edit') && heavyCapacity <= 0) continue;
      if (top && (top.type === 'agent-run' || top.type === 'dispatch-task')) {
        if (agentCapacity <= 0) continue;
        if ((providerCapacity.get(this.agentProvider(top)) ?? 0) <= 0) continue;
      }
      const dispatch = this.actors.get(repoId).tryClaimNext();
      if (!dispatch) continue;
      if (dispatch.job.type === 'check' || dispatch.job.type === 'verify-edit') heavyCapacity -= 1;
      if (dispatch.job.type === 'agent-run' || dispatch.job.type === 'dispatch-task') {
        agentCapacity -= 1;
        const provider = this.agentProvider(dispatch.job);
        providerCapacity.set(provider, (providerCapacity.get(provider) ?? 0) - 1);
      }
      if (!this.spawnWorker(repoId, dispatch.job.jobId)) continue;
      const dispatchedAt = Date.now();
      this.lastRepoDispatch.set(repoId, dispatchedAt);
      this.lastDispatchAt = new Date(dispatchedAt).toISOString();
      this.persistState(true);
      runningRepos.add(repoId);
      capacity -= 1;
    }
    this.persistState();
  }

  async run(signal?: AbortSignal): Promise<void> {
    this.persistState(true);
    try {
      while (!signal?.aborted) {
        try {
          await this.tick();
        } catch (error) {
          this.lastTickAt = new Date().toISOString();
          this.persistState(true);
          console.error('[repo-harness scheduler] tick failed:', error);
        }
        await new Promise((resolve) => setTimeout(resolve, this.config.pollIntervalMs));
      }
    } finally {
      this.cleanupSpawnedWorkers();
    }
  }
}
