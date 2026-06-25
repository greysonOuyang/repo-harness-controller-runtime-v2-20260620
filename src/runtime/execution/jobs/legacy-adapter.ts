import { ensureControllerHome } from '../../../cli/repositories/controller-home';
import { registerRepository } from '../../../cli/repositories/registry';
import type { LocalBridgeJob } from '../../../cli/local-bridge/types';
import { ensureControllerDaemon } from '../../control-plane/daemon-client';
import { createExecutionJob } from './store';
import type { ResourceClaimSpec } from './types';

function requestId(job: LocalBridgeJob): string {
  const payload = job.payload as { requestId?: string };
  return payload.requestId?.trim() || `legacy-local-job:${job.jobId}`;
}

function claims(job: LocalBridgeJob, repoId: string, checkoutId: string): ResourceClaimSpec[] {
  if (job.action === 'run-check' || job.action === 'verify-edit-session') return [{ resourceKey: `heavy-check:${repoId}`, mode: 'exclusive' }];
  if (job.action === 'repository-command') return [
    { resourceKey: `workspace:${checkoutId}`, mode: 'write' },
    { resourceKey: `git-refs:${repoId}`, mode: 'exclusive' },
  ];
  return [{ resourceKey: `workspace:${checkoutId}`, mode: 'write' }];
}

export function dispatchLegacyLocalJob(repoRoot: string, legacyJob: LocalBridgeJob) {
  const controllerHome = ensureControllerHome(
    legacyJob.action === 'repository-command' && 'controllerHome' in legacyJob.payload
      ? String(legacyJob.payload.controllerHome)
      : undefined,
  );
  const repository = registerRepository({ path: repoRoot, controllerHome });
  const created = createExecutionJob(controllerHome, {
    repoId: repository.repoId,
    checkoutId: repository.activeCheckoutId,
    type: legacyJob.action === 'run-check'
      ? 'check'
      : legacyJob.action === 'verify-edit-session'
        ? 'verify-edit'
        : legacyJob.action === 'repository-command'
          ? 'repository-command'
          : 'dispatch-task',
    requestId: requestId(legacyJob),
    semanticKey: `legacy-local-job:${repository.repoId}:${legacyJob.jobId}`,
    priority: legacyJob.action === 'run-check' || legacyJob.action === 'verify-edit-session' ? 'P0' : 'P1',
    origin: { surface: 'local-ui', actor: legacyJob.requestedBy, causationId: legacyJob.jobId },
    payload: {
      operation: 'legacy-local-job',
      target: 'runtime',
      arguments: { localJobId: legacyJob.jobId },
      timeoutMs: 'timeoutMs' in legacyJob.payload && typeof legacyJob.payload.timeoutMs === 'number' ? legacyJob.payload.timeoutMs : undefined,
    },
    resourceClaims: claims(legacyJob, repository.repoId, repository.activeCheckoutId),
    maxAttempts: 2,
  });
  const daemon = ensureControllerDaemon(controllerHome);
  return { controllerHome, repository, executionJob: created.job, deduplicated: created.deduplicated, daemon };
}
