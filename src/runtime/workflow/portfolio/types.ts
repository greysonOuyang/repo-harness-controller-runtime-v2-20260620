import type { ExecutionJobPriority, ResourceClaimSpec } from '../../execution/jobs/types';

export interface PortfolioStep {
  stepId: string;
  repoId: string;
  operation: string;
  arguments?: Record<string, unknown>;
  dependsOn: string[];
  priority: ExecutionJobPriority;
  resourceClaims: ResourceClaimSpec[];
  compensation?: { operation: string; arguments?: Record<string, unknown> };
  status: 'pending' | 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'compensating' | 'compensated';
  jobId?: string;
  compensationJobId?: string;
  error?: string;
}

export interface PortfolioWorkflow {
  schemaVersion: 1;
  revision: number;
  workflowId: string;
  name: string;
  status: 'active' | 'succeeded' | 'failed' | 'compensating' | 'compensated' | 'paused';
  failurePolicy: 'stop' | 'compensate';
  steps: PortfolioStep[];
  createdAt: string;
  updatedAt: string;
  requestId: string;
}
