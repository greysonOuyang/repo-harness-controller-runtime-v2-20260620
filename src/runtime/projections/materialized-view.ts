import { join } from 'path';
import { listActiveExecutionJobs, listExecutionJobs } from '../execution/jobs/store';
import type { ExecutionJob } from '../execution/jobs/types';
import { listActiveLeases } from '../resources/leases/store';
import { readJsonFile, writeJsonAtomic } from '../shared/json-files';
import { repositoryControllerRoot } from '../../cli/repositories/controller-home';
import { clearRepositoryProjectionDirty, readRepositoryProjectionDirty, repositoryProjectionIsDirty } from './invalidation';

export interface RepositoryRuntimeProjection {
  schemaVersion: 1;
  repoId: string;
  generatedAt: string;
  revision: number;
  releaseFrozen: boolean;
  activeJobs: Array<Pick<ExecutionJob, 'jobId' | 'type' | 'status' | 'priority' | 'updatedAt' | 'workerPid'>>;
  queueDepth: number;
  runningWorkers: number;
  activeLeases: number;
  attention: Array<{ jobId: string; status: string; message?: string }>;
}

function projectionPath(controllerHome: string, repoId: string): string {
  return join(repositoryControllerRoot(controllerHome, repoId), 'projections', 'runtime.json');
}

export function rebuildRepositoryProjection(controllerHome: string, repoId: string): RepositoryRuntimeProjection {
  const dirtyMarker = readRepositoryProjectionDirty(controllerHome, repoId);
  const previous = readJsonFile<RepositoryRuntimeProjection | undefined>(projectionPath(controllerHome, repoId), undefined);
  const activeJobs = listActiveExecutionJobs(controllerHome, repoId);
  const leases = listActiveLeases(controllerHome, repoId);
  const attentionJobs = listExecutionJobs(controllerHome, repoId, 100)
    .filter((job) => ['orphaned', 'human_attention_required', 'stale'].includes(job.status));
  const projection: RepositoryRuntimeProjection = {
    schemaVersion: 1,
    repoId,
    generatedAt: new Date().toISOString(),
    revision: (previous?.revision ?? 0) + 1,
    releaseFrozen: leases.some((lease) => lease.resourceKey.startsWith('release:')),
    activeJobs: activeJobs.map((job) => ({
      jobId: job.jobId,
      type: job.type,
      status: job.status,
      priority: job.priority,
      updatedAt: job.updatedAt,
      workerPid: job.workerPid,
    })),
    queueDepth: activeJobs.filter((job) => job.status !== 'running' && job.status !== 'dispatched').length,
    runningWorkers: activeJobs.filter((job) => job.status === 'running').length,
    activeLeases: leases.length,
    attention: attentionJobs
      .map((job) => ({ jobId: job.jobId, status: job.status, message: job.error?.message })),
  };
  writeJsonAtomic(projectionPath(controllerHome, repoId), projection);
  clearRepositoryProjectionDirty(controllerHome, repoId, dirtyMarker);
  return projection;
}

export function readRepositoryProjection(controllerHome: string, repoId: string): RepositoryRuntimeProjection {
  if (repositoryProjectionIsDirty(controllerHome, repoId)) return rebuildRepositoryProjection(controllerHome, repoId);
  try { return readJsonFile<RepositoryRuntimeProjection>(projectionPath(controllerHome, repoId)); }
  catch { return rebuildRepositoryProjection(controllerHome, repoId); }
}
