import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { randomUUID } from 'crypto';

export function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

export function readJsonFile<T>(path: string, fallback?: T): T {
  const hasFallback = arguments.length >= 2;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (error) {
    if (hasFallback) return fallback as T;
    throw error;
  }
}

export function writeJsonAtomic(path: string, value: unknown): void {
  ensureParent(path);
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporary, path);
}

export function appendJsonLine(path: string, value: unknown): void {
  ensureParent(path);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, 'a');
    writeFileSync(descriptor, `${JSON.stringify(value)}\n`, 'utf8');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function removeFile(path: string): void {
  rmSync(path, { force: true });
}

export function sanitizeFileComponent(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}
