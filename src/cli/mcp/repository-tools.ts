import { bindRepositoryEntities } from '../repositories/entity-migration';
import { executeRepositoryCommand, executeRepositoryCommandAsync } from '../repositories/command-executor';
import { withControllerLock, withControllerLockAsync } from '../repositories/locks';
import {
  disableRepository,
  getRepository,
  listRepositories,
  refreshRepository,
  registerRepository,
  removeRepository,
  repositorySummary,
  resolveRepositorySelection,
  updateRepository,
  validateRepository,
} from '../repositories/registry';
import { buildControllerWorkbench } from '../repositories/workbench';
import type { McpToolDefinition } from './tools';

export interface RepositoryToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

function definition(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
  destructiveHint = false,
): McpToolDefinition {
  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint },
  };
}

const repoId = { type: 'string', description: 'Stable Repository Registry repoId.' };

export const repositoryToolDefinitions: McpToolDefinition[] = [
  definition('repository_register', 'Register a Git repository with the Controller.', {
    path: { type: 'string' },
    display_name: { type: 'string' },
    remote_url: { type: 'string' },
    default_branch: { type: 'string' },
  }, ['path']),
  definition('repository_list', 'List registered repositories.', {
    include_removed: { type: 'boolean' },
  }),
  definition('repository_get', 'Inspect one registered repository.', {
    repo_id: repoId,
    include_removed: { type: 'boolean' },
  }, ['repo_id']),
  definition('repository_validate', 'Validate repository identity and migrate legacy ownership.', {
    repo_id: repoId,
  }, ['repo_id']),
  definition('repository_refresh', 'Refresh repository Git and checkout metadata.', {
    repo_id: repoId,
  }, ['repo_id']),
  definition('repository_update', 'Update mutable repository metadata.', {
    repo_id: repoId,
    display_name: { type: 'string' },
    default_branch: { type: 'string' },
    enabled: { type: 'boolean' },
  }, ['repo_id']),
  definition('repository_disable', 'Disable new execution while retaining audit history.', {
    repo_id: repoId,
  }, ['repo_id']),
  definition('repository_remove', 'Soft-remove a repository while retaining audit history.', {
    repo_id: repoId,
  }, ['repo_id'], true),
  definition('repository_workbench', 'Return global or repository-filtered Workbench state.', {
    repo_id: repoId,
    include_removed: { type: 'boolean' },
  }),
  definition('repository_command_preview', 'Preview one repository-scoped local command with classification, approval token, and Git snapshots.', {
    repo_id: repoId,
    checkout_id: { type: 'string', description: 'Optional checkout identity for repositories with multiple local clones.' },
    command: { type: 'string', description: 'Repository-local shell command to classify and preview.' },
    cwd: { type: 'string', description: 'Optional repository-relative working directory.' },
  }, ['command']),
  definition('repository_command_execute', 'Execute one repository-scoped local command after replaying the exact approved preview token.', {
    repo_id: repoId,
    checkout_id: { type: 'string', description: 'Optional checkout identity for repositories with multiple local clones.' },
    command: { type: 'string', description: 'Repository-local shell command to execute.' },
    cwd: { type: 'string', description: 'Optional repository-relative working directory.' },
    approval_token: { type: 'string', description: 'Exact approval token returned by repository_command_preview.' },
    timeout_ms: { type: 'number', description: 'Optional execution timeout in milliseconds.' },
    max_output_bytes: { type: 'number', description: 'Optional cap for captured stdout/stderr.' },
  }, ['command', 'approval_token']),
];

export const repositoryToolNames = repositoryToolDefinitions.map((tool) => tool.name);

function result(value: Record<string, unknown>): RepositoryToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function failure(error: unknown): RepositoryToolResult {
  const message = error instanceof Error ? error.message : String(error);
  const code = message.includes(':') ? message.slice(0, message.indexOf(':')) : 'REPOSITORY_TOOL_FAILED';
  return { ...result({ error: { code, message } }), isError: true };
}

export async function callRepositoryTool(
  controllerHome: string,
  name: string,
  args: Record<string, unknown>,
): Promise<RepositoryToolResult | undefined> {
  if (!name.startsWith('repository_')) return undefined;
  try {
    const repoIdValue = typeof args.repo_id === 'string' ? args.repo_id.trim() : '';
    switch (name) {
      case 'repository_register': {
        const repository = registerRepository({
          path: String(args.path ?? ''),
          controllerHome,
          displayName: typeof args.display_name === 'string' ? args.display_name : undefined,
          remoteUrl: typeof args.remote_url === 'string' ? args.remote_url : undefined,
          defaultBranch: typeof args.default_branch === 'string' ? args.default_branch : undefined,
        });
        return result({ repository, migration: bindRepositoryEntities(repository) });
      }
      case 'repository_list':
        return result({ repositories: listRepositories(controllerHome, { includeRemoved: args.include_removed === true }).map(repositorySummary) });
      case 'repository_get':
        return result({ repository: getRepository(repoIdValue, controllerHome, { includeRemoved: args.include_removed === true }) });
      case 'repository_validate': {
        const repository = getRepository(repoIdValue, controllerHome, { includeRemoved: true });
        return result({ validation: validateRepository(repoIdValue, controllerHome), migration: bindRepositoryEntities(repository) });
      }
      case 'repository_refresh': {
        const repository = refreshRepository(repoIdValue, controllerHome);
        return result({ repository, migration: bindRepositoryEntities(repository) });
      }
      case 'repository_update':
        return result({ repository: updateRepository(repoIdValue, {
          displayName: typeof args.display_name === 'string' ? args.display_name : undefined,
          defaultBranch: typeof args.default_branch === 'string' ? args.default_branch : undefined,
          enabled: typeof args.enabled === 'boolean' ? args.enabled : undefined,
        }, controllerHome) });
      case 'repository_disable':
        return result({ repository: disableRepository(repoIdValue, controllerHome) });
      case 'repository_remove':
        return result({ repository: removeRepository(repoIdValue, controllerHome) });
      case 'repository_workbench':
        return result({ workbench: buildControllerWorkbench(controllerHome, {
          repoId: repoIdValue || undefined,
          includeRemoved: args.include_removed === true,
        }) });
      case 'repository_command_preview': {
        const repository = resolveRepositorySelection({
          repoId: repoIdValue || undefined,
          checkoutId: typeof args.checkout_id === 'string' ? args.checkout_id : undefined,
          controllerHome,
          allowSoleRepository: true,
        });
        const execution = withControllerLock(
          controllerHome,
          { scope: 'repository', repoId: repository.repoId },
          'mcp:repository_command_preview',
          () => executeRepositoryCommand(controllerHome, repository, {
            command: String(args.command ?? ''),
            cwd: typeof args.cwd === 'string' ? args.cwd : undefined,
            dryRun: true,
          }),
          60_000,
        );
        return result(execution as unknown as Record<string, unknown>);
      }
      case 'repository_command_execute': {
        const repository = resolveRepositorySelection({
          repoId: repoIdValue || undefined,
          checkoutId: typeof args.checkout_id === 'string' ? args.checkout_id : undefined,
          controllerHome,
          allowSoleRepository: true,
        });
        const timeoutMs = typeof args.timeout_ms === 'number'
          ? args.timeout_ms
          : typeof args.timeout_ms === 'string'
            ? Number(args.timeout_ms)
            : undefined;
        const maxOutputBytes = typeof args.max_output_bytes === 'number'
          ? args.max_output_bytes
          : typeof args.max_output_bytes === 'string'
            ? Number(args.max_output_bytes)
            : undefined;
        const waitMs = Math.min(Math.max(Math.trunc(timeoutMs ?? 120_000) + 30_000, 60_000), 960_000);
        const execution = await withControllerLockAsync(
          controllerHome,
          { scope: 'repository', repoId: repository.repoId },
          'mcp:repository_command_execute',
          () => executeRepositoryCommandAsync(controllerHome, repository, {
            command: String(args.command ?? ''),
            cwd: typeof args.cwd === 'string' ? args.cwd : undefined,
            authorization: 'confirmed_plan',
            approvalToken: typeof args.approval_token === 'string' ? args.approval_token : undefined,
            timeoutMs,
            maxOutputBytes,
          }),
          waitMs,
        );
        return result(execution as unknown as Record<string, unknown>);
      }
      default:
        return failure(new Error(`UNKNOWN_REPOSITORY_TOOL: ${name}`));
    }
  } catch (error) {
    return failure(error);
  }
}
