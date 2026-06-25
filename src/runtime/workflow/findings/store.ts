import { createHash, randomUUID } from 'crypto';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { repositoryControllerRoot } from '../../../cli/repositories/controller-home';
import { withControllerLock } from '../../../cli/repositories/locks';
import { appendRuntimeEvent } from '../../evidence/event-ledger';
import { readJsonFile, sanitizeFileComponent, writeJsonAtomic } from '../../shared/json-files';
import type { CandidateFinding, RecordCandidateFindingInput } from './types';

interface FindingIndex {
  schemaVersion: 1;
  updatedAt: string;
  candidates: Array<{ findingId: string; semanticKey: string; severity: CandidateFinding['severity']; lastSeenAt: string }>;
  recent: Array<{ findingId: string; semanticKey: string; status: CandidateFinding['status']; lastSeenAt: string }>;
}

function root(controllerHome: string, repoId: string): string {
  return join(repositoryControllerRoot(controllerHome, repoId), 'candidate-findings');
}
function recordPath(controllerHome: string, repoId: string, findingId: string): string {
  return join(root(controllerHome, repoId), 'records', `${sanitizeFileComponent(findingId)}.json`);
}
function semanticPath(controllerHome: string, repoId: string, semanticKey: string): string {
  return join(root(controllerHome, repoId), 'indexes', 'semantic', `${createHash('sha256').update(semanticKey).digest('hex')}.json`);
}
function indexPath(controllerHome: string, repoId: string): string {
  return join(root(controllerHome, repoId), 'indexes', 'findings.json');
}
function emptyIndex(): FindingIndex {
  return { schemaVersion: 1, updatedAt: new Date().toISOString(), candidates: [], recent: [] };
}
function readIndex(controllerHome: string, repoId: string): FindingIndex {
  return readJsonFile<FindingIndex>(indexPath(controllerHome, repoId), emptyIndex());
}
function upsertIndexUnlocked(controllerHome: string, finding: CandidateFinding): void {
  const index = readIndex(controllerHome, finding.repoId);
  index.candidates = index.candidates.filter((entry) => entry.findingId !== finding.findingId);
  index.recent = index.recent.filter((entry) => entry.findingId !== finding.findingId);
  if (finding.status === 'candidate') {
    index.candidates.push({ findingId: finding.findingId, semanticKey: finding.semanticKey, severity: finding.severity, lastSeenAt: finding.lastSeenAt });
  }
  index.recent.push({ findingId: finding.findingId, semanticKey: finding.semanticKey, status: finding.status, lastSeenAt: finding.lastSeenAt });
  index.candidates.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  index.recent.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  index.candidates = index.candidates.slice(0, 5000);
  index.recent = index.recent.slice(0, 5000);
  index.updatedAt = new Date().toISOString();
  writeJsonAtomic(indexPath(controllerHome, finding.repoId), index);
}

export function getCandidateFinding(controllerHome: string, repoId: string, findingId: string): CandidateFinding {
  return readJsonFile<CandidateFinding>(recordPath(controllerHome, repoId, findingId));
}

export function recordCandidateFinding(controllerHome: string, input: RecordCandidateFindingInput): CandidateFinding {
  const semanticKey = input.semanticKey.trim();
  const title = input.title.trim();
  const requestId = input.requestId.trim();
  if (!semanticKey) throw new Error('CANDIDATE_SEMANTIC_KEY_REQUIRED');
  if (!title) throw new Error('CANDIDATE_TITLE_REQUIRED');
  if (!requestId) throw new Error('CANDIDATE_REQUEST_ID_REQUIRED');
  const lockId = createHash('sha256').update(semanticKey).digest('hex').slice(0, 20);
  return withControllerLock(controllerHome, { scope: 'task', repoId: input.repoId, taskId: `candidate-${lockId}` }, `record-candidate:${lockId}`, () => {
    const semanticIndex = semanticPath(controllerHome, input.repoId, semanticKey);
    const timestamp = input.evidence?.observedAt ?? new Date().toISOString();
    let finding: CandidateFinding;
    if (existsSync(semanticIndex)) {
      const reference = readJsonFile<{ findingId: string }>(semanticIndex);
      const current = getCandidateFinding(controllerHome, input.repoId, reference.findingId);
      const evidence = input.evidence
        ? [...current.evidence, { ...input.evidence, observedAt: timestamp }].slice(-100)
        : current.evidence;
      finding = {
        ...current,
        revision: current.revision + 1,
        title,
        summary: input.summary ?? current.summary,
        severity: input.severity ?? current.severity,
        status: current.status === 'dismissed' ? 'candidate' : current.status,
        observationCount: current.observationCount + 1,
        evidence,
        lastSeenAt: timestamp,
        dismissedReason: current.status === 'dismissed' ? undefined : current.dismissedReason,
      };
    } else {
      finding = {
        schemaVersion: 1,
        revision: 1,
        findingId: `FIND-${Date.now()}-${randomUUID().slice(0, 8)}`,
        repoId: input.repoId,
        semanticKey,
        title,
        summary: input.summary,
        severity: input.severity ?? 'medium',
        status: 'candidate',
        observationCount: 1,
        evidence: input.evidence ? [{ ...input.evidence, observedAt: timestamp }] : [],
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
      };
      writeJsonAtomic(semanticIndex, { semanticKey, findingId: finding.findingId, createdAt: timestamp });
    }
    writeJsonAtomic(recordPath(controllerHome, finding.repoId, finding.findingId), finding);
    upsertIndexUnlocked(controllerHome, finding);
    appendRuntimeEvent(controllerHome, {
      repoId: finding.repoId,
      entityType: 'candidate-finding',
      entityId: finding.findingId,
      eventType: finding.observationCount === 1 ? 'candidate_finding_created' : 'candidate_finding_observed',
      requestId,
      revision: finding.revision,
      data: { semanticKey, observationCount: finding.observationCount, severity: finding.severity },
    });
    return finding;
  }, 10_000);
}

export function updateCandidateFinding(
  controllerHome: string,
  repoId: string,
  findingId: string,
  updater: (current: CandidateFinding) => CandidateFinding,
  requestId: string,
  eventType: string,
): CandidateFinding {
  return withControllerLock(controllerHome, { scope: 'task', repoId, taskId: `candidate-${findingId}` }, `update-candidate:${findingId}`, () => {
    const current = getCandidateFinding(controllerHome, repoId, findingId);
    const next = updater(structuredClone(current));
    if (next.findingId !== current.findingId || next.repoId !== current.repoId || next.semanticKey !== current.semanticKey) {
      throw new Error('CANDIDATE_IDENTITY_IMMUTABLE');
    }
    next.revision = current.revision + 1;
    next.lastSeenAt = new Date().toISOString();
    writeJsonAtomic(recordPath(controllerHome, repoId, findingId), next);
    upsertIndexUnlocked(controllerHome, next);
    appendRuntimeEvent(controllerHome, {
      repoId,
      entityType: 'candidate-finding',
      entityId: findingId,
      eventType,
      requestId,
      revision: next.revision,
      data: { status: next.status, promotedJobId: next.promotedJobId },
    });
    return next;
  }, 10_000);
}

export function listCandidateFindings(controllerHome: string, repoId: string, options: { includeTerminal?: boolean; limit?: number } = {}): CandidateFinding[] {
  const bounded = Math.max(1, Math.min(options.limit ?? 100, 1000));
  const index = readIndex(controllerHome, repoId);
  const entries = options.includeTerminal ? index.recent : index.candidates;
  const indexed = entries.slice(0, bounded).flatMap((entry) => {
    try { return [getCandidateFinding(controllerHome, repoId, entry.findingId)]; } catch { return []; }
  });
  if (indexed.length > 0) return indexed;
  try {
    return readdirSync(join(root(controllerHome, repoId), 'records'))
      .filter((name) => name.endsWith('.json'))
      .map((name) => readJsonFile<CandidateFinding>(join(root(controllerHome, repoId), 'records', name)))
      .filter((finding) => options.includeTerminal || finding.status === 'candidate')
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
      .slice(0, bounded);
  } catch { return []; }
}
