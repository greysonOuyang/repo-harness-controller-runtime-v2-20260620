# Controller Performance and 502 Troubleshooting

This guide covers slow MCP calls, repeated reconnects, proxy `502` responses and Local Controller UI stalls.

## What a 502 Means

A `502` is normally emitted by the HTTPS tunnel or reverse proxy when it cannot obtain a valid response from the local MCP process. It is not proof that an accepted durable Job failed. Check the Job or Run record before retrying a write operation.

## Runtime Protections

The MCP HTTP runtime now uses:

- one shared Controller context across sessions;
- at most 64 retained MCP sessions;
- 15-minute idle-session expiry that never reclaims an active POST or SSE stream;
- at most 8 simultaneous session initializations;
- at most 4 active POST requests per session and 32 globally;
- `429`/`503` overload responses with `Retry-After`;
- a 1 MB MCP request-body limit;
- 65-second keep-alive and 70-second header timeout;
- periodic transport cleanup during runtime and full cleanup on shutdown.

These limits prevent reconnect storms and long-running clients from causing unbounded memory, file scanning or open-transport growth.

## Health Check

Call `GET /health` on the local MCP endpoint. The response includes:

- tool-surface identity and schema version;
- active and maximum session counts;
- initializing, active POST and active SSE stream counts;
- overload rejection count;
- authentication configuration status.

A growing `rejectedOverload` value means clients are submitting work faster than the Controller can accept it. Retrying with backoff is preferable to increasing every limit.

## Diagnostic Order

1. Confirm the local process answers `/health` directly on `127.0.0.1`.
2. Confirm the public tunnel points to the current local port and protocol.
3. Compare tool-surface headers with the expected Controller profile.
4. Inspect active Jobs and Runs instead of repeating a potentially accepted mutation.
5. Check whether a heavy named check or repository command is already running.
6. Restart only the MCP transport after durable state has been inspected; do not delete `.ai/harness` to recover from a connection problem.

## Slow Local UI

The dashboard uses one shared state poller regardless of browser-tab count. Snapshot requests are reused for a short window, and historical Agent Jobs/Edit Sessions are limited before their JSON files are parsed. If the UI remains slow, inspect exceptionally large Issue files or unbounded event logs rather than deleting workflow state.

## Safe Cleanup

Safe source-distribution exclusions:

- `node_modules/`;
- `.git/` when producing a portable source archive;
- `.codegraph/`;
- `.ai/` runtime state in a clean distribution archive;
- `_ops/`, coverage, logs and temporary package files.

Do not remove source, tests, architecture documents, task history or workflow templates merely to reduce archive size.
