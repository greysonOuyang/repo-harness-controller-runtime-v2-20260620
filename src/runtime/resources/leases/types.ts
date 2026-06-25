import type { ResourceClaimMode } from '../../execution/jobs/types';

export interface ExecutionLease {
  schemaVersion: 1;
  leaseId: string;
  repoId: string;
  resourceKey: string;
  mode: ResourceClaimMode;
  ownerJobId: string;
  fencingToken: number;
  acquiredAt: string;
  expiresAt: string;
  heartbeatAt: string;
}

export interface LeaseAcquisitionResult {
  acquired: boolean;
  leases: ExecutionLease[];
  blockers: Array<{ resourceKey: string; ownerJobId: string; leaseId: string; mode: ResourceClaimMode }>;
}
