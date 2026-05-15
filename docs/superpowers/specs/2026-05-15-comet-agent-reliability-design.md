# Comet SKILL.md Agent 可靠性强化设计

## 背景

Comet 的 8 个 SKILL.md 文件是 AI agent 执行工作流的唯一指令来源。当前已有一道防线 `comet-guard.sh` 在阶段转换时做出口校验（preflight + 业务规则），但在 agent 实际执行过程中仍存在三类故障模式：

1. **A — 忘记更新 `.comet.yaml`**：agent 完成了阶段工作但未更新 `phase` 等字段，导致下一个 agent 读到旧状态
2. **B — YAML 写入格式错误**：缩进、字段遗漏等问题，导致 guard 脚本 grep 解析失败（历史上 `verify_result` 缩进 bug 即属此类）
3. **C — 在错误前提下启动阶段**：agent 跳过前置步骤，在缺失必要文件的条件下开始执行

当前 `comet-guard.sh` 的 preflight 虽已做了基本校验，但它只在阶段**出口**生效。agent 在执行过程中写入 `.comet.yaml` 和启动阶段时，没有额外的防护。

## 方案概述

在 `comet-guard.sh`（出口校验）基础上增加三道防线，形成纵深防护：

```
agent 启动 skill
    │
    ▼
┌──────────────────────────┐
│ 防线 1: Entry Verify     │  SKILL.md Step 0 — 入口硬校验
└──────┬───────────────────┘
       │ pass
       ▼
┌──────────────────────────┐
│ 防线 2: Write-then-Verify│  SKILL.md 写入指令 — 每次写入后读回确认
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│ 防线 3: Schema Validate  │  comet-yaml-validate.sh — 结构兜底
│ 防线 4 (已有): Guard     │  comet-guard.sh — 出口业务校验
└──────────────────────────┘
```

## 组件一：入口自校验 (Entry Self-Verification)

### 设计

每个 SKILL.md 新增 **Step 0: 入口状态验证** 作为第一步指令。在任何实际操作之前，agent 必须读取 `.comet.yaml` 并校验前置条件。不符合预期时输出 `[HARD STOP]` 并立即终止，不得继续执行。

### 各 Skill 入口条件

| Skill | 前置条件 |
|---|---|
| **comet-open** | `openspec/changes/<name>/.comet.yaml` 不存在；`proposal.md`、`design.md`、`tasks.md` 存在（由 openspec-new-change 创建） |
| **comet-design** | `phase == "design"`；`workflow == "full"`；`design_doc` 为 null 或空字符串；`proposal.md`、`design.md`、`tasks.md` 存在 |
| **comet-build** | `phase == "build"`；`design_doc` 非 null 且引用的文件存在；`proposal.md`、`tasks.md` 存在 |
| **comet-verify** | `phase == "verify"`；`verify_result` 为 `pending` 或 null（未重复验证） |
| **comet-archive** | `phase == "archive"`；`verify_result == "pass"`；`archived` 为 `false` 或 null |
| **comet-hotfix** | `openspec/changes/<name>/` 目录不存在，或目录存在但 `.comet.yaml` 不存在 |
| **comet-tweak** | `openspec/changes/<name>/` 目录不存在，或目录存在但 `.comet.yaml` 不存在 |

### 失败输出格式

```
[HARD STOP] Entry check failed for comet-design
  Expected: phase=design, design_doc=<empty>, workflow=full
  Actual:   phase=build, design_doc=docs/superpowers/specs/2026-05-15-foo.md, workflow=full
  Suggestion: Run comet-build instead, or check if .comet.yaml was modified out of sequence.
```

### 与 comet-guard.sh preflight 的关系

| 维度 | Entry Verify (SKILL.md) | preflight (comet-guard.sh) |
|---|---|---|
| 触发时机 | Skill 启动时，实际操作前 | Skill 退出时，阶段转换后 |
| 校验内容 | 当前 phase + 前置产物存在性 | 目标 phase + phase 一致性 |
| 失败行为 | `[HARD STOP]` 终止 agent | `exit 1` 阻止阶段转换 |
| 防护对象 | 阻止在错误状态启动 | 阻止写入不合格的状态 |

两者互补，不冗余。

## 组件二：写入即验证 (Write-then-Verify)

### 问题

agent 写入 `.comet.yaml` 时可能产生格式错误（YAML 缩进、字段遗漏），且 agent 可能写完后就认为任务完成，不确认写入是否成功。

### 设计

所有 `.comet.yaml` 写入指令后强制追加标准化的验证步骤：

**当前写法：**
```
退出前在 .comet.yaml 中合并更新以下字段（保留其他字段不变）：
- phase: build
- design_doc: docs/superpowers/specs/YYYY-MM-DD-topic-design.md
```

**新写法：**
```
退出前在 .comet.yaml 中合并更新以下字段（保留其他字段不变）：
- phase: build
- design_doc: docs/superpowers/specs/YYYY-MM-DD-topic-design.md

【写入验证】更新完成后必须验证：
  cat openspec/changes/<name>/.comet.yaml
  确认 phase 行的值为 "build"
  确认 design_doc 行的值为 "docs/superpowers/specs/YYYY-MM-DD-topic-design.md"
  如任一字段不匹配，重试写入后再次验证。最多重试 2 次，仍失败则报告错误并终止。
```

### 涉及位置（全量）

| 文件 | 写入场景 | 写入次数 |
|---|---|---|
| comet-open | 首次创建 `.comet.yaml`（8 字段） | 1 |
| comet-design | 退出：更新 phase → build, design_doc | 1 |
| comet-build | 写 plan；写 build_mode；退出：更新 phase → verify | 3 |
| comet-verify | 写 verify_mode；退出：verify_result + verified_at | 2 |
| comet-archive | 退出：phase → archive, archived → true | 1 |
| comet-hotfix | 创建 + 阶段内多次更新 | ~4 |
| comet-tweak | 创建 + 阶段内多次更新 | ~3 |
| **合计** | | **~15 处** |

### 设计要点

- 验证指令紧接写入指令，同一段落内，agent 不会因翻页而遗漏
- 字段值写成具体文本（如 `"build"`），不写成变量引用（如 `与上面一致`），迫使 agent 逐字比对
- 写入与验证之间不穿插其他操作，降低上下文窗口内的注意力分散
- 写入操作本身沿用已有的"合并更新"语义（保留其他字段不变），不做变更

## 组件三：Schema 校验脚本 (comet-yaml-validate.sh)

### 定位

纯结构校验脚本，与 `comet-guard.sh` 分工明确：

| 脚本 | 职责 |
|---|---|
| `comet-guard.sh` | 业务校验：phase 转换合法性、task 完成度、编译通过 |
| `comet-yaml-validate.sh` | 结构校验：字段存在性、枚举值合法性、路径有效性 |

### 接口

```bash
bash comet-yaml-validate.sh <change-name>
# exit 0: 校验通过
# exit 1: 有问题，stderr 输出完整错误列表
```

### 校验规则

| 类别 | 规则 |
|---|---|
| **必填字段** | `workflow`, `phase`, `design_doc`, `plan`, `build_mode`, `verify_mode`, `verify_result`, `verified_at`, `archived` 九个键必须存在（值可为空/null） |
| **枚举值** | `workflow` ∈ {full, hotfix, tweak}；`phase` ∈ {design, build, verify, archive}；`verify_mode` ∈ {light, full, 空}；`verify_result` ∈ {pending, pass, fail, 空}；`build_mode` ∈ {subagent-driven-development, executing-plans, direct, 空}；`archived` ∈ {true, false} |
| **路径有效性** | `design_doc` 非空时对应文件必须存在；`plan` 非空时对应文件必须存在 |
| **未知键** | 发现不在已知列表中的顶级键时输出警告（不阻塞） |

### 输出设计

先收集所有错误，统一输出（不遇错即停），方便 agent 一次性修复全部问题：

```
[VALIDATE] openspec/changes/add-login/.comet.yaml
  FAIL: missing required field 'build_mode'
  FAIL: phase='arhive' is not a valid phase. Expected: design|build|verify|archive
  WARN: unknown field 'debug_mode' found
  2 errors, 1 warning — validation FAILED
```

### 部署

- 位置：`assets/skills/comet/scripts/comet-yaml-validate.sh`
- 注册：`assets/manifest.json` 新增条目 `"comet/scripts/comet-yaml-validate.sh"`
- 实现：纯 bash + grep，零外部依赖，与 `comet-guard.sh` 技术栈一致

### 集成

- **SKILL.md**：write-then-verify 的 manual read-back 之后，运行 `comet-yaml-validate.sh` 做结构校验（作为 read-back 的补充，捕获手动比对可能遗漏的问题如未知键、缺失字段）
- **comet-guard.sh**：preflight 末尾新增 `comet-yaml-validate.sh` 调用

## 受影响的文件

| 文件 | 变更内容 |
|---|---|
| `assets/skills/comet-open/SKILL.md` | 新增 Step 0 入口校验 + 创建写入处追加验证 |
| `assets/skills/comet-design/SKILL.md` | 新增 Step 0 入口校验 + 退出写入处追加验证 |
| `assets/skills/comet-build/SKILL.md` | 新增 Step 0 入口校验 + 3 处写入追加验证 |
| `assets/skills/comet-verify/SKILL.md` | 新增 Step 0 入口校验 + 2 处写入追加验证 |
| `assets/skills/comet-archive/SKILL.md` | 新增 Step 0 入口校验 + 退出写入处追加验证 |
| `assets/skills/comet-hotfix/SKILL.md` | 新增 Step 0 入口校验 + 4 处写入追加验证 |
| `assets/skills/comet-tweak/SKILL.md` | 新增 Step 0 入口校验 + 3 处写入追加验证 |
| `assets/skills/comet/scripts/comet-guard.sh` | preflight 末尾新增调用 `comet-yaml-validate.sh` |
| `assets/skills/comet/scripts/comet-yaml-validate.sh` | **新建**：schema 校验脚本 |
| `assets/manifest.json` | 新增 `comet/scripts/comet-yaml-validate.sh` |

## 不纳入范围

以下机制在本次设计中明确排除：

- **Checkpoint/断点续传（#2）**：comet-build 的子任务 checkpoint 需要 agent 每个子任务后更新 YAML，agent 容易遗忘，ROI 低。当前 `comet-guard.sh` preflight 和入口校验已能覆盖中断恢复场景。
- **Idempotency 保护（#4）**：重复执行同一 phase 的副作用（如覆盖已生成的 design doc）在实际使用中极少出现，且当前入口校验的 phase 检查已能阻止大部分误入场景。
- **Key Command 验证（#5）**：每个关键 shell 命令后追加验证会严重膨胀 SKILL.md 长度。当前 Write-then-Verify 已覆盖最关键的写入操作，其余命令的静默失败由 agent 自身判断。
