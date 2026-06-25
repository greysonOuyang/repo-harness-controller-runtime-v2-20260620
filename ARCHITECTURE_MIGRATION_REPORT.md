# repo-harness 目标架构迁移报告

- 日期：2026-06-25
- 输入：用户提供的完整源码包与目标架构清单
- 目标：在不删除原有能力的前提下，完成 `Thin Gateway + Global Scheduler + Per-Repository Actor + Durable Job + Isolated Worker + Evidence Plane`
- 结果：目标运行时主链已实现；Bun 原生完整测试仍是发布环境门禁

## 1. 进程与职责边界

```text
ChatGPT / Local UI / CLI
  -> Thin MCP Gateway
       鉴权、Schema、仓库路由、轻量投影、持久 Job ACK
  -> Controller Daemon
       全局公平调度、Repo Actor、Schedule、Portfolio、Reconciliation
  -> isolated Worker
       每个进程执行一个有边界 Job
  -> Evidence / Artifact / Event / Projection
```

Gateway 不再等待 Agent、完整 Check、Repository Command、Integration 或发布检查结束。需要执行的调用先写入 `ExecutionJob`，返回 Job ID，再由 Daemon 分派 Worker。

## 2. 统一执行协议

已实现：

- `ExecutionJob` 统一状态机；
- `requestId` 幂等和语义冲突检测；
- active、recent、request 持久索引；
- Job 与 Agent Run 分离；
- deadline、attempt、heartbeat、PID；
- 操作前 Operation Receipt；
- 完成回执恢复；
- 不确定写副作用进入 `human_attention_required`，不盲目重放；
- 大结果转 Artifact；
- 精确 Revision Evidence 与环境指纹。

## 3. Repo Actor、Claim、Lease 与 Fencing

已实现：

- 每个 `repoId` 一个逻辑 Repo Actor；
- Actor 邮箱只处理短事务、资源判断和状态迁移；
- Workspace、Worktree、Path、Git Ref、Heavy Check、Integration、Remote、Release Claim；
- 未知写 Scope 自动收敛为 `repo-content:*`；
- 可续租 Lease 和单调递增 Fencing Token；
- Worker 的 Job ID、Attempt、PID、原始 Lease/Fencing 集合共同构成所有权；
- 旧 Worker 无法续租、释放新 Lease 或覆盖新 Attempt 结果；
- 资源冲突进入明确等待状态，不默认失败。

## 4. 全局调度与多仓库

已实现：

- 全局 Worker 数；
- 活跃仓库数；
- Agent 总量和 Codex/Claude/GitHub provider 配额；
- Heavy Check 配额；
- CPU Load 和可用内存准入；
- P0-P4 优先级与 Aging；
- 仓库公平调度状态持久化；
- Repository A 的等待不会持有 Repository B 的 Actor；
- Portfolio DAG、循环依赖拒绝、停止或 Saga Compensation；
- Remote/Git/GitHub mapping 漂移诊断。

## 5. Schedule 与自治边界

已实现实体：

```text
Schedule -> Trigger -> Occurrence -> Decision -> ExecutionJob -> Outcome
```

已支持：

- interval；
- manual；
- 五段 UTC cron；
- calendar timestamp；
- condition watch；
- repository event；
- dependency checkpoint；
- 确定性窗口和 Event ID 去重；
- 最大 Active Occurrence；
- daily budget；
- cooldown；
- 指数退避；
- 连续失败熔断；
- external blocker、release、human review、dirty workspace 停止；
- 默认 Shadow Mode；
- 一个 Occurrence 最多创建一个执行 Job。

自动巡检不能直接创建 Issue、Task、PRD 或 Plan。它只能记录带 Evidence 和 Semantic Key 的 Candidate Finding；由用户显式 Promote 后才创建 Issue Job。

## 6. 发布与外部副作用

已实现 Release Gate：

- 独占 `release:<repoId>` Lease；
- 工作区 clean；
- 无活跃 Execution Job、Agent Run、Local Job；
- 无 Pending Integration；
- 无未结束 Edit Session；
- 无其他 Lease；
- Active Issue 的 Required Task 已终态；
- Verification 绑定当前 Revision；
- Registry Remote、Git Origin、GitHub Mapping 一致；
- Controller Daemon Ready；
- Package Metadata 有效；
- 输出 release-ready manifest。

Push、Merge、Publish、Production Deploy、历史改写、删除 Remote 工作仍要求用户在同一请求中明确授权。

## 7. 兼容性

没有通过删功能换性能：

- 原 Controller 兼容工具：97 个；
- 原工具 fingerprint：`2f4977857957118e`；
- 新 Runtime Control 工具：17 个；
- 开启 Dev Runner 后总工具：114 个；
- 原 Issue、Task、Run、Edit Session、Verification、Local Job、Repository Registry、Agent Run、Worktree Integration 均保留；
- `src/cli/mcp/tools.ts` 变为稳定 Facade，原实现迁移为 `legacy-tool-service.ts`，由 Worker 调用；
- Worker 最终结果继续包含 `repoId`、repository summary 和 runtimeStorage envelope；
- MCP Agent 允许列表、Runner Timeout 与 Browser 权限随 Job 持久化并在 Worker 恢复。

## 8. 502 与卡顿治理

架构内可控原因已处理：

- Gateway 不再承担长执行；
- Daemon/Worker 进程隔离；
- MCP Session 上限和空闲回收；
- 初始化、单 Session、全局 POST 背压；
- 429/503 明确过载，而非无限排队后由代理返回 502；
- keep-alive/header/request timeout 对齐；
- Snapshot 与 Local UI 状态复用；
- 热路径走 active/recent/request/materialized indexes；
- `repository_workbench` 等复杂聚合查询也进入持久 Job，不再在 Gateway 扫描全部 Issue、Run 和 Worklog；
- `controller_context` 改为即时读取 Materialized Context，并由独立 Worker 异步刷新 Git、Issue、Run 和 Check 信息；
- 日志和 Artifact 有界读取；
- 断连后按 requestId/Job ID 恢复，不靠 HTTP 请求生命期判断执行结果。

外部 Tunnel、Cloudflare、ngrok、ChatGPT 平台或物理网络仍可能返回 502；此类上游故障不能由本地源码保证消失，但现在可通过 `/health`、`/ready`、仓库健康和 Job 状态区分。

## 9. Plans 与文档治理

`plans/` 保留为业务意图、PRD、Sprint 和实现计划事实源，不是运行时队列。历史 Plan 不参与 Gateway、Scheduler、Health 或 Job 查询热路径。已完成迁移计划进入 `plans/archive/`，未知旧 Plan 不伪造完成。

`docs/architecture/current/` 是唯一 Runtime Authority。V4-V8 等旧文档保留为 Historical Design，不再覆盖当前架构。

批准的中文目标原文保存在 `docs/architecture/current/approved-target-architecture.zh-CN.md`，逐项落实证据保存在 `target-requirements-traceability.md`。

## 10. 验证

已执行：

- TypeScript：`src + scripts + tests`；
- Runtime Architecture Gate；
- 97 个兼容工具与 fingerprint；
- Operation Receipt、模糊副作用恢复；
- 僵尸 Worker Fencing；
- Candidate Finding 去重和自动需求拦截；
- Portfolio Cycle 拒绝；
- Schedule 全 Trigger、Decision、幂等和 Backoff；
- Scheduler → Repo Actor → Worker → Evidence 真实进程烟测；
- Gateway `/health`、`/ready`、Repository Health 真实 HTTP 烟测；
- Shell 语法、严格工作流契约、npm pack、敏感文件和源码 Manifest 门禁。

未执行：当前容器没有 Bun，无法诚实宣称 `bun test` 全量通过。Bun Suite 保留且必须在正式发布环境运行。
