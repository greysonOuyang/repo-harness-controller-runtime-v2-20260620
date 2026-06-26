#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v bun >/dev/null 2>&1 || {
  echo "Bun is required to manage the repo-harness Controller stack." >&2
  exit 127
}

if [ "$#" -eq 0 ]; then
  echo "Usage: scripts/controller-runtime.sh <start|stop|status|restart|logs> [args...]" >&2
  exit 2
fi

exec bun "$ROOT/src/cli/index.ts" controller service "$@"
