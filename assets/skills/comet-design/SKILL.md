---
name: comet-design
description: "Comet 阶段 2：深度设计。用 /comet-design 调用。通过 brainstorming 产出 Design Doc 和 delta spec。"
---

# Comet 阶段 2：深度设计（Design）

## 前置条件

- 活跃 change 已存在（proposal.md、design.md、tasks.md）
- 无 Design Doc（`docs/superpowers/specs/` 下无对应文件）

## 步骤

### 0. 入口状态验证（Entry Check）

在执行任何操作之前，读取并验证当前状态：

**检查清单：**
1. `openspec/changes/<name>/.comet.yaml` 存在
2. `phase` 字段的值为 `"design"`
3. `workflow` 字段的值为 `"full"`
4. `design_doc` 字段为 `null` 或空
5. `openspec/changes/<name>/proposal.md` 存在且非空
6. `openspec/changes/<name>/design.md` 存在且非空
7. `openspec/changes/<name>/tasks.md` 存在且非空

**验证方式：**
- `cat openspec/changes/<name>/.comet.yaml` 读取全部字段
- 逐条比对检查清单

**失败输出：**
```
[HARD STOP] Entry check failed for comet-design
  Expected: phase=design, design_doc=<empty/null>, workflow=full
  Actual:   phase=<实际值>, design_doc=<实际值>, workflow=<实际值>
  Suggestion: Run comet-open first, or check if .comet.yaml was modified out of sequence.
```

验证通过后才进入步骤 1。

### 1a. 读取已有上下文

读取活跃 change 下的 `proposal.md` 和 `design.md`，将核心内容整理为摘要：
- **proposal 摘要**：目标、动机、范围
- **design 摘要**：架构决策、高层设计

### 1b. 执行 Brainstorming（带上下文）

**立即执行：** 使用 Skill 工具加载 `superpowers:brainstorming` 技能，ARGUMENTS 包含：

```
Change: <change-name>
Proposal 摘要: <proposal 核心内容>
Design 摘要: <design.md 架构决策>
跳过上下文探索，直接进入设计提问。
```

禁止跳过此步骤，禁止在未加载该技能的情况下继续。

如 `superpowers:brainstorming` 不可用，停止流程并提示安装或启用 Superpowers 技能，不要用普通对话替代该步骤。

技能加载后，按其指引产出：
- `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` — 设计文档（技术 RFC）
- `openspec/changes/<name>/specs/<capability>/spec.md` — 能力规格（delta）

### 2. 更新 Comet 状态

在 `openspec/changes/<name>/.comet.yaml` 中合并更新以下字段（保留其他字段不变）：

```yaml
phase: build
design_doc: docs/superpowers/specs/YYYY-MM-DD-topic-design.md
```

【写入验证】更新完成后必须验证：
  cat openspec/changes/<name>/.comet.yaml
  确认 phase 行的值为 "build"
  确认 design_doc 行的值为 "docs/superpowers/specs/YYYY-MM-DD-topic-design.md"
  如任一字段不匹配，重试写入后再次验证。最多重试 2 次，仍失败则报告错误并终止。

### 3. 双 Spec 分工

| Spec 类型 | 归属 | 存放位置 | 定义 |
|-----------|------|---------|------|
| 能力规格 | OpenSpec | `openspec/changes/<name>/specs/` | 系统应该做什么（需求 + 验收场景） |
| 设计文档 | Superpowers | `docs/superpowers/specs/` | 怎么构建（技术架构 + 实现细节） |

### 4. 文档层级确认

```
proposal.md（阶段 1）              → Why + What
design.md（阶段 1，OpenSpec）      → 高层架构决策
设计文档（阶段 2，Superpowers）     → 深度技术设计
能力规格（阶段 2，delta）           → 需求 + 验收场景
```

## 退出条件

- Design Doc 已创建并保存
- 如有新能力则 delta spec 已创建
- **阶段守卫**：运行 `bash $COMET_GUARD <change-name> design`，全部 PASS 后才允许流转

## 自动流转

退出条件满足后，**无需等待用户再次输入**，直接执行下一阶段：

> **REQUIRED NEXT SKILL:** 调用 `comet-build` skill 进入计划与构建阶段。
