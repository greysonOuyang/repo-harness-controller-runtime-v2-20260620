import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { ensureControllerHome } from '../../cli/repositories/controller-home';
import { withControllerLock } from '../../cli/repositories/locks';
import { readJsonFile, writeJsonAtomic } from '../shared/json-files';

export interface ControllerDaemonStatus {
  schemaVersion: 1;
  status: 'starting' | 'ready' | 'failed' | 'stopped' | 'unavailable';
  pid?: number;
  startedAt?: string;
  stoppedAt?: string;
  error?: string;
  gatewaySeparated?: boolean;
  workerIsolation?: boolean;
}

function daemonPidPath(controllerHome: string): string { return join(ensureControllerHome(controllerHome), 'daemon', 'controller.pid'); }
function daemonStatePath(controllerHome: string): string { return join(ensureControllerHome(controllerHome), 'daemon', 'state.json'); }
function pidAlive(pid: number | undefined): boolean {
  if (!pid || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function readControllerDaemonStatus(controllerHome: string): ControllerDaemonStatus {
  const home = ensureControllerHome(controllerHome);
  const state = readJsonFile<ControllerDaemonStatus>(daemonStatePath(home), { schemaVersion: 1, status: 'unavailable' });
  let pid = state.pid;
  try { pid = Number(readFileSync(daemonPidPath(home), 'utf8').trim()) || pid; } catch { /* no pid */ }
  if ((state.status === 'ready' || state.status === 'starting') && !pidAlive(pid)) return { ...state, status: 'stopped', pid };
  return { ...state, pid };
}

export function ensureControllerDaemon(controllerHome: string): ControllerDaemonStatus {
  const home = ensureControllerHome(controllerHome);
  return withControllerLock(home, { scope: 'global' }, 'ensure-controller-daemon', () => {
    const current = readControllerDaemonStatus(home);
    if ((current.status === 'ready' || current.status === 'starting') && pidAlive(current.pid)) return current;
    const entry = fileURLToPath(new URL('./daemon-entry.ts', import.meta.url));
    const bun = Boolean(process.versions.bun);
    const loader = fileURLToPath(new URL('../shared/node-ts-loader.mjs', import.meta.url));
    const args = bun
      ? [entry, '--controller-home', home]
      : ['--loader', loader, entry, '--controller-home', home];
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    const starting: ControllerDaemonStatus = {
      schemaVersion: 1,
      status: 'starting',
      pid: child.pid,
      startedAt: new Date().toISOString(),
      gatewaySeparated: true,
      workerIsolation: true,
    };
    // Persist the spawn intent before releasing the global lock. Concurrent
    // Gateway requests will observe this PID instead of starting another daemon.
    writeJsonAtomic(daemonStatePath(home), starting);
    if (child.pid) writeFileSync(daemonPidPath(home), `${child.pid}\n`, 'utf8');
    child.once('error', (error) => {
      writeJsonAtomic(daemonStatePath(home), { ...starting, status: 'failed', error: error.message });
    });
    child.unref();
    return starting;
  }, 10_000);
}

export function controllerDaemonPidExists(controllerHome: string): boolean {
  return existsSync(daemonPidPath(controllerHome));
}
