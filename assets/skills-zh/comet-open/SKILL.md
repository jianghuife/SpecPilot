---
name: comet-open
description: "Comet 阶段 1：开启。用 /comet-open 调用。通过 OpenSpec 探索想法、创建 change 结构（proposal + design + tasks）。"
---

# Comet 阶段 1：开启（Open）

## 前置条件

- 无活跃 change，或用户希望创建新 change

## 步骤

### 0. 入口状态验证（Entry Check）

执行入口验证：

```bash
COMET_STATE="${COMET_STATE:-$(find . -path '*/comet/scripts/comet-state.sh' -type f -print -quit)}"
bash "$COMET_STATE" check <name> open
```

验证通过后继续 Step 1。验证失败时脚本会输出具体失败原因。

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

### 3. 初始化 Comet 状态

初始化 Comet 状态文件：

```bash
bash "$COMET_STATE" init <name> full
```

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
