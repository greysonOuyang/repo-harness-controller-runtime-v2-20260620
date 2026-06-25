import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { registerRepository } from '../src/cli/repositories/registry';
import { createExecutionJob, getExecutionJob, transitionExecutionJob } from '../src/runtime/execution/jobs/store';
import { evaluateSchedule } from '../src/runtime/workflow/schedules/engine';
import { settleScheduledExecution } from '../src/runtime/workflow/schedules/settlement';
import { createSchedule, getSchedule, getScheduleDecision } from '../src/runtime/workflow/schedules/store';
import { recordCandidateFinding } from '../src/runtime/workflow/findings/store';

const root = mkdtempSync(join(tmpdir(), 'repo-harness-schedule-smoke-'));
const repoRoot = join(root, 'repo');
const controllerHome = join(root, 'controller');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function git(...args: string[]): void { execFileSync('git', ['-C', repoRoot, ...args], { stdio: 'ignore' }); }

try {
  execFileSync('mkdir', ['-p', repoRoot]);
  git('init');
  git('config', 'user.email', 'schedule-smoke@example.invalid');
  git('config', 'user.name', 'Schedule Smoke');
  writeFileSync(join(repoRoot, 'README.md'), '# schedule smoke\n', 'utf8');
  git('add', 'README.md');
  git('commit', '-m', 'initial');
  const repository = registerRepository({ path: repoRoot, controllerHome, displayName: 'schedule-smoke' });
  const base = {
    repoId: repository.repoId,
    enabled: true,
    policy: {
      maxActiveOccurrences: 1,
      maxFailures: 3,
      cooldownMinutes: 0,
      dailyBudgetMinutes: 30,
      shadowMode: true,
      backoffBaseMinutes: 1,
      backoffMaxMinutes: 8,
    },
    action: { operation: 'controller_context', resourceClaims: [] },
    stopConditions: [] as string[],
  };

  const manual = createSchedule(controllerHome, { ...base, requestId: 'schedule-manual', name: 'manual', trigger: { type: 'manual' } });
  const manualOccurrence = await evaluateSchedule(controllerHome, manual, true, { source: 'manual', eventId: 'manual-1' });
  assert(manualOccurrence?.status === 'shadowed' && manualOccurrence.decisionId, 'manual bounded occurrence missing');
  assert(getScheduleDecision(controllerHome, repository.repoId, manualOccurrence.decisionId)?.decision === 'would_execute', 'Schedule Decision was not persisted');

  const repositoryEvent = createSchedule(controllerHome, {
    ...base, requestId: 'schedule-event', name: 'event', trigger: { type: 'repository-event', eventName: 'git.push' },
  });
  const mismatched = await evaluateSchedule(controllerHome, repositoryEvent, true, { source: 'repository-event', eventName: 'git.pull', eventId: 'evt-0' });
  assert(mismatched === undefined, 'mismatched repository event was accepted');
  const eventA = await evaluateSchedule(controllerHome, repositoryEvent, true, { source: 'repository-event', eventName: 'git.push', eventId: 'evt-1' });
  const eventB = await evaluateSchedule(controllerHome, repositoryEvent, true, { source: 'repository-event', eventName: 'git.push', eventId: 'evt-1' });
  assert(eventA?.occurrenceId === eventB?.occurrenceId, 'repository event was not idempotent');

  const dependency = createExecutionJob(controllerHome, {
    repoId: repository.repoId,
    type: 'mcp-tool',
    requestId: 'schedule-dependency-job',
    semanticKey: 'schedule-dependency-job',
    origin: { surface: 'system' },
    payload: { operation: 'controller_context', target: 'mcp-tool' },
    resourceClaims: [],
  }).job;
  transitionExecutionJob(controllerHome, repository.repoId, dependency.jobId, 'running');
  transitionExecutionJob(controllerHome, repository.repoId, dependency.jobId, 'succeeded');
  const dependencySchedule = createSchedule(controllerHome, {
    ...base, requestId: 'schedule-dependency', name: 'dependency',
    trigger: { type: 'dependency-checkpoint', dependencyJobIds: [dependency.jobId] },
  });
  const dependencyOccurrence = await evaluateSchedule(controllerHome, dependencySchedule);
  assert(dependencyOccurrence?.status === 'shadowed', 'dependency checkpoint did not fire');

  recordCandidateFinding(controllerHome, {
    repoId: repository.repoId,
    requestId: 'schedule-candidate-1',
    semanticKey: 'schedule:condition',
    title: 'Condition finding',
    evidence: { source: 'smoke' },
  });
  recordCandidateFinding(controllerHome, {
    repoId: repository.repoId,
    requestId: 'schedule-candidate-2',
    semanticKey: 'schedule:condition',
    title: 'Condition finding',
    evidence: { source: 'smoke' },
  });
  const conditionSchedule = createSchedule(controllerHome, {
    ...base, requestId: 'schedule-condition', name: 'condition',
    trigger: { type: 'condition', everyMinutes: 1, condition: { kind: 'candidate_observation_threshold', semanticKey: 'schedule:condition', observationThreshold: 2 } },
  });
  const conditionOccurrence = await evaluateSchedule(controllerHome, conditionSchedule);
  assert(conditionOccurrence?.status === 'shadowed', 'condition watch did not fire');

  const cron = createSchedule(controllerHome, { ...base, requestId: 'schedule-cron', name: 'cron', trigger: { type: 'cron', cronExpression: '* * * * *' } });
  assert((await evaluateSchedule(controllerHome, cron))?.status === 'shadowed', 'cron Schedule did not fire');
  const calendar = createSchedule(controllerHome, { ...base, requestId: 'schedule-calendar', name: 'calendar', trigger: { type: 'calendar', calendarAt: '2000-01-01T00:00:00.000Z' } });
  assert((await evaluateSchedule(controllerHome, calendar))?.status === 'shadowed', 'calendar Schedule did not fire');

  const failing = createSchedule(controllerHome, {
    ...base,
    requestId: 'schedule-backoff',
    name: 'backoff',
    trigger: { type: 'manual' },
    policy: { ...base.policy, shadowMode: false },
  });
  const failingOccurrence = await evaluateSchedule(controllerHome, failing, true, { source: 'manual', eventId: 'failure-1' });
  assert(failingOccurrence?.jobId, 'non-shadow Schedule did not create a durable Job');
  const failingJob = getExecutionJob(controllerHome, repository.repoId, failingOccurrence.jobId);
  settleScheduledExecution(controllerHome, failingJob, 'failed', 'synthetic failure');
  const backedOff = getSchedule(controllerHome, repository.repoId, failing.scheduleId);
  assert(backedOff.consecutiveFailures === 1 && backedOff.nextEligibleAt, 'exponential backoff state was not persisted');

  const infrastructureJob = createExecutionJob(controllerHome, {
    repoId: repository.repoId,
    type: 'mcp-tool',
    requestId: 'schedule-external-blocker-job',
    semanticKey: 'schedule-external-blocker-job',
    origin: { surface: 'system' },
    payload: { operation: 'controller_context', target: 'mcp-tool' },
    resourceClaims: [],
  }).job;
  transitionExecutionJob(controllerHome, repository.repoId, infrastructureJob.jobId, 'running');
  transitionExecutionJob(controllerHome, repository.repoId, infrastructureJob.jobId, 'failed', {
    error: { code: 'UPSTREAM_502', message: 'external connection failed', retryable: true },
  });
  const blockerSchedule = createSchedule(controllerHome, {
    ...base, requestId: 'schedule-external-blocker', name: 'external-blocker', trigger: { type: 'manual' },
    stopConditions: ['external_blocker'],
  });
  const blockerOccurrence = await evaluateSchedule(controllerHome, blockerSchedule, true, { source: 'manual', eventId: 'blocker-1' });
  assert(blockerOccurrence?.status === 'skipped' && blockerOccurrence.decision === 'stopped', 'external blocker stop condition did not suppress work');

  console.log(JSON.stringify({
    status: 'ok',
    manualDecision: manualOccurrence.decisionId,
    repositoryEventIdempotent: eventA?.occurrenceId === eventB?.occurrenceId,
    dependencyCheckpoint: dependencyOccurrence?.status,
    conditionWatch: conditionOccurrence?.status,
    cron: 'shadowed',
    calendar: 'shadowed',
    backoffUntil: backedOff.nextEligibleAt,
    externalBlocker: blockerOccurrence?.decision,
  }, null, 2));
} finally {
  rmSync(root, { recursive: true, force: true });
}
