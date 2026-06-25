import type { ResourceClaimSpec } from '../../execution/jobs/types';

const REPO_STATE_TOOLS = new Set([
  'create_issue', 'update_issue', 'plan_issue', 'append_task', 'split_task', 'supersede_task',
  'set_task_dependencies', 'update_task', 'record_task_verification', 'accept_verified_task',
  'write_prd', 'write_prd_from_idea', 'write_sprint', 'write_checklist_sprint', 'write_plan',
  'record_candidate_finding',
]);
const CHECK_TOOLS = new Set(['run_check', 'verify_edit_session']);
const INTEGRATION_TOOLS = new Set(['integrate_task_run']);
const REMOTE_TOOLS = new Set(['publish_issue_to_github', 'refresh_github_issue', 'close_github_issue', 'configure_github_plugin']);
const AGENT_TOOLS = new Set(['dispatch_task', 'launch_issue', 'dispatch_ready_tasks', 'retry_task_run', 'quick_agent_session']);

function operationPaths(args: Record<string, unknown>): string[] {
  const paths = new Set<string>();
  const allowed = args.allowed_paths;
  if (Array.isArray(allowed)) for (const value of allowed) if (typeof value === 'string' && value.trim()) paths.add(value.trim());
  const operations = args.operations;
  if (Array.isArray(operations)) {
    for (const operation of operations) {
      if (operation && typeof operation === 'object') {
        const path = (operation as Record<string, unknown>).path;
        if (typeof path === 'string' && path.trim()) paths.add(path.trim());
      }
    }
  }
  const path = args.path;
  if (typeof path === 'string' && path.trim()) paths.add(path.trim());
  return [...paths];
}

function isolatedWorktreeKey(args: Record<string, unknown>): string {
  const identity = String(args.task_id ?? args.issue_id ?? args.request_id ?? 'isolated').replace(/[^a-zA-Z0-9._-]+/g, '-');
  return identity || 'isolated';
}

export function claimsForMcpOperation(name: string, args: Record<string, unknown>, repoId: string, checkoutId?: string): ResourceClaimSpec[] {
  if (REPO_STATE_TOOLS.has(name)) return [{ resourceKey: 'repo-state', mode: 'write' }];
  if (CHECK_TOOLS.has(name)) return [{ resourceKey: `heavy-check:${repoId}`, mode: 'exclusive' }];
  if (INTEGRATION_TOOLS.has(name)) return [
    { resourceKey: `integration:${repoId}`, mode: 'exclusive' },
    { resourceKey: `workspace:${checkoutId ?? 'active'}`, mode: 'write' },
    { resourceKey: `git-refs:${repoId}`, mode: 'exclusive' },
  ];
  if (REMOTE_TOOLS.has(name)) return [{ resourceKey: `remote:${repoId}`, mode: 'exclusive' }];
  if (AGENT_TOOLS.has(name)) {
    if (args.agent === 'github-copilot') return [{ resourceKey: `remote:${repoId}`, mode: 'exclusive' }];
    if (args.isolate === true) return [{ resourceKey: `worktree:${isolatedWorktreeKey(args)}`, mode: 'write' }];
    return [{ resourceKey: `workspace:${checkoutId ?? 'active'}`, mode: 'write' }];
  }
  const paths = operationPaths(args);
  if (paths.length > 0) return paths.map((path) => ({ resourceKey: `path:${path}`, mode: 'write' }));
  return [{ resourceKey: 'repo-content:*', mode: 'write' }];
}
