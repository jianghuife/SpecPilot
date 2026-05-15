---
name: comet-open
description: "Comet 阶段 1：开启。用 /comet-open 调用。通过 OpenSpec 探索想法、创建 change 结构（proposal + design + tasks）。"
---

# Comet 阶段 1：开启（Open）

## 前置条件

- 无活跃 change，或用户希望创建新 change

## 步骤

### 0. 入口状态验证（Entry Check）

在执行任何操作之前，读取并验证当前状态：

**检查清单：**
1. `openspec/changes/<name>/` 目录已存在（由 openspec-new-change 创建）
2. `openspec/changes/<name>/.comet.yaml` 文件不存在（尚未初始化）
3. `openspec/changes/<name>/proposal.md` 存在且非空
4. `openspec/changes/<name>/design.md` 存在且非空
5. `openspec/changes/<name>/tasks.md` 存在且非空

**验证方式：**
- 读取以上路径确认存在/不存在
- 如 `.comet.yaml` 已存在，读取其 `phase` 字段：如 phase 不为空，输出 `[HARD STOP]` 并提示可能已有活跃 change

**失败输出：**
```
[HARD STOP] Entry check failed for comet-open
  Expected: .comet.yaml does not exist, proposal.md + design.md + tasks.md exist
  Actual:   phase=<实际值>, design_doc=<实际值> (或文件不存在)
  Suggestion: Check if another change with the same name is already active.
```

验证通过后才进入步骤 1。

### 1. 探索想法

**立即执行：** 使用 Skill 工具加载 `openspec-explore` 技能。禁止跳过此步骤。

技能加载后，按其指引自由探索问题空间。

### 2. 创建 Change 结构

**立即执行：** 使用 Skill 工具加载 `openspec-new-change` 技能。若用户意图未明确、需要先形成建议，改为加载 `openspec-propose`。禁止跳过此步骤。

确认以下产物已创建：

```
openspec/changes/<name>/
├── .openspec.yaml
├── .comet.yaml
├── proposal.md       # Why + What：问题、目标、范围
├── design.md         # How（高层）：架构决策、方案选型
└── tasks.md          # 任务清单（勾选框）
```

### 2b. 增量修改已有 Capability（可选）

**触发条件**：proposal.md 中提到修改已有 capability，或用户明确要求增量修改。

**适用场景**：对已归档功能做增量修改（而非全新 capability）。

当 proposal.md 目标涉及修改已有 capability 时：
1. 查找 `openspec/specs/<capability>/spec.md` 是否已存在主 spec
2. 如已存在，将主 spec 复制为 delta spec 基线：

```bash
mkdir -p openspec/changes/<name>/specs/<capability>/
cp openspec/specs/<capability>/spec.md openspec/changes/<name>/specs/<capability>/spec.md
```

3. 在复制的 delta spec 中，按 delta 格式组织变更（`## ADDED`、`## MODIFIED`、`## REMOVED`）
4. 在 proposal.md 中注明 `基于已有 capability: <capability-name>`

### 3. 初始化 Comet 状态

在 `openspec/changes/<name>/` 下创建独立的 `.comet.yaml` 文件：

```yaml
workflow: full
phase: design
design_doc: null
plan: null
build_mode: null
verify_mode: null
verify_result: pending
verified_at: null
archived: false
```

【写入验证】创建完成后必须验证：
  cat openspec/changes/<name>/.comet.yaml
  确认 workflow 行的值为 "full"
  确认 phase 行的值为 "design"
  确认 design_doc 行的值为 "null"
  确认 plan 行的值为 "null"
  确认 build_mode 行的值为 "null"
  确认 verify_mode 行的值为 "null"
  确认 verify_result 行的值为 "pending"
  确认 verified_at 行的值为 "null"
  确认 archived 行的值为 "false"
  如任一字段不匹配，重试写入后再次验证。最多重试 2 次，仍失败则报告错误并终止。

### 4. 内容完整性检查

确认三个文档内容完整：
- **proposal.md**：问题背景、目标、范围、非目标
- **design.md**：高层架构决策、方案选型、数据流
- **tasks.md**：任务列表，每个任务有明确描述

## 退出条件

- proposal.md、design.md、tasks.md 均已创建且内容完整
- **阶段守卫**：运行 `bash $COMET_GUARD <change-name> open`，全部 PASS 后才允许流转

## 自动流转

退出条件满足后，**无需等待用户再次输入**，直接执行下一阶段：

> **REQUIRED NEXT SKILL:** 调用 `comet-design` skill 进入深度设计阶段。
