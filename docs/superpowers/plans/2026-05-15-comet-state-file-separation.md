# Comet 状态文件独立化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Comet 工作流状态从 `.openspec.yaml` 的 `comet:` 子树提取到独立的 `.comet.yaml` 文件中，实现 Comet 与 OpenSpec 的状态追踪解耦。

**Architecture:** 每个变更都遵循同一模式：将 `.openspec.yaml` 中 `comet:` 嵌套子树的读写改为独立的 `.comet.yaml` 顶层字段的读写。涉及 8 个 SKILL.md 文件和 1 个 bash 脚本，共 34 处引用需要修改。

**Tech Stack:** Markdown (SKILL.md)、Bash (comet-guard.sh)、YAML (.comet.yaml)

**Design Spec:** `docs/superpowers/specs/2026-05-15-comet-state-file-separation-design.md`

**约束：不修改 OpenSpec 和 Superpowers 的原始技能。** 仅修改 Comet 自有的技能文件（assets/skills/comet*/）。

---

## Context

Comet 当前将工作流状态（phase、workflow、verify_result 等）写入 OpenSpec 的 `.openspec.yaml` 文件内的 `comet:` 子树。这导致 Comet 和 OpenSpec 耦合在同一个文件中，AI agent 需要手动做部分 YAML 编辑才能更新 Comet 状态，可能破坏 OpenSpec 自身的字段。本计划将这些状态提取到每个 change 目录下的独立 `.comet.yaml` 文件中。

关键注意：`openspec-archive-change` 是 OpenSpec 的技能，它不知道 `.comet.yaml` 的存在。因此 `comet-archive` 必须在 OpenSpec 归档操作之后，自己负责将 `.comet.yaml` 移动到归档目录。

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `assets/skills/comet/scripts/comet-guard.sh` | Modify | 守卫脚本 — YAML 读取目标文件和字段名 |
| `assets/skills/comet/SKILL.md` | Modify | 主调度器 — 阶段检测、元数据读取、阶段判定 |
| `assets/skills/comet-open/SKILL.md` | Modify | 阶段 1 — 初始化 .comet.yaml |
| `assets/skills/comet-design/SKILL.md` | Modify | 阶段 2 — 更新 phase/design_doc |
| `assets/skills/comet-build/SKILL.md` | Modify | 阶段 3 — 更新 plan/build_mode/phase |
| `assets/skills/comet-verify/SKILL.md` | Modify | 阶段 4 — 更新 verify_mode/verify_result |
| `assets/skills/comet-archive/SKILL.md` | Modify | 阶段 5 — 移动 .comet.yaml 到归档目录并更新 |
| `assets/skills/comet-hotfix/SKILL.md` | Modify | Hotfix 预设 — 初始化和状态引用 |
| `assets/skills/comet-tweak/SKILL.md` | Modify | Tweak 预设 — 初始化和状态引用 |

---

## Task 1: 更新 comet-guard.sh

**Files:**
- Modify: `assets/skills/comet/scripts/comet-guard.sh`

- [ ] **Step 1: 修改 yaml_has_field 函数（第 45 行）**

将 `.openspec.yaml` 改为 `.comet.yaml`：
```bash
local yaml="$CHANGE_DIR/.comet.yaml"
```

- [ ] **Step 2: 修改 yaml_field_value 函数（第 51 行）**

将 `.openspec.yaml` 改为 `.comet.yaml`：
```bash
local yaml="$CHANGE_DIR/.comet.yaml"
```

- [ ] **Step 3: 修改 verify_result_is_pass 函数（第 70 行）**

将嵌套字段名 `comet.verify_result` 改为顶层字段名 `verify_result`：
```bash
result=$(yaml_field_value "verify_result" 2>/dev/null || true)
```

- [ ] **Step 4: 修改 guard_design 函数（第 89 行和第 97 行）**

将嵌套字段名改为顶层字段名，更新提示文本：
```bash
# 第 89 行
design_doc=$(yaml_field_value "design_doc" 2>/dev/null || true)

# 第 97 行
warn "  [WARN] No design_doc recorded in .comet.yaml"
```

- [ ] **Step 5: Commit**

```bash
git add assets/skills/comet/scripts/comet-guard.sh
git commit -m "refactor: guard script reads from .comet.yaml instead of .openspec.yaml"
```

---

## Task 2: 更新 comet/SKILL.md（主调度器）

**Files:**
- Modify: `assets/skills/comet/SKILL.md`

- [ ] **Step 1: 修改 Step 1 元数据读取说明（第 68 行）**

将：
```
优先读取 `openspec/changes/<name>/.openspec.yaml` 中的 `comet` 元数据。若该字段不存在，再回退到...
```
改为：
```
优先读取 `openspec/changes/<name>/.comet.yaml`。若该文件不存在，再回退到 `openspec status --change "<name>" --json`、`tasks.md` 和 `docs/superpowers/` 文件检查。
```

- [ ] **Step 2: 修改推荐元数据结构（第 72-83 行）**

去掉 `comet:` 包裹层，改为顶层字段：
```yaml
workflow: full
phase: build
design_doc: docs/superpowers/specs/YYYY-MM-DD-topic-design.md
plan: docs/superpowers/plans/YYYY-MM-DD-feature.md
build_mode: subagent-driven-development
verify_mode: light
verify_result: pending
verified_at: null
archived: false
```

- [ ] **Step 3: 修改 Step 2 阶段判定（第 103-108 行）**

去掉所有 `comet.` 前缀：
```
1. **`archived: true` 或 change 已移入 archive** → 流程已完成
2. **`verify_result: pass` 且 `archived` 不是 `true`** → 调用 `/comet-archive`
3. **`phase: verify` 或 tasks.md 全部勾选** → 调用 `/comet-verify`
4. **`phase: build` 或已有 Design Doc 但计划/执行未完成** → 调用 `/comet-build`
5. **`phase: design` 或有 change 但无 Design Doc** → 调用 `/comet-design`
```

- [ ] **Step 4: 修改冲突修正说明（第 110 行）**

```
如果元数据与文件状态冲突，以可验证的文件状态为准，并在继续阶段前修正 `.comet.yaml`。
```

- [ ] **Step 5: 修改错误处理表格（第 153 行）**

```
| `.comet.yaml` 格式异常或缺失 | 以文件状态为准（tasks.md、docs/superpowers/），修正元数据后继续 |
```

- [ ] **Step 6: 修改文件结构参考图（第 180 行附近）**

在 change 目录结构中 `.openspec.yaml` 后新增 `.comet.yaml`：
```
│   │   ├── .openspec.yaml
│   │   ├── .comet.yaml
```

- [ ] **Step 7: Commit**

```bash
git add assets/skills/comet/SKILL.md
git commit -m "refactor: main dispatcher reads comet state from .comet.yaml"
```

---

## Task 3: 更新 comet-open/SKILL.md

**Files:**
- Modify: `assets/skills/comet-open/SKILL.md`

- [ ] **Step 1: 修改 change 目录结构图（第 28 行）**

在 `.openspec.yaml` 后新增 `.comet.yaml`：
```
├── .openspec.yaml
├── .comet.yaml
```

- [ ] **Step 2: 修改 Step 3 初始化说明和 YAML 示例（第 56-69 行）**

将：
```markdown
在 `openspec/changes/<name>/.openspec.yaml` 中写入或合并以下元数据：

```yaml
comet:
  workflow: full
  phase: design
  ...
```
改为：
```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add assets/skills/comet-open/SKILL.md
git commit -m "refactor: comet-open creates .comet.yaml instead of writing to .openspec.yaml"
```

---

## Task 4: 更新 comet-design/SKILL.md

**Files:**
- Modify: `assets/skills/comet-design/SKILL.md`

- [ ] **Step 1: 修改 Step 2 状态更新（第 42-48 行）**

将：
```markdown
在 `openspec/changes/<name>/.openspec.yaml` 中合并更新：

```yaml
comet:
  phase: build
  design_doc: docs/superpowers/specs/YYYY-MM-DD-topic-design.md
```
改为：
```markdown
在 `openspec/changes/<name>/.comet.yaml` 中更新：

```yaml
phase: build
design_doc: docs/superpowers/specs/YYYY-MM-DD-topic-design.md
```
```

- [ ] **Step 2: Commit**

```bash
git add assets/skills/comet-design/SKILL.md
git commit -m "refactor: comet-design writes state to .comet.yaml"
```

---

## Task 5: 更新 comet-build/SKILL.md

**Files:**
- Modify: `assets/skills/comet-build/SKILL.md`

- [ ] **Step 1: 修改 Step 2 状态更新（第 33-39 行）**

将 `.openspec.yaml` 改为 `.comet.yaml`，去掉 `comet:` 包裹：
```yaml
phase: build
plan: docs/superpowers/plans/YYYY-MM-DD-feature.md
```

- [ ] **Step 2: 修改 Step 3 执行方式记录（第 55-73 行）**

将 `.openspec.yaml` 改为 `.comet.yaml`，Few-shot 示例去掉 `comet:` 包裹：
```yaml
# 用户选择稳健模式 / A
build_mode: subagent-driven-development
```
```yaml
# 用户选择快速模式 / B
build_mode: executing-plans
```

- [ ] **Step 3: 修改退出条件（第 108 行）**

将 `.openspec.yaml` 中 `comet.phase` 改为 `.comet.yaml` 中 `phase`。

- [ ] **Step 4: 修改退出前更新（第 111-117 行）**

去掉 `comet:` 包裹：
```yaml
phase: verify
verify_result: pending
```

- [ ] **Step 5: Commit**

```bash
git add assets/skills/comet-build/SKILL.md
git commit -m "refactor: comet-build writes state to .comet.yaml"
```

---

## Task 6: 更新 comet-verify/SKILL.md

**Files:**
- Modify: `assets/skills/comet-verify/SKILL.md`

- [ ] **Step 1: 修改 Step 1 规模评估（第 28-49 行）**

将 `.openspec.yaml` 改为 `.comet.yaml`，Few-shot 示例去掉 `comet:` 包裹：
```yaml
# 全部指标命中"小"
phase: verify
verify_mode: light
verify_result: pending
```
```yaml
# 任一指标命中"大"
phase: verify
verify_mode: full
verify_result: pending
```

- [ ] **Step 2: 修改退出条件（第 116 行）**

将 `.openspec.yaml` 中 `comet.verify_result` 改为 `.comet.yaml` 中 `verify_result`。

- [ ] **Step 3: 修改退出前更新（第 119-126 行）**

去掉 `comet:` 包裹：
```yaml
phase: archive
verify_result: pass
verified_at: YYYY-MM-DD
```

- [ ] **Step 4: Commit**

```bash
git add assets/skills/comet-verify/SKILL.md
git commit -m "refactor: comet-verify writes state to .comet.yaml"
```

---

## Task 7: 更新 comet-archive/SKILL.md

**Files:**
- Modify: `assets/skills/comet-archive/SKILL.md`

**关键注意**：`openspec-archive-change` 是 OpenSpec 的技能，它不知道 `.comet.yaml` 的存在，归档时不会移动该文件。`comet-archive` 必须在 OpenSpec 归档操作完成后，自己负责将 `.comet.yaml` 移动到归档目录并更新其内容。

- [ ] **Step 1: 修改前置条件（第 12 行）**

将 `openspec/changes/<name>/.openspec.yaml` 中 `comet.verify_result: pass` 改为 `openspec/changes/<name>/.comet.yaml` 中 `verify_result: pass`。

- [ ] **Step 2: 修改归档步骤中的引用（第 18 行）**

将 `` `comet.verify_result` `` 改为 `` `verify_result` ``。

- [ ] **Step 3: 在 Step 1（执行归档）之后新增 Step：移动 .comet.yaml**

在 `openspec-archive-change` 技能执行完毕后（即 OpenSpec 完成归档移动后），Comet 需要自己将 `.comet.yaml` 移动到归档目录。在 Step 1 和 Step 2（Delta Spec 同步）之间新增以下内容：

```markdown
### 1b. 移动 Comet 状态文件

`openspec-archive-change` 不感知 `.comet.yaml`，因此 Comet 需要在 OpenSpec 归档完成后自行移动该文件：

```bash
mv openspec/changes/<name>/.comet.yaml openspec/changes/archive/YYYY-MM-DD-<name>/.comet.yaml
```
```

- [ ] **Step 4: 修改归档目录结构图（第 72-79 行）**

在 `.openspec.yaml` 后新增 `.comet.yaml`：
```
openspec/changes/archive/YYYY-MM-DD-<name>/
├── .openspec.yaml
├── .comet.yaml
├── proposal.md
├── design.md
├── specs/<capability>/spec.md
└── tasks.md
```

- [ ] **Step 5: 修改退出条件（第 95 行）**

将 `.openspec.yaml` 中 `comet.archived` 改为 `.comet.yaml` 中 `archived`。

- [ ] **Step 6: 修改归档完成后更新说明（第 98-104 行）**

改为在归档目录的 `.comet.yaml` 中更新，去掉 `comet:` 包裹：
```yaml
phase: archive
archived: true
```

- [ ] **Step 7: Commit**

```bash
git add assets/skills/comet-archive/SKILL.md
git commit -m "refactor: comet-archive moves .comet.yaml to archive dir and updates state"
```

---

## Task 8: 更新 comet-hotfix/SKILL.md

**Files:**
- Modify: `assets/skills/comet-hotfix/SKILL.md`

- [ ] **Step 1: 修改 Step 1 状态初始化（第 37-50 行）**

将 "在 `.openspec.yaml` 中写入或合并" 改为 "在 `openspec/changes/<name>/` 下创建独立的 `.comet.yaml` 文件"，去掉 `comet:` 包裹。

- [ ] **Step 2: 修改 Step 3 验证引用（第 90 行）**

将 `` `comet.verify_result` `` 改为 "`.comet.yaml` 的 `verify_result`"。

- [ ] **Step 3: 修改 Step 4 归档引用（第 94 行）**

将 `` `comet.verify_result: pass` `` 改为 "`.comet.yaml` 中 `verify_result: pass`"。

- [ ] **Step 4: Commit**

```bash
git add assets/skills/comet-hotfix/SKILL.md
git commit -m "refactor: comet-hotfix creates .comet.yaml instead of writing to .openspec.yaml"
```

---

## Task 9: 更新 comet-tweak/SKILL.md

**Files:**
- Modify: `assets/skills/comet-tweak/SKILL.md`

- [ ] **Step 1: 修改 Step 1 状态初始化（第 38-51 行）**

将 "在 `.openspec.yaml` 中写入或合并" 改为 "在 `openspec/changes/<name>/` 下创建独立的 `.comet.yaml` 文件"，去掉 `comet:` 包裹。

- [ ] **Step 2: 修改 Step 3 验证引用（第 76 行）**

将 `` `comet.verify_result` `` 改为 "`.comet.yaml` 的 `verify_result`"。

- [ ] **Step 3: 修改 Step 4 归档引用（第 80 行）**

将 `` `comet.verify_result: pass` `` 改为 "`.comet.yaml` 中 `verify_result: pass`"。

- [ ] **Step 4: Commit**

```bash
git add assets/skills/comet-tweak/SKILL.md
git commit -m "refactor: comet-tweak creates .comet.yaml instead of writing to .openspec.yaml"
```

---

## Verification

完成所有 Task 后，执行以下验证：

1. **残留 `comet:` 嵌套引用检查**：

```bash
grep -rn "comet:" assets/skills/ | grep -v "^.*:.*name: comet" | grep -v "^.*:.*comet-guard" | grep -v "^.*:.*comet-open" | grep -v "^.*:.*comet-design" | grep -v "^.*:.*comet-build" | grep -v "^.*:.*comet-verify" | grep -v "^.*:.*comet-archive" | grep -v "^.*:.*comet-hotfix" | grep -v "^.*:.*comet-tweak" | grep -v "^.*:.*comet/state"
```
预期：无输出。

2. **残留 `.openspec.yaml` 的 comet 引用检查**：

```bash
grep -rn "\.openspec\.yaml" assets/skills/ | grep -i comet
```
预期：无输出。

3. **`.comet.yaml` 引用覆盖检查**：

```bash
grep -rn "\.comet\.yaml" assets/skills/
```
预期：9 个文件均有引用。

4. **Guard 脚本语法检查**：

```bash
bash -n assets/skills/comet/scripts/comet-guard.sh
```
预期：无输出（语法正确）。

5. **保存计划到项目目录**：

将计划文件保存到 `docs/superpowers/plans/2026-05-15-comet-state-file-separation.md` 并提交。
