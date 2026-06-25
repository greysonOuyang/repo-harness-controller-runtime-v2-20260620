export type CandidateFindingStatus = 'candidate' | 'promoted' | 'dismissed';

export interface CandidateFindingEvidence {
  source: string;
  reference?: string;
  observedAt: string;
  details?: Record<string, unknown>;
}

export interface CandidateFinding {
  schemaVersion: 1;
  revision: number;
  findingId: string;
  repoId: string;
  semanticKey: string;
  title: string;
  summary?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: CandidateFindingStatus;
  observationCount: number;
  evidence: CandidateFindingEvidence[];
  firstSeenAt: string;
  lastSeenAt: string;
  promotedJobId?: string;
  dismissedReason?: string;
}

export interface RecordCandidateFindingInput {
  repoId: string;
  semanticKey: string;
  title: string;
  summary?: string;
  severity?: CandidateFinding['severity'];
  evidence?: Omit<CandidateFindingEvidence, 'observedAt'> & { observedAt?: string };
  requestId: string;
}
