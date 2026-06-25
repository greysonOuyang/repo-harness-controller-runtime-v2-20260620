import { createHash, randomUUID } from 'crypto';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { ensureControllerHome } from '../../../cli/repositories/controller-home';
import { withControllerLock } from '../../../cli/repositories/locks';
import { readJsonFile, writeJsonAtomic } from '../../shared/json-files';
import { appendRuntimeEvent } from '../../evidence/event-ledger';
import type { PortfolioWorkflow } from './types';

interface PortfolioIndexEntry {
  workflowId: string;
  status: PortfolioWorkflow['status'];
  createdAt: string;
  updatedAt: string;
}


interface PortfolioRequestRecord {
  schemaVersion: 1;
  requestId: string;
  semanticKey: string;
  workflowId: string;
  createdAt: string;
}

interface PortfolioIndex {
  schemaVersion: 1;
  updatedAt: string;
  active: PortfolioIndexEntry[];
  recent: PortfolioIndexEntry[];
}

function portfolioRoot(controllerHome: string): string {
  return join(ensureControllerHome(controllerHome), 'portfolio');
}
function root(controllerHome: string): string { return join(portfolioRoot(controllerHome), 'workflows'); }
function path(controllerHome: string, workflowId: string): string { return join(root(controllerHome), `${workflowId}.json`); }
function indexPath(controllerHome: string): string { return join(portfolioRoot(controllerHome), 'indexes', 'workflows.json'); }
function requestPath(controllerHome: string, requestId: string): string { return join(portfolioRoot(controllerHome), 'indexes', 'requests', `${createHash('sha256').update(requestId).digest('hex')}.json`); }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}
function semanticKey(input: Omit<PortfolioWorkflow, 'schemaVersion' | 'revision' | 'workflowId' | 'createdAt' | 'updatedAt' | 'status'>): string {
  return createHash('sha256').update(JSON.stringify(canonical({ name: input.name, failurePolicy: input.failurePolicy, steps: input.steps }))).digest('hex');
}
function emptyIndex(): PortfolioIndex {
  return { schemaVersion: 1, updatedAt: new Date().toISOString(), active: [], recent: [] };
}
function readIndex(controllerHome: string): PortfolioIndex {
  return readJsonFile<PortfolioIndex>(indexPath(controllerHome), emptyIndex());
}
function activeStatus(status: PortfolioWorkflow['status']): boolean {
  return status === 'active' || status === 'compensating';
}
function upsertIndexUnlocked(controllerHome: string, workflow: PortfolioWorkflow): void {
  const index = readIndex(controllerHome);
  const entry: PortfolioIndexEntry = {
    workflowId: workflow.workflowId,
    status: workflow.status,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
  };
  index.active = index.active.filter((candidate) => candidate.workflowId !== workflow.workflowId);
  index.recent = index.recent.filter((candidate) => candidate.workflowId !== workflow.workflowId);
  if (activeStatus(workflow.status)) index.active.push(entry);
  index.recent.push(entry);
  index.active.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  index.recent.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  index.active = index.active.slice(-5000);
  index.recent = index.recent.slice(0, 5000);
  index.updatedAt = new Date().toISOString();
  writeJsonAtomic(indexPath(controllerHome), index);
}
function readIndexedWorkflows(controllerHome: string, entries: PortfolioIndexEntry[], limit: number): PortfolioWorkflow[] {
  return entries.slice(0, limit).flatMap((entry) => {
    const candidate = path(controllerHome, entry.workflowId);
    if (!existsSync(candidate)) return [];
    try { return [readJsonFile<PortfolioWorkflow>(candidate)]; } catch { return []; }
  });
}
function backfillIndex(controllerHome: string, workflows: PortfolioWorkflow[]): void {
  if (workflows.length === 0) return;
  withControllerLock(controllerHome, { scope: 'global' }, 'portfolio-index-backfill', () => {
    for (const workflow of workflows) upsertIndexUnlocked(controllerHome, workflow);
  }, 10_000);
}

export function createPortfolioWorkflow(
  controllerHome: string,
  input: Omit<PortfolioWorkflow, 'schemaVersion' | 'revision' | 'workflowId' | 'createdAt' | 'updatedAt' | 'status'>,
): PortfolioWorkflow {
  const requestId = input.requestId.trim();
  if (!requestId) throw new Error('PORTFOLIO_REQUEST_ID_REQUIRED');
  const inputSemanticKey = semanticKey(input);
  const ids = new Set(input.steps.map((step) => step.stepId));
  if (ids.size !== input.steps.length) throw new Error('PORTFOLIO_STEP_DUPLICATE: stepId values must be unique');
  for (const step of input.steps) {
    for (const dependency of step.dependsOn) if (!ids.has(dependency)) throw new Error(`PORTFOLIO_DEPENDENCY_UNKNOWN: ${dependency}`);
  }
  const dependencies = new Map(input.steps.map((step) => [step.stepId, step.dependsOn]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (stepId: string): void => {
    if (visiting.has(stepId)) throw new Error(`PORTFOLIO_DEPENDENCY_CYCLE: ${stepId}`);
    if (visited.has(stepId)) return;
    visiting.add(stepId);
    for (const dependency of dependencies.get(stepId) ?? []) visit(dependency);
    visiting.delete(stepId);
    visited.add(stepId);
  };
  for (const stepId of ids) visit(stepId);
  return withControllerLock(controllerHome, { scope: 'global' }, `create-portfolio:${requestId}`, () => {
    const recordPath = requestPath(controllerHome, requestId);
    if (existsSync(recordPath)) {
      const record = readJsonFile<PortfolioRequestRecord>(recordPath);
      if (record.semanticKey !== inputSemanticKey) throw new Error(`PORTFOLIO_REQUEST_ID_CONFLICT: ${requestId}`);
      return getPortfolioWorkflow(controllerHome, record.workflowId);
    }
    const timestamp = new Date().toISOString();
    const workflow: PortfolioWorkflow = {
      ...input,
      requestId,
      schemaVersion: 1,
      revision: 1,
      workflowId: `PFW-${Date.now()}-${randomUUID().slice(0, 8)}`,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    writeJsonAtomic(path(controllerHome, workflow.workflowId), workflow);
    writeJsonAtomic(recordPath, { schemaVersion: 1, requestId, semanticKey: inputSemanticKey, workflowId: workflow.workflowId, createdAt: timestamp } satisfies PortfolioRequestRecord);
    upsertIndexUnlocked(controllerHome, workflow);
    for (const repoId of new Set(workflow.steps.map((step) => step.repoId))) {
      appendRuntimeEvent(controllerHome, { repoId, entityType: 'portfolio', entityId: workflow.workflowId, eventType: 'portfolio_created', requestId, revision: workflow.revision, data: { name: workflow.name, failurePolicy: workflow.failurePolicy } });
    }
    return workflow;
  }, 10_000);
}

export function savePortfolioWorkflow(controllerHome: string, workflow: PortfolioWorkflow): PortfolioWorkflow {
  return withControllerLock(controllerHome, { scope: 'global' }, `save-portfolio:${workflow.workflowId}`, () => {
    const current = getPortfolioWorkflow(controllerHome, workflow.workflowId);
    const next = { ...workflow, revision: current.revision + 1, updatedAt: new Date().toISOString() };
    writeJsonAtomic(path(controllerHome, workflow.workflowId), next);
    upsertIndexUnlocked(controllerHome, next);
    for (const repoId of new Set(next.steps.map((step) => step.repoId))) {
      appendRuntimeEvent(controllerHome, { repoId, entityType: 'portfolio', entityId: next.workflowId, eventType: `portfolio_${next.status}`, requestId: next.requestId, revision: next.revision, data: { status: next.status } });
    }
    return next;
  }, 10_000);
}

export function getPortfolioWorkflow(controllerHome: string, workflowId: string): PortfolioWorkflow {
  const workflow = readJsonFile<PortfolioWorkflow>(path(controllerHome, workflowId));
  return { ...workflow, revision: Number.isFinite(workflow.revision) ? workflow.revision : 1 };
}

export function listActivePortfolioWorkflows(controllerHome: string): PortfolioWorkflow[] {
  const indexed = readIndexedWorkflows(controllerHome, readIndex(controllerHome).active, 5000)
    .filter((workflow) => activeStatus(workflow.status));
  if (indexed.length > 0) return indexed;
  const legacy = listLegacyPortfolioWorkflows(controllerHome, 5000).filter((workflow) => activeStatus(workflow.status));
  backfillIndex(controllerHome, legacy);
  return legacy;
}

function listLegacyPortfolioWorkflows(controllerHome: string, limit: number): PortfolioWorkflow[] {
  try {
    return readdirSync(root(controllerHome)).filter((name) => name.endsWith('.json'))
      .map((name) => readJsonFile<PortfolioWorkflow>(join(root(controllerHome), name)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  } catch { return []; }
}

export function listPortfolioWorkflows(controllerHome: string, limit = 100): PortfolioWorkflow[] {
  const bounded = Math.max(1, Math.min(limit, 1000));
  const indexed = readIndexedWorkflows(controllerHome, readIndex(controllerHome).recent, bounded);
  if (indexed.length > 0) return indexed;
  const legacy = listLegacyPortfolioWorkflows(controllerHome, bounded);
  backfillIndex(controllerHome, legacy);
  return legacy;
}
