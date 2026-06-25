import type { ResourceClaimSpec } from '../../execution/jobs/types';
import type { ExecutionLease } from '../leases/types';

function pathValue(key: string): string | undefined {
  return key.startsWith('path:') ? key.slice('path:'.length).replace(/^\.\//, '') : undefined;
}

function pathOverlaps(left: string, right: string): boolean {
  const a = left.replace(/\*\*?$/, '').replace(/\/$/, '');
  const b = right.replace(/\*\*?$/, '').replace(/\/$/, '');
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function resourceKeysOverlap(left: string, right: string): boolean {
  if (left === right) return true;
  if (left === 'repo-content:*' && (right === 'repo-content:*' || right.startsWith('path:') || right.startsWith('workspace:'))) return true;
  if (right === 'repo-content:*' && (left.startsWith('path:') || left.startsWith('workspace:'))) return true;
  const leftPath = pathValue(left);
  const rightPath = pathValue(right);
  return leftPath !== undefined && rightPath !== undefined && pathOverlaps(leftPath, rightPath);
}

export function claimsConflict(claim: ResourceClaimSpec, lease: ExecutionLease): boolean {
  const claimRelease = claim.resourceKey.startsWith('release:');
  const leaseRelease = lease.resourceKey.startsWith('release:');
  if (claimRelease || leaseRelease) {
    if (claimRelease && leaseRelease) return true;
    // Release Freeze blocks mutations and external effects but intentionally
    // allows read-only observation and Schedule triage to remain available.
    const nonReleaseMode = claimRelease ? lease.mode : claim.mode;
    return nonReleaseMode !== 'read';
  }
  if (!resourceKeysOverlap(claim.resourceKey, lease.resourceKey)) return false;
  return claim.mode !== 'read' || lease.mode !== 'read';
}

export function normalizeClaims(claims: ResourceClaimSpec[], options: { readOnly?: boolean } = {}): ResourceClaimSpec[] {
  if (claims.length === 0) {
    return options.readOnly ? [] : [{ resourceKey: 'repo-content:*', mode: 'write' }];
  }
  const map = new Map<string, ResourceClaimSpec>();
  for (const claim of claims) {
    const key = claim.resourceKey.trim();
    if (!key) continue;
    const existing = map.get(key);
    if (!existing || existing.mode === 'read' && claim.mode !== 'read' || existing.mode === 'write' && claim.mode === 'exclusive') {
      map.set(key, { ...claim, resourceKey: key });
    }
  }
  return [...map.values()];
}
