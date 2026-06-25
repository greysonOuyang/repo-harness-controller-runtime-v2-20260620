---
id: "ISS-20260624-6732EE"
kind: "bug"
status: "planned"
updated_at: "2026-06-24T13:54:27.575Z"
source: "repo-harness-controller-v8"
---

# 修复 Controller 重连崩溃与执行链路性能瓶颈

修复 ChatGPT Connector/Controller 频繁重连或挂掉、Local Bridge run-check 僵尸状态与超时失效、历史 Job 全量扫描和重型检查重复并发，并减少状态接口负载和日常任务编排开销。实施时优先使用 bounded Direct Edit，不启动 Agent。

## Goals

- Controller/Connector 在大状态量和历史任务存在时保持稳定，不因单次状态查询产生 502 或频繁重连
- run-check 超时、进程中断和 Controller 重启后能可靠收口，不遗留永久 running Job
- 相同仓库的相同重型检查可去重，避免重复并发竞争
- Local Bridge 状态查询只读取必要的最近/活跃任务，避免全量历史读写
- 为常用状态接口提供更紧凑的默认响应并保留按需详细读取能力
- 补充针对重启恢复、超时、僵尸任务、查询上限和检查去重的回归测试

## Non-goals

- 本轮不重写整个 MCP transport 或替换 Connector 协议
- 本轮不启动 Codex、Claude 或 Copilot Agent
- 本轮不处理当前开源治理 Issue T8 的破坏性 Git 清理

## Acceptance Criteria

- [ ] Controller 重启后过期或无存活执行依据的 running run-check Job 自动转为 failed/timed_out/orphaned 终态
- [ ] run-check 达到配置超时后不会长期保持 running，并记录明确错误与 finishedAt
- [ ] Local Bridge 状态查询不会为了返回最近 25 条而刷新全部历史 Job
- [ ] 相同 checkId 和相同代码 Revision 已有运行中任务时不会再次启动重复检查
- [ ] Connector 常用状态响应大小显著受控，重复心跳或大历史列表不会默认返回
- [ ] 相关专项测试和类型检查通过

## GitHub

- Not published.

## Tasks

### T1 — 修复 Controller 重连与启动恢复

- Status: `done`
- Objective: 检查 MCP keepalive、runtime state 和 Local Controller 生命周期；修复异常退出、重启后运行状态失真及容易导致 Connector 502/重连的恢复路径。
- Depends on: none
- Allowed paths: `src/cli/mcp/**`, `src/cli/local-bridge/**`, `tests/cli/mcp-*.test.ts`, `tests/cli/local-bridge*.test.ts`
- Checks: `package:check:type`
- Execution hint: selected at runtime

### T2 — 修复 run-check 超时、僵尸任务与重复执行

- Status: `done`
- Objective: 为 Local Bridge run-check 增加可恢复的 deadline/状态收口、孤儿检测、同 Revision 同 Check 去重和仓库级重型检查并发保护。
- Depends on: `T1`
- Allowed paths: `src/cli/local-bridge/**`, `src/cli/controller/check-runner.ts`, `src/cli/controller/**`, `tests/cli/local-bridge*.test.ts`, `tests/cli/controller*.test.ts`
- Checks: `package:check:type`
- Execution hint: selected at runtime

### T3 — 优化状态查询与 Connector 响应负载

- Status: `ready`
- Objective: 让 Local Bridge Job 列表先限量再读取/刷新，活跃与历史状态分离，并压缩 project_snapshot、local_bridge_status 和事件读取的默认数据量。
- Depends on: `T2`
- Allowed paths: `src/cli/local-bridge/**`, `src/cli/mcp/tools.ts`, `tests/cli/mcp-controller.test.ts`, `tests/cli/local-bridge*.test.ts`, `docs/**`
- Checks: `package:check:type`
- Execution hint: selected at runtime

### T4 — 完善 Direct Edit First 与分层验证策略

- Status: `planned`
- Objective: 收紧工具路由和验证提示，使小中型改动默认 search + Direct Edit + targeted checks，完整 release gate 仅在最终发布阶段执行，并补充文档和回归断言。
- Depends on: `T3`
- Allowed paths: `src/cli/mcp/**`, `src/cli/controller/**`, `tests/cli/**`, `docs/**`
- Checks: `package:check:type`, `package:check:controller-v8`
- Execution hint: selected at runtime

### T5 — 恢复公开包元数据并清理空编辑会话

- Status: `ready`
- Objective: 移除误加的 package.json private 标记，保持公开 npm 包契约；关闭或回滚没有任何变更的遗留 Direct Edit 会话，恢复干净且可验证的工作区。
- Depends on: none
- Allowed paths: `package.json`, `tests/bootstrap-files.test.ts`, `.ai/harness/edit-sessions/**`
- Checks: `package:check:type`
- Execution hint: selected at runtime

### T6 — 稳定仓库身份与远程映射

- Status: `planned`
- Objective: 修复 repository refresh 在同一路径 remote 变化时生成重复 repoId 的问题；保持既有 repoId、Issue、Run 和 Edit Session 绑定稳定，并让 Registry remote、实际 Git origin 与 GitHub 插件映射能够明确校验和安全更新。
- Depends on: none
- Allowed paths: `src/cli/repository-registry/**`, `src/cli/controller/**`, `src/cli/mcp/**`, `tests/cli/**`, `docs/**`
- Checks: `package:check:type`, `package:check:controller-v8`
- Execution hint: selected at runtime

### T7 — 执行最终回归并准备 MCP 重启

- Status: `planned`
- Objective: 在全部修复集成后执行分层回归，确认 Controller、MCP、Local Bridge、仓库身份和公开包契约均通过；输出可重启状态，重启后再次进行健康检查。
- Depends on: `T4`, `T6`
- Allowed paths: `tests/**`, `scripts/**`, `docs/**`, `tasks/reports/**`
- Checks: `package:check:type`, `package:check:controller-v8`, `package:check:release-surface`
- Execution hint: selected at runtime

### T8 — 原子化 Agent 运行结果持久化

- Status: `ready`
- Objective: 修复 Agent worker 写入 result/meta JSON 时被 Controller 并发读取导致 Unexpected EOF 的竞态；统一使用原子替换或可恢复读取，并补充高频轮询回归测试。
- Depends on: `T1`
- Allowed paths: `src/cli/agent-jobs/**`, `tests/cli/local-bridge.test.ts`, `tests/cli/mcp-controller.test.ts`
- Checks: `package:check:type`
- Execution hint: selected at runtime

### T9 — 修复并发调度规则

- Status: `planned`
- Objective: 修复重型检查并发和本地 Run 工作区选择的跨进程竞态。
- Depends on: `T2`
- Allowed paths: `src/cli/controller/check-runner.ts`, `src/cli/agent-jobs/**`, `tests/cli/**`
- Checks: `package:check:type`, `package:check:controller-v8`
- Execution hint: selected at runtime

## Related Artifacts

- `src/cli/local-bridge/job-store.ts`
- `src/cli/mcp/tools.ts`
- `src/cli/mcp/keepalive.ts`
- `src/cli/controller/check-runner.ts`
- `tests/cli/local-bridge.test.ts`
- `tests/cli/mcp-controller.test.ts`
