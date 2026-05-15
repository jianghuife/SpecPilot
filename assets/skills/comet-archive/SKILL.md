---
name: comet-archive
description: "Comet 阶段 5：归档。用 /comet-archive 调用。同步 delta spec 到主 spec，归档 change。"
---

# Comet 阶段 5：归档（Archive）

## 前置条件

- 验证已通过（阶段 4 完成）
- 分支已处理
- `openspec/changes/<name>/.comet.yaml` 中 `verify_result: pass`

## 步骤

### 0. 入口状态验证（Entry Check）

在执行任何操作之前，读取并验证当前状态：

**检查清单：**
1. `openspec/changes/<name>/.comet.yaml` 存在
2. `phase` 字段的值为 `"archive"`
3. `verify_result` 字段的值为 `"pass"`
4. `archived` 字段为 `"false"` 或 null（尚未归档）

**验证方式：**
- `cat openspec/changes/<name>/.comet.yaml` 读取全部字段
- 如 `verify_result` 不是 `"pass"`，必须先完成验证

**失败输出：**
```
[HARD STOP] Entry check failed for comet-archive
  Expected: phase=archive, verify_result=pass, archived=false|null
  Actual:   phase=<实际值>, verify_result=<实际值>, archived=<实际值>
  Suggestion: Run comet-verify first, or this change was already archived.
```

验证通过后才进入步骤 1。

### 1. 执行归档

归档前如 `verify_result` 不是 `pass`，停止归档并返回 `/comet-verify`。

**立即执行：** 使用 Skill 工具加载 `openspec-archive-change` 技能。禁止跳过此步骤。

技能加载后，按其指引归档。自动检查：
1. artifact 完成状态（proposal、design、specs、tasks）
2. 所有任务已标记 `[x]`
3. delta specs 同步状态

### 1b. 移动 Comet 状态文件

`openspec-archive-change` 不感知 `.comet.yaml`，因此 Comet 需要在 OpenSpec 归档完成后自行移动该文件：

```bash
mv openspec/changes/<name>/.comet.yaml openspec/changes/archive/YYYY-MM-DD-<name>/.comet.yaml
```

【写入验证】移动完成后必须验证：
  test -f openspec/changes/archive/YYYY-MM-DD-<name>/.comet.yaml
  确认归档目录中 .comet.yaml 存在
  如文件不在预期位置，检查 mv 命令是否成功执行。

### 2. Delta Spec 同步

归档时将 delta specs 同步到主 specs：

```
openspec/changes/<name>/specs/<capability>/spec.md
       ↓ 同步
openspec/specs/<capability>/spec.md  ← 主 spec（持久化）
```

### 3. Design Doc & Plan 处理

归档时同步处理 `docs/superpowers/` 下的关联文件。若目标文件已有 YAML frontmatter，将归档字段合并到现有 frontmatter；若没有 frontmatter，才新建一组 frontmatter。

**3a. Design Doc 一致性标注**

查找 `docs/superpowers/specs/` 中与当前 change 关联的设计文档：
- 对比 delta spec 最终版与 design doc 内容
- 如有偏差（实施过程中 spec 发生了增量修改），在 design doc 的 YAML frontmatter 中设置以下元数据：

```yaml
---
archived-with: YYYY-MM-DD-<name>
status: superseded-by-main-spec
implementation-notes: |
  <简述实施过程中偏离原设计的关键变化>
---
```

- 如完全一致，仅设置：

```yaml
---
archived-with: YYYY-MM-DD-<name>
status: final
---
```

**3b. Plan 关联标注**

查找 `docs/superpowers/plans/` 中与当前 change 关联的实施计划，在 YAML frontmatter 中设置相同的 `archived-with` 元数据。

### 4. 归档目录

change 移入归档目录：

```
openspec/changes/archive/YYYY-MM-DD-<name>/
├── .openspec.yaml
├── .comet.yaml
├── proposal.md
├── design.md
├── specs/<capability>/spec.md
└── tasks.md
```

### 5. 生命周期闭环

Spec 生命周期在此完成：
```
brainstorming → delta spec → 实施（增量修改）→ 验证 → 主 spec 同步 → design doc 标注 → 归档
```

## 退出条件

- change 已归档（从活跃列表移除）
- 主 specs 已更新（delta → main 同步完成）
- 关联 design doc 已标注归档状态
- 关联 plan 已标注归档状态
- `.comet.yaml` 中 `archived` 已记录为 `true`
- **阶段守卫**：运行 `bash $COMET_GUARD <change-name> archive`，全部 PASS 后确认归档完整

归档完成后，在归档目录的 `.comet.yaml` 中更新：

```yaml
phase: archive
archived: true
```

【写入验证】更新完成后必须验证：
  cat openspec/changes/archive/YYYY-MM-DD-<name>/.comet.yaml
  确认 phase 行的值为 "archive"
  确认 archived 行的值为 "true"
  如任一字段不匹配，重试写入后再次验证。最多重试 2 次，仍失败则报告错误并终止。

## 完成

Comet 流程全部完成。如需开始新工作，调用 `/comet` 或 `/comet-open`。
