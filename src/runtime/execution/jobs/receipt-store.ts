import { existsSync } from 'fs';
import { join } from 'path';
import { repositoryControllerRoot } from '../../../cli/repositories/controller-home';
import { readJsonFile, sanitizeFileComponent, writeJsonAtomic } from '../../shared/json-files';
import type { ExecutionJob } from './types';

export interface OperationReceipt {
  schemaVersion: 1;
  jobId: string;
  repoId: string;
  attempt: number;
  state: 'started' | 'completed';
  workerPid: number;
  startedAt: string;
  completedAt?: string;
  outcome?: 'succeeded' | 'failed';
  result?: Record<string, unknown>;
  error?: ExecutionJob['error'];
  evidenceIds?: string[];
}

function receiptPath(controllerHome: string, repoId: string, jobId: string): string {
  return join(repositoryControllerRoot(controllerHome, repoId), 'execution-jobs', 'receipts', `${sanitizeFileComponent(jobId)}.json`);
}

export function readOperationReceipt(controllerHome: string, repoId: string, jobId: string): OperationReceipt | undefined {
  const path = receiptPath(controllerHome, repoId, jobId);
  if (!existsSync(path)) return undefined;
  try { return readJsonFile<OperationReceipt>(path); } catch { return undefined; }
}

export function markOperationStarted(controllerHome: string, job: ExecutionJob, workerPid: number): OperationReceipt {
  const current = readOperationReceipt(controllerHome, job.repoId, job.jobId);
  if (current?.state === 'completed' && current.attempt === job.attempt) return current;
  const receipt: OperationReceipt = {
    schemaVersion: 1,
    jobId: job.jobId,
    repoId: job.repoId,
    attempt: job.attempt,
    state: 'started',
    workerPid,
    startedAt: new Date().toISOString(),
  };
  writeJsonAtomic(receiptPath(controllerHome, job.repoId, job.jobId), receipt);
  return receipt;
}

export function markOperationCompleted(
  controllerHome: string,
  job: ExecutionJob,
  workerPid: number,
  terminal: Pick<OperationReceipt, 'outcome' | 'result' | 'error' | 'evidenceIds'>,
): OperationReceipt {
  const current = readOperationReceipt(controllerHome, job.repoId, job.jobId);
  const receipt: OperationReceipt = {
    schemaVersion: 1,
    jobId: job.jobId,
    repoId: job.repoId,
    attempt: job.attempt,
    state: 'completed',
    workerPid,
    startedAt: current?.attempt === job.attempt ? current.startedAt : new Date().toISOString(),
    completedAt: new Date().toISOString(),
    outcome: terminal.outcome,
    result: terminal.result,
    error: terminal.error,
    evidenceIds: terminal.evidenceIds,
  };
  writeJsonAtomic(receiptPath(controllerHome, job.repoId, job.jobId), receipt);
  return receipt;
}
