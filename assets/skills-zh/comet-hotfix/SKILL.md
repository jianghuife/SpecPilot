---
name: comet-hotfix
description: "Comet 预设路径：Bug fix / 热修复。跳过 brainstorming，直接 open → build → verify → archive。适用于行为修复、不涉及新 capability 设计的场景。"
---

# Comet 预设路径：Hotfix

Hotfix 是 Comet 五阶段能力的预设工作流，不是独立的平行流程。它复用 open、build、verify、archive 能力，仅跳过 brainstorming 和完整 plan。

适用于 bug fix、热修复、小范围行为修正。不涉及新 capability 设计，不需要深度 brainstorming。

**适用条件**（必须全部满足）：
1. 修复已有功能的 bug，不新增 capability
2. 不涉及接口变更或架构调整
3. 改动范围可预估（通常 < 5 个文件）

**不适用**：如修复过程发现需要架构调整，应升级为完整 `/comet` 流程。

---

## 流程（preset workflow，4 阶段）

### 0. 入口状态验证（Entry Check）

执行入口验证：

```bash
COMET_STATE="${COMET_STATE:-$(find . -path '*/comet/scripts/comet-state.sh' -type f -print -quit)}"
bash "$COMET_STATE" check <name> open
```

验证通过后继续流程步骤。验证失败时脚本会输出具体失败原因。

执行链路：open → build → verify → archive。Hotfix 为每个阶段提供默认决策：精简开启、直接构建、按规模验证、验证通过后归档。

### 1. 快速开启（preset open）

复用 Comet open 能力创建 change，但使用 hotfix 默认值：不执行 `openspec-explore` 长探索，直接进入精简 change 创建。

**立即执行：** 使用 Skill 工具加载 `openspec-new-change` 技能。禁止跳过此步骤。

技能加载后，按其指引创建精简版产物：
  - `proposal.md` — 问题描述 + 根因分析 + 修复目标（无需方案对比）
  - `design.md` — 修复方案（1 个即可，无需多方案对比）
  - `tasks.md` — 修复任务清单
- **无需 delta spec**（除非修复改变了已有 spec 的验收场景）

初始化 Comet 状态文件：

```bash
bash "$COMET_STATE" init <name> hotfix
```

### 2. 直接构建（preset build）

使用 hotfix 默认值：`build_mode: direct`。跳过 `superpowers:brainstorming` 和 `superpowers:writing-plans`（除非任务 > 3 个；若超过 3 个任务，转入 `/comet-build` 的计划与执行方式选择）。

**立即执行：** 按 tasks.md 逐个执行任务：

1. 读取 `openspec/changes/<name>/tasks.md`，获取未完成任务列表
2. 对每个未完成任务：
   - 根据任务描述修改代码
   - 运行项目格式化命令（如 `mvn spotless:apply`、`npm run format` 等）
   - 运行相关测试确认通过
   - 将 tasks.md 中对应 `- [ ]` 勾选为 `- [x]`
   - 提交代码，commit message 格式：`fix: <简述修复>`
3. 全部任务完成后进入验证

**如修复影响已有 spec 验收场景**：
- 在 `openspec/changes/<name>/specs/<capability>/spec.md` 创建 delta spec
- 仅包含 `## MODIFIED Requirements` 部分

### 3. 验证（preset verify）

复用 `/comet-verify`，由 comet-verify 的规模评估决定轻量或完整验证。

**立即执行：** 使用 Skill 工具加载 `comet-verify` 技能。禁止跳过此步骤。

无 delta spec 的小范围 hotfix 通常满足轻量验证条件（≤ 3 tasks、≤ 5 files），comet-verify 的规模评估会选择轻量验证路径（5 项快速检查）。若 hotfix 创建了 delta spec，则根据 comet-verify 的规模评估规则进入完整验证路径。

**额外 Hotfix 专属检查**（在 comet-verify 轻量验证通过后执行）：

1. **根因消除**：对照 proposal.md 的根因分析，确认问题代码已消除
   - 读取 proposal.md 中的 bug 描述和根因
   - 搜索验证问题代码不再存在
   - 如根因未消除，返回 Step 2 继续修复

**验证阶段升级条件**：
- 回归测试揭示深层架构问题 → 停止 hotfix，升级为 `/comet`
- 修复需要额外接口变更 → 停止 hotfix，升级为 `/comet`

验证通过后，按 `/comet-verify` 的规则将 `.comet.yaml` 的 `verify_result` 记录为 `pass`，归档前不得跳过该状态。

### 4. 归档（preset archive）

复用 `/comet-archive`。归档前必须满足 `.comet.yaml` 中 `verify_result: pass`。

**立即执行：** 使用 Skill 工具加载 `comet-archive` 技能进行归档。禁止跳过此步骤。
如有 delta spec，按 comet-archive 规则同步到 main spec，并处理关联 Design Doc 与 Plan 的归档标注。

---

## 连续执行模式

<IMPORTANT>
Hotfix 流程为 **一次性连续执行**。调用 `/comet-hotfix` 后，agent 必须自动走完全部 4 个阶段，中间不停顿等待用户输入（除非遇到升级条件需要用户确认）。

执行顺序：快速开启 → 直接构建 → 验证 → 归档 → 完成

每个阶段完成后立即进入下一阶段，无需用户再次输入。阶段内部仍必须按上文要求调用对应 Comet/OpenSpec/Superpowers skill。
</IMPORTANT>

---

## 升级条件

满足以下**任一**条件时，停止 hotfix 流程，升级为完整 `/comet`：

| 条件 | 说明 |
|------|------|
| 改动涉及 **3+ 文件** | 超出单点修复范围 |
| 架构变更 | 新模块、新接口、新依赖 |
| 数据库 schema 变更 | 结构性调整 |
| 引入新的 public API | 修复产生了新的对外接口 |
| 修复范围超出单一函数/模块 | 需要多处协调修改 |

升级方式：在当前 change 基础上补充 Design Doc（执行 `/comet-design`），后续正常走完整流程。

---

## 退出条件

- Bug 已修复，测试通过
- change 已归档
- 如有 spec 变更，已同步到 main spec
- **阶段守卫**：build → verify 前运行 `bash $COMET_GUARD <change-name> build`，verify → archive 前运行 `bash $COMET_GUARD <change-name> verify`
