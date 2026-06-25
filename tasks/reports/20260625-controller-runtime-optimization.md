# Controller Runtime 全量优化与兼容性审计

- Date: 2026-06-25
- Scope: uploaded portable source archive
- Compatibility baseline: `repo-harness` 1.4.0 public source and MCP tool surface
- Result: implementation complete; release remains in review until the Bun-native full suite is run in a Bun environment

## Delivery invariant

本轮没有通过删除功能来换取体积或性能。以下内容全部保留：

- `src/` 124 个源码文件；
- `tests/` 115 个测试文件；
- `plans/` 70 个计划文件；
- 原有 Issue、Task、Run、Edit Session、Verification、repository registry 与 MCP 工具模型；
- 历史架构文档和任务记录，仅增加 Historical Design / Runtime Authority 边界，不做破坏性删除。

从交付包排除的仅是可重建依赖、缓存、Git 元数据、机器本地运行态和凭据文件，不属于产品功能。

## Runtime and 502-related changes

### MCP HTTP runtime

- 所有会话复用同一 Controller tool context，不再在重连时重复注册仓库、扫描状态和构造完整上下文。
- 会话最多保留 64 个，空闲 15 分钟回收，并定时清理断开的 transport。
- 初始化并发限制为 8；单会话 active POST 限制为 4；全局 active POST 限制为 32。
- 过载时返回明确的 `429` 或 `503` 以及 `Retry-After`，避免请求无限堆积后由上游表现为 502。
- MCP request body 限制为 1 MB；HTTP keep-alive、headers timeout 与 request timeout 已对齐。
- `/health` 暴露会话、初始化、active POST 和过载拒绝计数，便于区分本地 Controller 问题和 tunnel/proxy 问题。
- 关闭服务时会释放 transport、清理会话和定时器。

### Local Bridge and dashboard

- 多个浏览器客户端共享一套状态轮询，不再每个 SSE 连接重复计算完整状态签名。
- Snapshot 使用短时缓存，减少频繁页面刷新导致的重复全量计算。
- Agent Job 和 Edit Session 列表先按 ID 限量，再读取 JSON，避免“只看最近 25 条却解析全部历史”。
- Local Job 继续使用 active index，检查去重不再依赖历史窗口扫描。
- Local HTTP server 同样配置 keep-alive、headers timeout、request timeout，并在关闭时释放 SSE 客户端和 interval。

### Checks, cancellation and evidence

- 相同 repository revision + check + timeout 的检查复用同一执行。
- 共享检查使用独立 subscriber；取消一个 Local Job 不会杀死仍被其他 Job 使用的同一检查。
- 最后一个 subscriber 在排队阶段取消时，不再无意义地启动进程；已启动时终止完整进程组。
- 检查执行期间代码发生变化时，完成 Revision 会与开始 Revision 比较；结果强制标记为 stale、不可缓存复用，并要求重新执行。
- 超时后先 SIGTERM、再 SIGKILL，stdout/stderr 有明确上限并经过敏感信息处理。
- 自动 Worktree 集成失败不再误报 `succeeded`，Run 保持 `waiting_for_user` 并保留 Worktree 供人工处理。

### Repository identity

- repoId 与 canonical root/remote 的稳定身份模型保持不变。
- Git origin、Registry canonical remote 和 GitHub plugin mapping 不一致时返回明确 warning，不静默重绑已有 Issue、Run 或 Edit Session。

### MCP compatibility and response cost

- 保留 `verify_task` 原有顶层字段、嵌套 `issue` 兼容字段以及 Local Jobs/Task Runs 的原默认数量。
- 响应成本优化放在底层：历史 ID 先限量再读取、共享 context、Snapshot 缓存、会话清理和并发背压，不通过删字段或缩小默认结果破坏调用方。
- 没有删除 MCP 工具、Issue/Task 状态或工作流实体。

## Architecture optimization

- `docs/architecture/current/` 被明确设为唯一 Controller Runtime Authority。
- 新增 `implementation-status.md`，逐项区分 Implemented、Partial 和 Target only，避免把目标架构写成已完成实现。
- 当前文档覆盖 Thin Gateway、Global Scheduler、Per-Repository Actor、Durable Job、Isolated Worker、Evidence Plane、冲突策略、Schedule、恢复、验证和发布门。
- `migration-roadmap.md` 按真实实现状态更新；尚未实现的 Repo Actor mailbox、durable lease/fencing、global fair scheduler 和 Schedule Engine 被保留为迁移项，没有伪装为本轮已完成。
- 架构一致性门会校验 current 文档集合、Runtime Authority 标记、历史文档标记和关键不变量。
- 架构队列脚本增加 Node fallback；没有 Bun 时仍可执行 dependency-independent 的文档一致性检查。

## Documentation optimization

- README 中英文版增加当前架构事实源、实现状态和 502/性能排障入口。
- 新增 `docs/operations/controller-performance-and-502.md`，包含健康指标、诊断顺序、过载语义和安全清理范围。
- 旧 V4-V8、Controller 和 Local Bridge 文档继续保留用于审计，但不再与当前架构争夺权威性。
- `tasks/current.md`、相关 Issue/Task 状态和本报告已按实际完成情况收口。
- 公共 npm 文件清单包含当前架构和运维文档。

## Source archive and security cleanup

交付包不包含：

- `node_modules/`；
- `.git/`；
- `.codegraph/`；
- `.ai/`、`_ops/` 和其他本机运行状态；
- MCP bearer token、OAuth passphrase/token、runtime state 和带本机绝对路径的 local config；
- coverage、日志、临时 tarball、系统元数据。

这些内容均可重新生成，移除不会缩减功能。个人本机绝对路径已从保留的历史文本和测试夹具中泛化。

## Validation evidence

| Check | Result |
| --- | --- |
| Strict TypeScript over `src`, `scripts`, `tests` | Passed |
| Architecture synchronization gate (`mode=off`) | Passed |
| Shell syntax for all `scripts/*.sh` | Passed |
| Runtime smoke: stale Revision evidence | Passed |
| Runtime smoke: shared-check cancellation | Passed |
| Runtime smoke: repository remote drift | Passed |
| Runtime smoke: Local Bridge health and authenticated snapshot | Passed |
| Runtime smoke: MCP HTTP startup, initialize, SSE stream accounting and health counters | Passed |
| Sensitive runtime/config file scan | Passed after cleanup |
| Source/test/plan file-count compatibility check | Passed; no reductions |
| Original vs optimized MCP tool surface | Passed; 86 tools, identical fingerprint `2f4977857957118e` |
| npm pack dry-run | Passed; 8,165,844-byte package, required architecture/operations docs included, local MCP runtime files excluded |

## Explicit limitations

- 当前执行环境没有 Bun，因此无法诚实声明 `bun test` 全量测试已运行；完整 Bun suite 和 release gate 仍需在发布环境执行。
- 本地运行时已经处理会导致阻塞、资源增长和代理超时的主要结构性原因，但外部 Cloudflare/tunnel、网络中断或上游平台故障仍可能产生 502，代码不能保证第三方链路永不返回 502。
- 上传包不含 `.git`，无法在本轮验证或清理真实 local/remote branch、tag、Worktree 和提交拓扑；相关治理任务继续保留为受限项，而不是伪造完成。
