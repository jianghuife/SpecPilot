# Comet 状态统一设计

> 将所有 `.comet.yaml` 状态操作统一收拢到单一脚本，彻底消除 agent 手动编辑 YAML。

## 问题

Agent 当前通过原始 `sed -i` 命令和手动创建 YAML 文件来编辑 `.comet.yaml`。这带来多种故障模式：

1. **字段拼写错误** — `sed -i 's|^build_mode:.*|build_mode: subagent-dev|'` 会静默写入无效枚举值
2. **字段遗漏** — agent 在创建 `.comet.yaml` 时忘记某个字段
3. **格式错误** — 引号、空格、行尾不一致
4. **入口验证漂移** — 各 skill 的 Step 0 检查清单是文字描述，agent 需自行解读并实现；随着时间推移，实现与规范产生偏差
5. **规模评估歧义** — comet-verify 的 light/full 判断规则是自然语言，agent 解读不一致

## 方案

引入 `comet-state.sh` — 单一脚本作为所有 `.comet.yaml` 状态交互的**唯一接口**。Agent 不再直接使用 `sed`、`echo >` 或 `cat | grep` 操作 YAML 文件。

## 脚本设计

### 位置

`assets/skills/comet/scripts/comet-state.sh`

### 子命令

#### `init <变更名> <工作流>`

根据工作流类型创建 `.comet.yaml`，自动填入合理的默认值。

**各工作流默认值：**

| 字段 | `full` | `hotfix` | `tweak` |
|------|--------|----------|---------|
| `workflow` | full | hotfix | tweak |
| `phase` | design | build | build |
| `design_doc` | null | null | null |
| `plan` | null | null | null |
| `build_mode` | null | direct | direct |
| `isolation` | null | branch | branch |
| `verify_mode` | null | light | light |
| `verify_result` | pending | pending | pending |
| `verified_at` | null | null | null |
| `archived` | false | false | false |

**行为：**
- 验证变更名称（仅允许字母数字 + 连字符 + 下划线，拒绝路径遍历）
- 如果 `.comet.yaml` 已存在则报错退出
- 输出创建确认及字段摘要

#### `set <变更名> <字段> <值>`

更新单个字段，内置枚举验证。

**枚举验证表：**

| 字段 | 允许值 |
|------|--------|
| `workflow` | `full`, `hotfix`, `tweak` |
| `phase` | `design`, `build`, `verify`, `archive` |
| `build_mode` | `subagent-driven-development`, `executing-plans`, `direct` |
| `isolation` | `branch`, `worktree` |
| `verify_mode` | `light`, `full` |
| `verify_result` | `pending`, `pass`, `fail` |
| `archived` | `true`, `false` |

**路径类字段**（`design_doc`, `plan`）：
- 接受任意非空字符串
- 可选验证文件是否存在（通过 `--check-exists` 标志）

**行为：**
- `.comet.yaml` 不存在时报错退出
- 字段名未知时报错退出
- 值违反枚举约束时报错退出
- 成功时：写入值，输出 `[SET] field=value` 确认

#### `get <变更名> <字段>`

读取单个字段值输出到 stdout。

**行为：**
- null 或缺失字段输出空字符串
- 文件不存在时输出错误到 stderr，exit 1
- 读取不做验证 — 原值输出

#### `check <变更名> <阶段>`

验证某阶段的入口条件。替代各 skill 的 Step 0 文字检查清单。

**各阶段规则（从现有 skill 检查清单提取）：**

| 阶段 | 检查项 |
|------|--------|
| `open` | `.comet.yaml` 不存在，变更目录可存在也可不存在 |
| `design` | `.comet.yaml` 存在，`phase=design`，`workflow=full`，`design_doc` 为 null/空，`proposal.md` 存在且非空，`design.md` 存在且非空 |
| `build` | `.comet.yaml` 存在，`phase=build`，`design_doc` 非空且文件存在，`proposal.md` 存在且非空，`tasks.md` 存在且非空 |
| `verify` | `.comet.yaml` 存在，`phase=verify`，`verify_result` 为 pending 或 null |
| `archive` | `.comet.yaml` 存在，`phase=archive`，`verify_result=pass`，`archived` 不为 true |

**输出格式：**
```
=== Entry Check: comet-<阶段> ===
  [PASS] .comet.yaml exists
  [PASS] phase=build (expected: build)
  [FAIL] design_doc file does not exist: docs/superpowers/specs/xxx.md
  [PASS] proposal.md exists and non-empty

BLOCKED — fix failing checks before proceeding
```

Exit 0 = 全部通过，exit 1 = 有失败项。

#### `scale <变更名>`

评估变更规模以确定验证模式。替代 comet-verify 的自然语言判断规则。

**读取指标：**
- 任务数量，从 `tasks.md` 统计（`- [ ]` + `- [x]` 行数）
- 增量规格数量，从 `openspec/changes/<name>/specs/*/spec.md` 统计
- 变更文件数量，从 git diff 统计（如果在 git 仓库中）

**判断规则（与当前逻辑一致，仅脚本化）：**

| 指标 | 阈值 | 结果 |
|------|------|------|
| 任务数 | > 3 | `full` |
| 增量规格 | > 1 个能力 | `full` |
| 变更文件 | > 5 | `full` |
| 全部低于阈值 | — | `light` |

任一指标达到"大"→ full。全部"小"→ light。

**输出：**
```
=== Scale Assessment: <name> ===
  Tasks: 5 (threshold: 3)
  Delta specs: 2 capabilities (threshold: 1)
  → Result: full
```

**副作用：** 自动设置 `.comet.yaml` 中的 `verify_mode` 字段。

## Skill 改造方案

### comet-open

```bash
# 改造前：手动创建 YAML（约 15 行内容）
# 改造后：
bash $COMET_STATE init <name> full
```

### comet-design

```bash
# 改造前：sed -i 's|^design_doc:.*|design_doc: ...|' .comet.yaml
# 改造后：
bash $COMET_STATE set <name> design_doc docs/superpowers/specs/YYYY-MM-DD-topic-design.md
```

### comet-build

```bash
# 记录计划路径
bash $COMET_STATE set <name> plan docs/superpowers/plans/YYYY-MM-DD-feature.md

# 用户选择隔离方式 → 记录选择
bash $COMET_STATE set <name> isolation branch

# 用户选择构建模式 → 记录选择
bash $COMET_STATE set <name> build_mode subagent-driven-development
```

注意：isolation 和 build_mode 保持**用户可选**。脚本只负责带验证地记录选择结果。

### comet-verify

```bash
# 入口检查
bash $COMET_STATE check <name> verify

# 规模评估（自动设置 verify_mode）
bash $COMET_STATE scale <name>

# 验证通过后
bash $COMET_STATE set <name> verify_result pass
```

### comet-archive

`comet-archive.sh` 内部改造为使用 `comet-state.sh get/set` 替代直接 `grep`/`sed` 操作 YAML。

### comet-hotfix / comet-tweak

```bash
# 改造前：手动创建带预设值的 YAML
# 改造后：
bash $COMET_STATE init <name> hotfix  # 或 tweak
```

### comet（主入口）

自修复逻辑使用 `set` 替代原始 `sed`：
```bash
bash $COMET_STATE set <name> phase <correct-phase>
```

## 架构

三层脚本体系：

```
comet-state.sh          ← agent 唯一的状态交互接口（CRUD + 检查 + 评估）
  ├── 内部调用 → comet-yaml-validate.sh  ← schema 校验
  └── 被调用 → comet-guard.sh           ← 阶段流转（内部使用 state.sh set）
                comet-archive.sh          ← 归档流程（内部使用 state.sh get/set）
```

- **comet-state.sh** 是面向 agent 的公共 API
- **comet-guard.sh** 和 **comet-archive.sh** 内部使用 state.sh 完成各自的状态操作
- **comet-yaml-validate.sh** 保持底层 schema 校验角色，被 state.sh 在写入后调用

## 对 SKILL.md 文件的影响

全部 8 个 skill 文件更新：

1. **Step 0（入口验证）** — 文字检查清单替换为单条 `bash $COMET_STATE check <name> <phase>` 命令
2. **状态创建** — YAML 模板块替换为 `bash $COMET_STATE init <name> <workflow>`
3. **字段更新** — `sed -i` 命令替换为 `bash $COMET_STATE set <name> <field> <value>`
4. **字段读取** — `grep`/`sed` 解析替换为 `bash $COMET_STATE get <name> <field>`
5. **规模评估** — 自然语言规则替换为 `bash $COMET_STATE scale <name>`

英文版（`assets/skills/`）和中文版（`assets/skills-zh/`）同步更新。

## 不在范围内

- 修改 guard `--apply` 行为 — 继续处理阶段流转，内部改为使用 state.sh
- 新增阶段或字段到 `.comet.yaml`
- 修改归档流程逻辑 — 仅内部实现改用 state.sh
- 自动选择 isolation/build_mode — 保持用户选择
