import { createHash, randomUUID } from 'crypto';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { repositoryControllerRoot } from '../../cli/repositories/controller-home';
import { writeJsonAtomic } from '../shared/json-files';
import type { ExecutionJob } from '../execution/jobs/types';

export interface ExecutionEvidence {
  schemaVersion: 1;
  evidenceId: string;
  repoId: string;
  checkoutId?: string;
  jobId: string;
  revision: string;
  operation: string;
  environmentFingerprint: string;
  executedAt: string;
  outcome: 'succeeded' | 'failed';
  details?: Record<string, unknown>;
}

function gitRevision(repoRoot: string): string {
  const result = spawnSync('git', ['-C', repoRoot, 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8', timeout: 5_000 });
  return result.status === 0 ? result.stdout.trim() : 'unversioned';
}

function environmentFingerprint(): string {
  return createHash('sha256').update(JSON.stringify({
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    bun: process.versions.bun ?? null,
  })).digest('hex').slice(0, 24);
}

export function recordExecutionEvidence(
  controllerHome: string,
  repoRoot: string,
  job: ExecutionJob,
  outcome: 'succeeded' | 'failed',
  details?: Record<string, unknown>,
): ExecutionEvidence {
  const evidence: ExecutionEvidence = {
    schemaVersion: 1,
    evidenceId: `EVD-${Date.now()}-${randomUUID().slice(0, 8)}`,
    repoId: job.repoId,
    checkoutId: job.checkoutId,
    jobId: job.jobId,
    revision: gitRevision(repoRoot),
    operation: job.payload.operation,
    environmentFingerprint: environmentFingerprint(),
    executedAt: new Date().toISOString(),
    outcome,
    details,
  };
  writeJsonAtomic(join(repositoryControllerRoot(controllerHome, job.repoId), 'evidence', `${evidence.evidenceId}.json`), evidence);
  return evidence;
}
