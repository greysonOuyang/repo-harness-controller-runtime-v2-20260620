import { Command } from 'commander';
import { ensureControllerHome } from '../repositories/controller-home';
import { ensureControllerDaemon, readControllerDaemonStatus } from '../../runtime/control-plane/daemon-client';
import { findExecutionJob, listActiveExecutionJobs, listExecutionJobs } from '../../runtime/execution/jobs/store';
import { readJobEvents } from '../../runtime/evidence/event-ledger';
import { listRepositories } from '../repositories/registry';
import { rebuildRepositoryProjection } from '../../runtime/projections/materialized-view';
import { listOccurrences, listSchedules } from '../../runtime/workflow/schedules/store';

function output(value: unknown, json = true): void {
  console.log(json ? JSON.stringify(value, null, 2) : String(value));
}

export function buildRuntimeCommand(): Command {
  const command = new Command('runtime').description('Manage the separated Gateway, Controller Daemon, durable Jobs, Repo Actors, and Workers');

  command.command('start')
    .description('Start the Controller Daemon if it is not already running')
    .option('--controller-home <path>', 'Controller state root')
    .action((opts: { controllerHome?: string }) => output(ensureControllerDaemon(ensureControllerHome(opts.controllerHome))));

  command.command('status')
    .description('Show daemon readiness, active durable Jobs, and per-repository materialized projections')
    .option('--controller-home <path>', 'Controller state root')
    .action((opts: { controllerHome?: string }) => {
      const home = ensureControllerHome(opts.controllerHome);
      const repositories = listRepositories(home, { includeRemoved: true });
      output({
        daemon: readControllerDaemonStatus(home),
        activeJobs: listActiveExecutionJobs(home),
        repositories: repositories.map((repository) => rebuildRepositoryProjection(home, repository.repoId)),
      });
    });

  command.command('stop')
    .description('Stop the Controller Daemon; running Workers retain durable Job state for reconciliation')
    .option('--controller-home <path>', 'Controller state root')
    .action((opts: { controllerHome?: string }) => {
      const home = ensureControllerHome(opts.controllerHome);
      const status = readControllerDaemonStatus(home);
      if (!status.pid) return output({ stopped: false, reason: 'daemon is not running', status });
      process.kill(status.pid, 'SIGTERM');
      output({ stopped: true, pid: status.pid });
    });

  command.command('job')
    .description('Inspect one durable Execution Job and its event ledger')
    .argument('<job-id>', 'Execution Job ID')
    .option('--controller-home <path>', 'Controller state root')
    .action((jobId: string, opts: { controllerHome?: string }) => {
      const home = ensureControllerHome(opts.controllerHome);
      const job = findExecutionJob(home, jobId);
      if (!job) throw new Error(`JOB_NOT_FOUND: ${jobId}`);
      output({ job, events: readJobEvents(home, job.repoId, job.jobId) });
    });

  command.command('jobs')
    .description('List durable Execution Jobs')
    .option('--controller-home <path>', 'Controller state root')
    .option('--repo-id <id>', 'Repository id')
    .option('--limit <count>', 'Maximum records', '100')
    .action((opts: { controllerHome?: string; repoId?: string; limit?: string }) => {
      const home = ensureControllerHome(opts.controllerHome);
      if (opts.repoId) return output({ jobs: listExecutionJobs(home, opts.repoId, Number(opts.limit ?? 100)) });
      output({ jobs: listActiveExecutionJobs(home) });
    });

  command.command('schedules')
    .description('List bounded Schedules and Occurrences')
    .requiredOption('--repo-id <id>', 'Repository id')
    .option('--controller-home <path>', 'Controller state root')
    .action((opts: { controllerHome?: string; repoId: string }) => {
      const home = ensureControllerHome(opts.controllerHome);
      output({ schedules: listSchedules(home, opts.repoId), occurrences: listOccurrences(home, opts.repoId, undefined, 100) });
    });

  return command;
}
