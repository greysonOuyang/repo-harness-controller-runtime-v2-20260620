# Controller Runtime 全量重构与优化报告

- 日期：2026-06-25
- 范围：用户上传的完整源码包
- 兼容基线：repo-harness 1.4.0
- 目标：完整落实用户给定的 Agent Engineering Control Plane 架构

## 最终结论

本轮不是简单清理或 502 补丁，而是完成了运行时所有权迁移：Gateway 只接入和持久化，Controller Daemon 负责调度，Repo Actor 负责单仓库决策，Worker 独立执行，Evidence/Artifact/Projection 负责观察和验收。

完整能力和逐项映射见 [`ARCHITECTURE_MIGRATION_REPORT.md`](ARCHITECTURE_MIGRATION_REPORT.md)。

## 功能保留

没有删除原有产品能力：

- 原 97 个 Controller 兼容工具名称和 fingerprint 不变；
- 新增 17 个 Runtime Control 工具；
- Issue、Task、Run、Direct Edit、Verification、Local Bridge、Repository Registry、GitHub Mapping、Agent Run 和 Worktree Integration 保留；
- 历史 Plans、PRDs、Sprints、测试和文档保留；
- 原 Local Job ID 和界面契约保留，但执行所有权投影到统一 ExecutionJob；
- 原 MCP 结果中的 repository/runtimeStorage envelope 保留。

## 运行时改造

- 所有可能长时间或产生写入的 MCP 调用先创建 Durable Job；
- Gateway、Daemon、Worker 三种独立进程角色；
- 全局调度配额、公平性和仓库隔离；
- Repo Actor 邮箱、资源 Claim、Lease 与 Fencing；
- Operation Receipt 和不确定副作用保护；
- exact Revision Evidence；
- Schedule/Decision/Occurrence、Portfolio DAG/Saga、Candidate Finding；
- Release Freeze/Gate；
- Materialized Projection 和持久索引；
- `/health`、`/ready`、`/repos/<repoId>/health` 分层健康面。

## 502 与性能

- MCP Context 复用；
- Session 上限、空闲回收和 Transport 清理；
- 初始化、Session、全局 POST 背压；
- 429/503 + Retry-After；
- HTTP timeout 对齐；
- Gateway 不等待 Agent/Check/Command；
- Local UI 共享轮询与 Snapshot 缓存；
- 状态和历史读取有界、索引化；
- 全局 `repository_workbench` 聚合改由独立 Worker 执行；
- `controller_context` 使用非阻塞 Materialized Context，Gateway 不再同步执行 Git 命令；
- Worker 崩溃不影响 Gateway；
- Gateway 重启不取消已接受 Job。

## 源码体积治理

交付包只移除可重建或机器本地内容：

- `node_modules`；
- `.git`；
- `.codegraph`；
- Job、Run、Check、PID、Audit Log 等可重建运行态；
- Token、OAuth 和本机绝对路径配置；
- coverage、日志、备份和临时打包文件。

保留了安全且属于源码契约的 `.ai/context`、`.ai/hooks`、`policy.json`、`workflow-contract.json` 和 `brain-manifest.json`，因此项目自身的严格工作流检查仍可运行。

源码、测试、Scripts、Plans 和 Docs 均未缩减；目标架构新增了 Runtime 模块、Smoke Gates 和当前架构文档。

文件数量对照：

| 类别 | 原包 | 重构包 |
| --- | ---: | ---: |
| `src` | 124 | 163 |
| `tests` | 115 | 116 |
| `scripts` | 74 | 80 |
| `plans` | 70 | 73 |
| `docs` | 128 | 134 |

此外保留 38 个安全的 `.ai` 工作流契约、Context 和 Hook 文件；没有打包历史 Job、Run、Check、日志或认证状态。

## 已通过验证

- strict TypeScript；
- architecture invariant gate；
- MCP compatibility gate；
- recovery/fencing smoke；
- Schedule engine smoke；
- Scheduler/Actor/Worker process smoke；
- MCP HTTP process smoke；
- shell syntax；
- strict workflow contract；
- package dry-run；
- source archive manifest verification。

## 明确限制

当前环境没有 Bun，因此不能声称完整 `bun test` 已执行。正式发布前仍需在 Bun 环境运行 `bun install --frozen-lockfile && bun run check:ci`。

外部 Tunnel 或平台的 502 仍可能发生；本轮解决的是 repo-harness 内部阻塞、会话泄漏、请求堆积、执行耦合和恢复失真，并提供了区分外部故障的健康面。
