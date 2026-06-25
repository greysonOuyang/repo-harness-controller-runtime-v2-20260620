import type { ExecutionJob } from '../../execution/jobs/types';
import { getOccurrence, getSchedule, saveOccurrence, saveSchedule } from './store';


export function markScheduledExecutionRunning(controllerHome: string, job: ExecutionJob): void {
  if (job.type !== 'scheduled-occurrence') return;
  const occurrenceId = typeof job.payload.occurrenceId === 'string' ? job.payload.occurrenceId : undefined;
  if (!occurrenceId) return;
  try {
    const occurrence = getOccurrence(controllerHome, job.repoId, occurrenceId);
    if (occurrence && occurrence.status === 'queued') {
      saveOccurrence(controllerHome, { ...occurrence, status: 'running', decision: 'execute', reason: 'Scheduled Worker started.' });
    }
  } catch {
    // The durable Job remains authoritative if an old occurrence was removed.
  }
}

/**
 * Keep an occurrence and its owning schedule consistent with the terminal
 * state of the durable ExecutionJob that implements it. This is deliberately
 * idempotent so both the Worker and the Reconciler may call it safely.
 */
export function settleScheduledExecution(
  controllerHome: string,
  job: ExecutionJob,
  outcome: 'succeeded' | 'failed',
  reason: string,
): void {
  if (job.type !== 'scheduled-occurrence') return;
  const scheduleId = typeof job.payload.scheduleId === 'string' ? job.payload.scheduleId : undefined;
  const occurrenceId = typeof job.payload.occurrenceId === 'string' ? job.payload.occurrenceId : undefined;
  if (!scheduleId || !occurrenceId) return;
  try {
    const schedule = getSchedule(controllerHome, job.repoId, scheduleId);
    const occurrence = getOccurrence(controllerHome, job.repoId, occurrenceId);
    if (occurrence && !['succeeded', 'failed', 'shadowed', 'skipped'].includes(occurrence.status)) {
      saveOccurrence(controllerHome, {
        ...occurrence,
        status: outcome,
        decision: 'execute',
        reason,
      });
    }
    const failed = outcome === 'failed';
    const nextFailures = failed ? schedule.consecutiveFailures + 1 : 0;
    const shouldPause = failed && nextFailures >= schedule.policy.maxFailures;
    const backoffBase = Math.max(1, schedule.policy.backoffBaseMinutes ?? schedule.policy.cooldownMinutes ?? 1);
    const backoffMax = Math.max(backoffBase, schedule.policy.backoffMaxMinutes ?? 24 * 60);
    const backoffMinutes = failed ? Math.min(backoffMax, backoffBase * (2 ** Math.max(0, nextFailures - 1))) : 0;
    saveSchedule(controllerHome, {
      ...schedule,
      consecutiveFailures: nextFailures,
      nextEligibleAt: failed ? new Date(Date.now() + backoffMinutes * 60_000).toISOString() : undefined,
      enabled: shouldPause ? false : schedule.enabled,
      pausedReason: shouldPause ? 'Maximum consecutive failures reached.' : undefined,
    });
  } catch {
    // Job terminal state remains authoritative even if an old schedule record
    // has already been removed. Reconciliation must not be blocked by it.
  }
}
