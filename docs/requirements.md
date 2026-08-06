# SpecPilot 项目需求基线

> 状态：Beta 基线
> 适用版本：`0.7.x` 与 Unreleased
> 更新日期：2026-08-05

## 1. 产品定义

SpecPilot 是一个面向 Claude Code 与 Codex 的轻量 AI Coding Harness。它将需求、任务、
决策、评审、验证证据和长期项目知识保存在代码仓库中，让 AI 编码工作具备可恢复、
可评审、可验证和可追溯的上下文。

SpecPilot 不是项目管理平台，也不是通用 Skill 管理器。它的核心价值是：

1. 用文件合同沉淀项目事实和变更历史。
2. 让 Agent 围绕已确认的 Spec 和任务工作。
3. 用可复现的验证证据约束“完成”。
4. 用 CodeGraph 或源码搜索缩小阅读范围。
5. 在 Claude Code 与 Codex 中提供一致的工作流。

## 2. 目标与成功标准

### 2.1 产品目标

- 用户可以从模糊需求开始，形成经确认的 Spec、任务和验收标准。
- 多个 change 可以同时进行，不被单一线性阶段状态机限制。
- Agent 可以在新会话中恢复当前 change/task，而不依赖完整聊天记录。
- 项目规范、术语、决策和已验证知识可以逐步积累并复用。
- 标准任务和显式 TDD 任务都必须留下与当前代码一致的验证证据。
- CodeGraph 不可用时，核心工作流仍可通过源码搜索继续。
- 安装、更新和卸载不得破坏用户已有配置或项目产物。

### 2.2 0.5 Beta 成功标准

- Claude Code 和 Codex 均可完成 light、standard、TDD 三类真实 change。
- CodeGraph 未安装、索引过期或命令失败时，工作流可以安全降级。
- `init`、重复 `init`、`update` 和 `uninstall` 不覆盖或删除非托管文件。
- `finish` 无法绕过任务、Review、TDD 和最终验证门禁。
- npm 包可在 Node.js 20+ 的 Linux、macOS、Windows 环境安装并执行 CLI。

## 3. 用户与主要场景

### 3.1 目标用户

- 使用 Claude Code 或 Codex 开发真实代码库的个人开发者。
- 希望团队约定、架构决策和变更证据与代码共同版本化的团队。
- 希望按需使用 TDD，但不接受全项目强制 TDD 的工程团队。

### 3.2 核心场景

1. 在已有或新项目中初始化 SpecPilot。
2. 扫描代码库，建立经人工确认的初始项目知识。
3. 将一个需求澄清为 light 或 standard change。
4. 按任务实现普通变更或 TDD 垂直切片。
5. 分别检查项目规范符合度和 Spec 实现忠实度。
6. 验证出口条件并关闭 change。
7. 在新会话中恢复尚未完成的工作。
8. 检查环境健康度、更新 runtime 或安全卸载。

## 4. 核心原则

- **仓库文件是真相源**：Markdown、YAML 和 JSON 产物优先于聊天记录。
- **工作流不等于状态机**：change 只记录 `open|closed`，不记录线性 phase。
- **允许并行 change**：项目可存在多个 open change；本地会话只指向一个 active
  change/task。
- **图谱只提供线索**：CodeGraph 结果必须由源码、测试或日志确认。
- **TDD 显式启用**：默认任务为 standard，只有用户明确启用后才使用 TDD。
- **记忆必须可验证**：未经确认的推断、原始会话和图谱输出不能成为长期知识。
- **托管边界明确**：更新与卸载只能触碰 manifest 标记的 SpecPilot runtime。
- **宿主行为一致**：Claude Code 与 Codex runtime 必须由同一套英文源资产投射。

## 5. 功能需求

### 5.1 初始化与生命周期

#### FR-INIT-01 初始化项目

系统必须提供：

```text
specpilot init [path]
  --host claude|codex|all
  --graph codegraph|none
  --context-injection
  --context-max-bytes <bytes>
  --dry-run --yes --json
```

初始化必须：

- 创建项目产物目录、配置和选定宿主的 runtime。
- 默认支持 Claude Code、Codex 或两者。
- 交互模式预览所有托管路径，并在写入前确认。
- 交互模式推荐 CodeGraph，但允许选择源码搜索。
- `--dry-run` 不产生任何写入。
- 重复执行保持幂等，并保留已有项目记忆。
- 遇到未托管的同名 runtime 文件时拒绝覆盖并报告冲突。
- 不修改全局 MCP 配置。
- 每回合状态注入默认关闭；只有显式 `--context-injection` 才投射 Claude/Codex hook。

非交互 `--yes` 模式只有显式传入 `--graph codegraph` 时，才允许安装或初始化
CodeGraph；否则使用源码搜索。

#### FR-INIT-02 初始化项目知识

系统必须提供：

```text
specpilot init knowledge [path] [--dry-run] [--json]
```

该命令必须：

- 盘点 manifest、语言、源码目录、测试目录和已有项目记忆。
- 将可重建结果写入 `.specpilot/local/knowledge-init.json`。
- `--dry-run` 只返回预览，不写文件。
- 不直接写入 `specs/knowledge/`，也不把扫描推断当作已验证事实。

`specpilot-init-knowledge` 工作流必须：

- 从 manifest、README、项目记忆、源码、测试和配置中确认候选信息。
- 区分“当前观察到的惯例”和“团队希望遵守的标准”。
- 按 glossary、standards、decisions、knowledge candidates 分组预览。
- 对每项内容提供来源和不确定性说明。
- 写入前展示完整变更并获得用户批准。
- 合并兼容内容，不静默覆盖已有项目知识；冲突必须显式呈现。

#### FR-LIFE-01 更新

`specpilot update [path] [--json]` 必须只刷新 SpecPilot manifest 管理的 Claude/Codex
runtime 和托管版本信息，不得修改项目产物或无关宿主文件。

#### FR-LIFE-02 卸载

`specpilot uninstall [path] [--yes] [--json]` 必须：

- 默认要求用户确认。
- 只删除 SpecPilot 托管 runtime 和配置。
- 保留 specs、tasks、decisions、reviews、summaries、knowledge 和 evidence。
- 保留无关的 Claude Code、Codex 和用户文件。
- 对已被用户修改的托管文件采取保守策略，不静默删除。

### 5.2 变更工作流

#### FR-FLOW-01 Start

`specpilot-start` 必须：

- 读取项目记忆、open changes 和与目标有关的最小上下文。
- 一次只提出一个高价值问题。
- 至少明确目标、非目标、验收条件、约束和测试 seam。
- 根据语义建议 change 类型，并在写入前让用户确认：
  - `light`：局部、低风险、无实质设计选择。
  - `standard`：跨模块、涉及迁移或架构选择，或包含依赖任务。
- 预览分类、产物路径、Spec 大纲和任务。
- 创建稳定的 change id，且不得加入 workflow phase 字段。
- 默认将任务设为 `execution: standard`；只有用户明确要求时才设为 `tdd`。

Light change 必须包含 `change.yaml`、`spec.md` 和至少一个任务。Standard change 还必须
包含 `design.md` 和 `plan.md`。

#### FR-FLOW-02 Work

`specpilot-work` 必须：

- 选择一个依赖已满足的任务。
- 只加载该任务需要的 Spec、标准、已验证知识和源码候选。
- 工作期间将任务标记为 `doing`，有当前证据后才能标记为 `done`。
- 维护一个本地 active change/task 指针。
- 不得依据图谱输出或未记录的口头结论完成任务。

任务状态必须通过以下 CLI 转换，不得由 workflow 直接改写 frontmatter：

```text
specpilot task start <change> <task>
specpilot task complete <change> <task>
specpilot task block <change> <task> --reason <reason>
specpilot task waive <change> <task> --reason <reason>
```

`start` 必须要求 Spec 已批准且所有依赖为 `done|waived`，并激活本地 session pointer。
`complete` 必须要求 task 为 `doing` 且存在与当前 worktree 一致的 green evidence。
`block` 与 `waive` 必须要求非空原因。

每个 task 必须有 repository-backed context manifest，并分别维护 work/review 引用：

```text
specpilot context add <change> <task> --purpose work|review \
  --file <path> --reason <reason>
specpilot context list <change> <task> --purpose work|review
specpilot context remove <change> <task> --purpose work|review --file <path>
```

引用只能指向 `specs/project/`、`specs/knowledge/` 或当前 change 内的文件，必须记录原因，
不得预登记将被修改的源码文件。缺失的 work context 必须阻止 start；缺失的 review
context 必须阻止 review 写入。

Standard 任务应使用最小可观察反馈循环。

TDD 任务必须按单个垂直切片执行：

1. 编写一个聚焦测试。
2. 记录带预期失败原因的 red 证据。
3. 编写使该测试通过的最小实现。
4. 记录 green 证据。
5. 在保持 green 的前提下重构，再进入下一切片。

不得先批量编写全部测试再实现。

#### FR-FLOW-03 Review

`specpilot-review` 必须独立检查：

1. **Standards Review**：实现是否符合项目已记录标准。
2. **Spec Review**：实现是否完整、忠实地满足已批准 Spec，且没有无依据扩张范围。

有调度能力时可以并行执行两个 reviewer；否则顺序执行相同合同。每个 blocking finding
必须引用源码、测试、日志或缺失的验收证据。

Review 状态为：

- `pass`
- `pass_with_warnings`
- `blocked`

Warning 不阻止 finish；任一轴为 blocked 时必须阻止 finish。

Review 必须记录评审时的 worktree fingerprint，以及 change spec 文档（`spec.md`、`design.md`、
`plan.md`）的 spec fingerprint。评审后代码或 spec 文档发生变化时，旧 Review 必须视为
stale，并重新执行评审。worktree fingerprint 排除 `specs/**`，因此 spec 文档由 spec
fingerprint 单独钉住。

Review 必须通过以下 CLI 写入，不得由 workflow 手写 `review.md`：

```text
specpilot review record <change> \
  --standards pass|pass_with_warnings|blocked \
  --spec pass|pass_with_warnings|blocked \
  --body-file <path>
```

WorkflowHarness 必须根据两个 axis 派生总状态并自动获取当前 fingerprint；ProjectStore 必须
验证并写入 Review 文件合同。

Review 开始前必须读取每个未 waived task 的 `--purpose review` context，并在引用缺失时拒绝
写入 review。

#### FR-FLOW-04 Finish

`specpilot-finish` 必须先预览门禁，再由显式 apply 关闭 change。

关闭条件：

- change 产物满足 light/standard 合同。
- Spec 已获得明确批准并记录 `spec_approved_at`。
- 至少存在一个任务。
- 所有任务为 `done` 或具有理由的 `waived`。
- 任务依赖存在且无环。
- 所有未 waived task 的 work/review context 引用仍然存在。
- Review 存在、格式有效、与当前 worktree fingerprint 和 spec fingerprint 均一致且没有
  blocking 结果。
- 存在与当前 HEAD/worktree fingerprint 一致的 final 证据。
- 每个未 waived 的 TDD 任务都有 red 证据以及与当前 worktree 一致的 green 证据。
- red 与 green 必须执行同一条聚焦验证命令。
- red 必须早于 green，green 必须早于 final。

Red 证据描述实现前的失败状态，因此不要求它与最终 worktree fingerprint 一致；其有效性由
预期失败原因、命令一致性和 red → green 顺序共同约束。

关闭后必须：

- 只将 change 状态更新为 `closed` 并记录 `closed_at`。
- 生成 `summary.md`。
- 保持 change 目录原位，确保引用路径稳定。
- 如果本地 session 指向已关闭 change，清除该指针。
- 预览可沉淀的 knowledge candidates，不自动晋升。

#### FR-FLOW-05 Resume

`specpilot-resume` 必须保持只读：

- 优先使用有效的本地 active change/task 指针。
- 指针失效时列出 open changes 并让用户选择。
- `status` 必须将不存在或已关闭的 change/task 引用标记为 stale，不得静默信任。
- 先读取摘要，再按需展开完整产物。
- 只推荐一个后续入口：start、work、review 或 finish。
- 不修复任务状态、不更新 runtime、不关闭 change。

### 5.3 状态与诊断

#### FR-OPS-01 Status

`specpilot status [path] [--json]` 必须显示：

- 所有 open changes。
- 各 change 的任务总数和状态统计。
- 缺失或无效的门禁。
- 推荐的下一工作流入口。

#### FR-OPS-02 Doctor

`specpilot doctor [path] [--json]` 必须检查：

- 配置格式与版本。
- 托管 runtime 是否缺失或发生 drift。
- change/task/review 等项目产物是否符合合同。
- CodeGraph 是否可用、已索引或过期。
- 验证证据是否有效且与当前 worktree 一致。

发现不健康状态时，CLI 必须返回非零退出码。

### 5.4 图谱与源码检索

#### FR-GRAPH-01 稳定接口

系统必须提供 provider-neutral CLI：

```text
specpilot graph status [path] [--json]
specpilot graph explore <query> [path] [--json]
specpilot graph impact <symbol> [path] [--json]
specpilot graph affected <files...> [--path <path>] [--json]
```

#### FR-GRAPH-02 CodeGraph Adapter

- 首版通过 subprocess 调用 CodeGraph CLI，不嵌入其 Node library。
- Adapter 必须报告安装、索引和 stale 状态。
- 输出必须统一标记为 advisory，并要求源码确认。
- CodeGraph 缺失、未索引或查询失败时必须提供明确 warning。

#### FR-GRAPH-03 源码降级

- `explore` 和 `impact` 至少提供字面源码搜索结果。
- `affected` 至少列出 changed files 和候选测试。
- 降级结果必须说明可能遗漏动态关系。
- 图谱或降级搜索结果均不得直接作为影响范围、调用链或测试充分性的证明。

### 5.5 验证证据

#### FR-EVID-01 执行与记录

系统必须提供：

```text
specpilot verify run \
  --change <id> --task <id> --phase red|green|final \
  [--reason <expected-failure>] [--path <path>] -- <command>
```

命令必须以参数数组执行，不经过 shell 解释。

Evidence JSON 必须记录：

- schema 和稳定标识。
- change、task、phase。
- 完整命令参数和可选原因。
- 退出码、有效性、开始/结束时间、耗时。
- Git HEAD 和 worktree fingerprint。
- 精确 curated-context fingerprint 与 work|change scope。
- 日志路径和 evidence record 路径。

有效性规则：

- red 必须提供预期失败原因，且命令退出码非零。
- green 和 final 的命令退出码必须为零。
- 同一 TDD 切片的 red 和 green 必须使用相同命令。
- 代码或未跟踪源码内容变化后，依赖当前工作树的 green/final 证据必须判定为 stale。

### 5.6 项目记忆

#### FR-MEM-01 记忆分层

系统必须区分：

- 项目语言：`specs/project/glossary.md`
- 项目标准：`specs/project/standards/*.md`
- 架构决策：`specs/project/decisions/*.md`
- 已验证长期知识：`specs/knowledge/*.md`
- 变更上下文：`specs/changes/<change-id>/`
- 本地会话与候选：`.specpilot/local/`
- 可重建检索索引：`.specpilot/cache/`

#### FR-MEM-02 检索

- Markdown/frontmatter 是真相源。
- 检索优先使用 `rg` 和本地派生索引。
- 索引可删除并从真相源重建。
- 只展开与当前 change、路径或 domain 有关的完整文档。
- Task context manifest 保存经过策划的 work/review 文件引用；检索模块负责解析存在性，
  不把文件正文复制进 manifest。
- 不使用 SQLite、向量数据库或 embeddings。

#### FR-MEM-03 Knowledge 晋升

长期知识必须遵循 candidate → review → promote。新知识必须使用 OKF v0.2 portable 字段和
`specpilot` policy 扩展：

```yaml
type: string
title: string
description: string
sources: [{ id: string, resource: string }]
generated: { by: string, at: ISO-8601 timestamp }
verified: { by: 'human:<id>', at: ISO-8601 timestamp }
status: stable
stale_after: YYYY-MM-DD
specpilot:
  domain: string
  criticality: p0|p1|p2
  authority: normative|contractual|descriptive|historical|operational|instructional
  load_policy: always|required_when_matched|recommended_when_matched|on_demand|host_managed
  evidence_refs: [string]
  invalidation: { description: string, watch_paths: [string] }
```

人工 review receipt 必须记录候选路径、内容 SHA-256、决定、human actor、原因和时间；候选内容
变化后必须重新 review。晋升与后续 audit 必须重新校验本地来源、evidence 新鲜度、日志、
`stale_after` 和重复 identity。晋升必须写入 tracked attestation，将已 review 的知识内容绑定到
source 和 invalidation watch fingerprint；后续只因相关来源/watch 内容变化而 stale，不因无关
worktree 变化误伤。检索与 task context 不得使用 invalid、stale 或 conflicting knowledge。

以下内容不得晋升：

- 原始聊天或会话记录。
- 未经源码、测试、配置或日志确认的图谱输出。
- 缺少来源、证据或失效条件的经验。

#### FR-MEM-04 知识治理覆盖

`specpilot init knowledge` 和 `specpilot knowledge audit` 必须按 `covered|template|missing`
审计以下 16 类知识，并返回推荐位置和更新触发条件：

- P0：架构边界、测试与验证、API/数据/事件契约、状态机与业务流程。
- P1：ADR、需求归档、Agent Skills、标准样例、Runbook、Incident/Postmortem、反模式库、
  领域词汇表、观测性、发布/回滚/迁移、AI 评估集。
- P2：性能、容量与安全约束。

初始化只创建带 `specpilot-template` 标记的骨架；骨架不得被统计为已覆盖。P0 缺口应在
doctor 中告警；invalid、stale 或 conflicting trusted knowledge 必须使 doctor 失败。

#### FR-MEM-05 上下文选择与预算

每个 task/purpose 的 curated context 必须具有可配置字节预算，默认 131072 bytes，允许范围
4096 到 10485760 bytes。`context list` 必须返回实际字节、预算和超额量；missing、untrusted
或 over-budget context 必须阻止 start、verification、review 和 finish。

`specpilot context suggest` 必须根据 change/task 文本、知识优先级和 OKF `load_policy`
确定候选排序，排除 template 与不可信 knowledge，在剩余预算内选择并解释每个候选；默认
只预览，只有显式 `--apply` 才能写入 manifest。

### 5.7 Runtime 投射

#### FR-RUNTIME-01 单一源资产

- 所有工作流必须以 `runtime/skills/` 下的英文资产为唯一源。
- 必须向 `.claude/skills/`、`.codex/skills/` 或 `.agents/skills/` 投射等价行为。
- RuntimeProjector 只能管理 manifest 中明确记录的 SpecPilot 文件。
- `assets/optional_skills/` 可以包含经过审阅并随 npm 包发布的可选 Skill。
- 必须提供 `specpilot add skill [name]`；省略名称时从 bundled catalog 交互选择。
- 选择结果必须写入 `.specpilot/config.json`，并由 RuntimeProjector 负责投射、更新和卸载。
- 不接受任意路径、URL、远程 registry 或市场中的 Skill。
- 可选的每回合状态 hook 必须只注入 active change/task、状态、推荐入口和 context 数量，
  不得内联 Spec、扫描源码、运行 finish gates 或计算 worktree fingerprint。
- 必须提供 `specpilot context injection enable|disable`，且启用、更新、禁用、卸载均遵守
  manifest 托管边界；未托管的宿主配置冲突必须拒绝覆盖。
- Codex 投射必须使用项目级 `.codex/hooks.json`；启用后由用户通过 `/hooks` 审阅并信任。

## 6. 文件合同

```text
specs/
  project/
    glossary.md
    architecture/
    contracts/
    domain/
    standards/
    decisions/
    examples/
    runbooks/
    incidents/
    observability/
    release/
    ai/evals/
    performance/
    security/
  changes/<change-id>/
    change.yaml
    spec.md
    design.md          # standard 必须，light 省略
    plan.md            # standard 必须，light 省略
    tasks/*.md
    context/*.json     # 每个 task 的 work/review context manifest
    review.md
    summary.md
  knowledge/*.md

.specpilot/
  config.json
  evidence/
  local/               # gitignored
  cache/               # gitignored、可重建
```

### 6.1 Change 合同

`change.yaml` 只保存：

- `schema_version: 1`
- 稳定 id 和标题
- `kind: light|standard`
- `status: open|closed`
- 创建、批准和关闭时间

不得保存 workflow phase。

### 6.2 Task 合同

Task frontmatter 必须包含：

```yaml
schema_version: 1
id: lowercase-hyphen-id
title: Human title
status: todo # todo|doing|done|blocked|waived
blocked_by: []
execution: standard # standard|tdd
```

被 waived 的任务必须提供 `waiver_reason`。不存在的依赖和依赖环均为无效状态。

### 6.3 Task Context 合同

```json
{
  "schema_version": 1,
  "change_id": "change-id",
  "task_id": "task-id",
  "work": [{ "path": "specs/project/standards/testing.md", "reason": "Testing contract" }],
  "review": [{ "path": "specs/changes/change-id/spec.md", "reason": "Approved behavior" }]
}
```

新 task 默认引用 change 的 `spec.md`；standard change 还默认引用 `design.md` 与 `plan.md`。
旧 task 没有 manifest 时必须获得同样的兼容默认清单，并在首次策划写入时持久化。

### 6.4 Review 合同

```yaml
schema_version: 1
status: pass # pass|pass_with_warnings|blocked
standards: pass
spec: pass
reviewed_at: ISO-8601 timestamp
worktree_fingerprint: string
spec_fingerprint: string # spec.md/design.md/plan.md 内容哈希
```

正文必须分开记录 Standards findings 和 Spec findings，并提供文件或证据引用。

## 7. 非功能需求

### NFR-01 技术与兼容性

- npm 包名：`specpilot-kit`（0.4.0 及更早版本发布于旧包名 `specpilot-ai`）
- CLI 名称：`specpilot`
- Node.js：20+
- TypeScript ESM 单包
- 测试框架：Vitest
- 0.5 不导出 TypeScript library API
- 支持 Linux、macOS、Windows 的路径和 CLI smoke

### NFR-02 安全

- 所有外部命令使用无 shell 解释的 subprocess。
- 不读取、不迁移、不删除旧 Comet/OpenSpec 数据。
- 不自动操作 branch/worktree。
- 不安装代码写入阻断 hook。
- 不修改全局 MCP 配置。
- 不采集遥测。

### NFR-03 可靠性

- 文件写入必须采用原子写入。
- `init`、`update` 和 `uninstall` 必须保持托管边界和幂等性。
- 本地 session、inventory 和 cache 必须 gitignored 且可重建。
- Closed change 不移动目录。

### NFR-04 可测试性

新行为必须按纵向 TDD 切片实现：

1. 在模块接口、CLI 或文件合同层添加失败测试。
2. 添加使其通过的最小实现。
3. 保持测试通过后再评审和重构。

发布前必须通过：

```text
pnpm run format:check
pnpm run lint
pnpm run build
pnpm run test
pnpm run test:coverage
node scripts/prepublish-check.js
npm pack --dry-run
```

## 8. 明确不做

0.5 不包含：

- 任意路径或远程 Skill 安装、Skill 市场、第三方 registry 管理。
- Claude Code 与 Codex 以外的 AI 平台投射。
- GitHub、Linear 或其他任务系统双向同步。
- SQLite、向量库或 embeddings 项目记忆。
- 强制全局 TDD、强状态机或代码写入阻断 hook。
- 自动创建或管理 branch/worktree。
- 遥测。
- GitNexus adapter。
- 旧 Comet/OpenSpec 数据迁移或兼容 runtime。
- 对外 TypeScript library API。

## 9. 发布路径

1. 以 `0.5.0-beta.x` 验证 CLI、文件合同和 runtime 行为。
2. 在 Claude Code 与 Codex 分别验证：
   - light change
   - standard change
   - TDD change
   - CodeGraph unavailable
3. 验证 update/uninstall 不触碰用户文件和项目产物。
4. 修复 Beta 期间发现的合同问题并保持向后兼容。
5. 通过上述真实任务和跨平台验证后发布 `1.0.0`。

## 10. 需求优先级

### P0：发布阻断

- 初始化安全与幂等。
- Start → Work → Review → Finish 完整闭环。
- 文件合同和多 open changes。
- EvidenceRunner 与 finish 新鲜度门禁。
- 显式 TDD red → green → final。
- Claude/Codex runtime 等价。
- Update/uninstall 托管边界。

### P1：Beta 必需

- `init knowledge` 与知识 review/promotion。
- Resume 与本地会话指针。
- Status/Doctor 可诊断性。
- CodeGraph adapter、stale 检查和源码降级。
- 跨平台与 npm tarball smoke。
- Repository-backed task context 与可选轻量状态注入。

### P2：稳定性增强

- 更清晰的错误恢复建议。
- 更细粒度的 doctor 修复指引。
- 更完整的真实项目验收样例。
- 在不改变公开合同的前提下优化检索性能。
