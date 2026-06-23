# T2 审计报告：开源许可、来源与敏感信息

日期：2026-06-23
范围：当前隔离 worktree 的已跟踪内容；本报告只基于工作树现状和可读历史/文档证据，不修改产品代码。

## 结论

当前仓库 **不适合直接公开发布**。根因不是许可证缺失，而是提交面仍包含明显的 maintainer/runtime 痕迹：

1. 已跟踪的 controller/runtime 状态文件与符号链接暴露本机内部路径和 repo/controller 标识。
2. 已跟踪日志、检查产物、handoff 文档暴露本机目录、局域端口、Cloudflare quick tunnel URL、Connector ID 和工作分支信息。
3. `plans/**`、`tasks/**`、`docs/researches/**` 中保留了大量个人绝对路径、用户名、内部工作区名和历史实验痕迹。
4. 即使清理当前树，如果直接沿用现有完整 Git 历史公开，历史提交仍大概率保留这些私有痕迹；需要清历史或走新的公开分支/新仓初始化路径。

## 许可与来源结论

### 必须保留的原作者版权与许可

- 根 `LICENSE` 为 MIT，且与 `upstream/main:LICENSE` 一致，当前文本保留了 `Copyright (c) 2026 AncientTwo`。
- 公开发布的衍生项目必须继续包含该 MIT 许可文本，不能删除或替换 AncientTwo 的版权与许可声明。
- 只要仓库中仍包含来自 `Ancienttwo/repo-harness` 的实质性代码/文档，分发时必须保留这份 MIT notice。

证据：

- `LICENSE:1-21`
- `git remote -v` 显示 `upstream = https://github.com/Ancienttwo/repo-harness.git`
- `git show upstream/main:LICENSE`

### 项目自有修改可采用的归属表达

可接受的归属方式是“保留上游 MIT + 增加本项目修改归属”，而不是替换上游归属。推荐表达：

- `This project is derived from Ancienttwo/repo-harness and includes modifications by Greyson Ouyang and contributors.`
- 如需写入许可头，可在保留 `Copyright (c) 2026 AncientTwo` 的前提下，追加：
  `Copyright (c) 2026 Greyson Ouyang and contributors`

不建议：

- 把根 `LICENSE` 改写成只剩本项目版权。
- 在 README/品牌文案里隐去衍生来源，让外部误判为完全原创项目。

## 凭据与敏感信息扫描结论

### 凭据扫描结果

未发现明显的真实凭据、私钥或 access token 泄漏。正则命中仅有两类非阻断样例：

- `src/cli/mcp/redaction.ts` 中的私钥/Token 脱敏规则实现。
- `tests/cli/mcp-policy.test.ts` 中的测试夹具样例值，如 `sk-...` 和 `-----BEGIN PRIVATE KEY-----`。

这两处属于测试/脱敏逻辑证据，不应作为真实泄漏处理。

### 需要区分的“正常公开路径”与“异常私有路径”

以下 home-scope 路径在本项目中多为产品文档或运行时约定，**本身不构成泄漏**：

- `~/.codex/hooks.json`
- `~/.claude/settings.json`
- `~/.repo-harness/...`
- `~/.agents/...`

这些路径是公开安装/部署文档的一部分，可以保留。

真正的阻断项是：

- 带个人用户名或机器目录的绝对路径，如 `/Users/greyson/...`、`/Users/ancienttwo/...`、`/Users/chris/...`、`/Users/kito/...`
- 暴露内部 controller 存储根、工作树名称、实验分支名、临时 quick tunnel URL、维护者本地 npm/prefix 路径、私有 source checkout 路径的历史文档或运行产物

## 阻断项

### P0. 已跟踪 controller/runtime 状态与符号链接不应公开

证据：

- `.ai/harness/repository.json:1-5`
  - 暴露 `repoId` 与 `checkoutId`，如 `repo_123b7cf58b6b17b5cbe46a56`
- `.ai/harness/` 下多个条目是已跟踪符号链接，直接指向 maintainer 本机 controller 存储：
  - `.ai/harness/artifacts -> /Users/greyson/.repo-harness/controller/repositories/...`
  - `.ai/harness/controller -> /Users/greyson/.repo-harness/controller/repositories/...`
  - `.ai/harness/edit-sessions -> /Users/greyson/.repo-harness/controller/repositories/...`
  - `.ai/harness/ephemeral-issues -> /Users/greyson/.repo-harness/controller/repositories/...`
  - `.ai/harness/jobs -> /Users/greyson/.repo-harness/controller/repositories/...`
  - `.ai/harness/local-bridge -> /Users/greyson/.repo-harness/controller/repositories/...`
  - `.ai/harness/worktrees -> /Users/greyson/.repo-harness/controller/repositories/...`

影响：

- 泄露 maintainer 本机路径结构与 controller 内部存储布局。
- 公开 clone 后这些符号链接对外部用户无意义，且会制造损坏/不可复现状态。
- 说明当前仓库仍混有运行时状态面，而不是纯产品源码面。

处理建议：

- 这些运行时状态与 symlink 统一移出提交面，仅保留 `.gitkeep` 或明确的模板/README。
- 若它们属于产品设计的一部分，改为文档化 schema/目录说明，而不是跟踪本机实例。

### P0. 已跟踪日志、检查产物和 handoff 文档泄露运行环境

证据：

- `.ai/local/logs/repo-harness-mcp.log:1-30`
  - 暴露本机仓库路径、局域端口、quick tunnel URL、Cloudflare connector metadata、本地运行模式
- `.ai/harness/handoff/mcp-e2e-result.md:1-49`
  - 暴露 `/Users/ancienttwo/Projects/agentic-dev-wt-mcp-connector`
  - 暴露实验分支 `codex/repo-harness-mcp-connector`
  - 暴露本机服务端口和 E2E 操作细节
- `.ai/harness/checks/controller/latest-package-test.json`
- `.ai/harness/checks/controller/latest-package-check-type.json`
- `.ai/harness/checks/controller/latest-package-check-controller-v8.json`
  - 保存了带绝对路径的 stderr/stdout 与失败栈信息
- `.ai/harness/mcp/audit.log`
  - 虽然只记录 hash 而非原始 payload，但它仍是运行期审计日志，不应默认公开

影响：

- 公开了维护者本机运行拓扑、实验 tunnel 地址、失败输出、工作节奏和内部控制面细节。
- 部分 quick tunnel URL 虽然可能已失效，但其公开本身没有产品价值，只有额外暴露面。

处理建议：

- 这些文件应全部移出提交面，改为忽略的本地运行证据。
- 对需要保留的“验证已做过”信息，只保留人工整理后的稳定摘要，不保留原始 runtime log。

### P0. 文档/计划/归档里存在大量个人绝对路径与用户名

统计：

- 命中绝对路径文件数：`50`
- 命中 `~/.codex|~/.claude|~/.agents|~/.repo-harness` 文件数：`141`

其中后者大部分是公开产品路径，不自动构成问题；前者大量是私有路径泄露。

明确证据样本：

- `docs/researches/20260612-legacy-research-notes.md:491-495`
  - `/Users/chris/Projects/agentic-dev`
  - `/Users/chris/.claude/skills/...`
  - `/Users/chris/.codex/source-migration-backups/...`
- `docs/researches/20260612-legacy-research-notes.md:561-586`
  - `/Users/kito/.local/bin/codegraph`
  - `/Users/kito/.hermes/node/bin/codegraph`
- `tasks/notes/codex-hook-adapter.notes.md:11-16`
  - `/Users/ancienttwo/Projects/agentic-dev/.codex/hooks.json:*`
- `plans/plan-20260529-0909-astrozi-user-level-hook.md:96-103`
  - `/Users/ancienttwo/Astrozi/...`
  - `/Users/ancienttwo/Projects/agentic-dev/...`
- `plans/prds/20260619-1721-repo-harness-document-governance-cleanup.prd.md:65`
  - `/Users/greyson/DevProjects/repo-harness`

影响：

- 直接暴露维护者身份、工作区命名、历史项目名、个人工具安装方式。
- 说明当前 `plans/`、`tasks/`、`docs/researches/` 中混有大量内部运营/研发过程资产，而不是纯公共文档。

处理建议：

- 公开版应对这些绝对路径做系统替换：
  - 改为 `<repo-root>`、`$HOME/...`、`<maintainer-worktree>`、`<example-path>`
- 若文档本质是内部研究/试验日志，直接移出公共仓库或转存到私有知识库。

### P0. 当前公开方式若保留完整历史，历史提交仍会泄露

证据面：

- 敏感信息不仅在当前文件，还分布于：
  - `tasks/archive/**`
  - `plans/archive/**`
  - `docs/researches/**`
  - `.ai/harness/handoff/**`
  - `.ai/harness/checks/**`

影响：

- 即使只删除当前树文件，公开完整 Git 历史后，外部仍可从历史提交恢复这些内容。

处理建议：

- 不建议直接把当前内部演进仓库完整历史设为 public。
- 更安全的发布路径二选一：
  1. 基于清理后的工作树新建公开仓库或 orphan/public-release 分支；
  2. 使用历史重写工具清理敏感路径与文本后再公开。

## 非阻断但需决策项

### `.repo-harness/plugins/github.json` 是否属于公开产品面

证据：

- `.repo-harness/plugins/github.json:1-6`
  - `repository = "greysonouyang/repo-harness-controller-runtime"`

判断：

- 如果该仓库 slug 就是最终公开仓库，信息本身不敏感。
- 但它位于隐藏配置面 `.repo-harness/`，更像 maintainer-local integration state，而不是稳定产品资产。

建议：

- 发布前明确它是否是“应跟踪的产品配置”。
- 若只是当前 maintainer 的 GitHub 插件开关，移出公共提交面。

## 修复清单

### 发布前必须完成

1. 从提交面移除 `.ai/harness/` 中指向本机 controller 存储的所有 symlink 和实例状态文件。
2. 从提交面移除 `.ai/local/logs/**`、`.ai/harness/mcp/audit.log`、`.ai/harness/checks/controller/latest-package-*.json`、`.ai/harness/handoff/mcp-*.md` 等运行产物。
3. 清洗 `plans/**`、`tasks/**`、`docs/researches/**` 中的个人绝对路径、用户名、内部 repo/worktree 名称。
4. 决定公开历史策略：新 public branch/new repo，或历史重写；不要直接公开现有完整内部历史。
5. 复扫一次 secrets/path/runtime 规则，确认只剩公开产品文档中的通用路径。

### 可随后完成

1. 在 README/NOTICE/发行说明中补充“derived from Ancienttwo/repo-harness”的归属说明。
2. 决策 `.repo-harness/plugins/github.json` 是否保留。
3. 将内部研究/发布 checklist 中仍有价值的内容提炼成稳定公开文档，把操作日志和个人实验记录剥离出去。

## 最终发布判断

结论：**当前状态不可公开。**

阻断原因：

- 许可证可继承，且当前 MIT 链路明确；
- 但公开面仍混入 controller/runtime 状态、运行日志、handoff 证据、个人绝对路径和内部历史资产；
- 若不清理并且不处理历史，公开仓库会暴露 maintainer 本机与内部演进痕迹。

建议发布策略：

- 先做一次“公开面裁剪”，把 repo 收敛成源码、模板、稳定文档和必要测试；
- 再从清理后的树生成新的 public release 基线，而不是直接公开当前完整内部演进历史。
