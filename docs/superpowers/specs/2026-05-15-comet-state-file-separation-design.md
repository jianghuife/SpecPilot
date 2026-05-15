# Comet 状态文件独立化设计

## 背景

当前 Comet 的工作流状态追踪寄生在 OpenSpec 的 `.openspec.yaml` 文件中，通过 `comet:` 子树命名空间实现共存。这带来了几个问题：

1. **耦合**：Comet 状态和 OpenSpec spec 内容共享同一个文件，"合并"语义完全依赖 AI agent 理解 SKILL.md 指令
2. **脆弱性**：AI agent 需要手动做部分 YAML 编辑，可能破坏 OpenSpec 自身的字段
3. **grep 解析困难**：`comet-guard.sh` 用简单的 grep 解析嵌套的 `comet.verify_result` 等字段，需要处理 `.` 作为嵌套层级

## 方案

将 `.openspec.yaml` 中的 `comet:` 子树完整提取到同目录下的独立文件 `.comet.yaml`。内容结构不变，只是换了容器，去掉 `comet:` 包裹层。

### 新文件结构

```
openspec/changes/<name>/
├── .openspec.yaml        # OpenSpec 专属（Comet 不再写入）
├── .comet.yaml           # Comet 专属（新建）
├── proposal.md
├── design.md
├── specs/<capability>/spec.md
└── tasks.md
```

### .comet.yaml 结构

从 `.openspec.yaml` 中提取的 `comet:` 子树内容，**去掉 `comet:` 包裹**，作为顶层字段：

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

字段含义不变：

| 字段 | 含义 |
|------|------|
| `workflow` | `full`、`hotfix` 或 `tweak` |
| `phase` | 当前阶段：`open`、`design`、`build`、`verify`、`archive` |
| `design_doc` | 关联的 Superpowers Design Doc 路径，可为 null |
| `plan` | 关联的 Superpowers Plan 路径，可为 null |
| `build_mode` | 已选择的执行方式，可为 null |
| `verify_mode` | `light` 或 `full`，可为 null |
| `verify_result` | `pending`、`pass` 或 `fail` |
| `verified_at` | 验证通过时间，可为 null |
| `archived` | change 是否已归档 |

## 变更清单

### 1. `assets/skills/comet/SKILL.md`

**Step 1（元数据读取）**：

- 修改前：读取 `openspec/changes/<name>/.openspec.yaml` 中的 `comet` 元数据
- 修改后：读取 `openspec/changes/<name>/.comet.yaml`

**Step 2（阶段判定）**：

- 所有 `comet.xxx` 引用改为直接引用 `.comet.yaml` 中的顶层字段
- "修正 `.openspec.yaml` 中的 `comet` 字段"改为"修正 `.comet.yaml`"

**推荐元数据结构**：去掉 `comet:` 包裹层，展示扁平结构

**错误处理**：`.openspec.yaml` 格式异常改为 `.comet.yaml` 格式异常

**文件结构参考图**：在 change 目录下新增 `.comet.yaml`

### 2. `assets/skills/comet-open/SKILL.md`

**Step 3（初始化 Comet 状态）**：

- 修改前：在 `.openspec.yaml` 中写入 `comet:` 子树
- 修改后：创建独立的 `.comet.yaml` 文件

### 3. `assets/skills/comet-design/SKILL.md`

**Step 2（更新 Comet 状态）**：

- 修改前：在 `.openspec.yaml` 中合并更新 `comet.phase` 和 `comet.design_doc`
- 修改后：在 `.comet.yaml` 中更新 `phase` 和 `design_doc`

### 4. `assets/skills/comet-build/SKILL.md`

**Step 2（更新计划状态）**：

- 修改前：在 `.openspec.yaml` 中合并更新
- 修改后：在 `.comet.yaml` 中更新

**Step 3（选择执行方式）**：

- 修改前：在 `.openspec.yaml` 中记录 `build_mode`
- 修改后：在 `.comet.yaml` 中记录 `build_mode`
- Few-shot 示例去掉 `comet:` 包裹层

**退出条件**：

- `.openspec.yaml` 中 `comet.phase` → `.comet.yaml` 中 `phase`

**退出前合并更新**：去掉 `comet:` 包裹层

### 5. `assets/skills/comet-verify/SKILL.md`

**Step 1（改动规模评估）**：

- 修改前：在 `.openspec.yaml` 中记录 `verify_mode`
- 修改后：在 `.comet.yaml` 中记录 `verify_mode`
- Few-shot 示例去掉 `comet:` 包裹层

**退出条件**：

- `.openspec.yaml` 中 `comet.verify_result` → `.comet.yaml` 中 `verify_result`

**退出前合并更新**：去掉 `comet:` 包裹层

### 6. `assets/skills/comet-archive/SKILL.md`

**前置条件**：

- `.openspec.yaml` 中 `comet.verify_result: pass` → `.comet.yaml` 中 `verify_result: pass`

**Step 1（执行归档）**：

- `comet.verify_result` 引用改为 `.comet.yaml` 的 `verify_result`

**退出条件**：

- `.openspec.yaml` 中 `comet.archived` → `.comet.yaml` 中 `archived`

**归档完成后更新**：在归档目录的 `.comet.yaml` 中更新，去掉 `comet:` 包裹层

**归档目录结构**：新增 `.comet.yaml`，`.openspec.yaml` 留给 OpenSpec

### 7. `assets/skills/comet-hotfix/SKILL.md`

**Step 1（快速开启）**：

- 修改前：在 `.openspec.yaml` 中写入 hotfix 状态
- 修改后：创建独立的 `.comet.yaml` 文件，去掉 `comet:` 包裹层

**Step 3（验证）**：

- `comet.verify_result` 引用改为 `.comet.yaml` 的 `verify_result`

**Step 4（归档）**：

- `comet.verify_result: pass` 引用改为 `.comet.yaml` 的 `verify_result`

### 8. `assets/skills/comet-tweak/SKILL.md`

**Step 1（快速开启）**：

- 修改前：在 `.openspec.yaml` 中写入 tweak 状态
- 修改后：创建独立的 `.comet.yaml` 文件，去掉 `comet:` 包裹层

**Step 3（轻量验证）**：

- `comet.verify_result` 引用改为 `.comet.yaml` 的 `verify_result`

**Step 4（归档）**：

- `comet.verify_result: pass` 引用改为 `.comet.yaml` 的 `verify_result`

### 9. `assets/skills/comet/scripts/comet-guard.sh`

**yaml_has_field / yaml_field_value 函数**：

- 修改前：读取 `$CHANGE_DIR/.openspec.yaml`
- 修改后：读取 `$CHANGE_DIR/.comet.yaml`

**verify_result_is_pass 函数**：

- 修改前：`yaml_field_value "comet.verify_result"`（需要 grep 处理带 `.` 的嵌套字段名）
- 修改后：`yaml_field_value "verify_result"`（直接匹配顶层字段，grep 逻辑不变但更简单）

**guard_design 函数**：

- 修改前：`yaml_field_value "comet.design_doc"`
- 修改后：`yaml_field_value "design_doc"`

**错误提示**：

- 修改前：`No design_doc recorded in .openspec.yaml`
- 修改后：`No design_doc recorded in .comet.yaml`

## 不变的部分

- `.openspec.yaml` 本身仍然存在，OpenSpec 继续独立管理它
- Comet 不再向 `.openspec.yaml` 写入任何内容
- `comet-guard.sh` 的整体架构和检查逻辑不变，只是读取目标文件路径改变
- TypeScript 代码（`src/`）无需修改，因为它不涉及 `.openspec.yaml` 的读写
- `assets/manifest.json` 无需修改
