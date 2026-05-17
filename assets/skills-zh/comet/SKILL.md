---
name: comet
description: "Comet — OpenSpec + Superpowers 双星开发流程。用 /comet 启动，自动检测阶段并分发到子命令。五阶段：开启 → 深度设计 → 计划与构建 → 验证与收尾 → 归档。"
---

# Comet — OpenSpec + Superpowers 双星开发流程

OpenSpec 与 Superpowers 如双星系统围绕同一目标运转。

```
OpenSpec 负责 WHAT  — 大纲、提案、spec 生命周期、归档
Superpowers 负责 HOW — 技术设计、计划、执行、收尾
```

**核心原则：brainstorming 必不可跳过。每次变更都必须经过深度设计（hotfix 和 tweak preset 除外）。**

---

## 决策核心（Decision Core）

agent 做决策只需读本节，参考附录按需查阅。

### 阶段自动检测

**Step 0: 活跃 Change 发现**

1. 运行 `openspec list --json` 获取所有活跃 change
2. 对每个 change，检查 `docs/superpowers/specs/` 和 `docs/superpowers/plans/` 匹配关联文件，判断阶段和进度

| 情况 | 行为 |
|------|------|
| 无活跃 change | → 调用 `/comet-open` |
| 恰好 1 个活跃 change | → 自动选中，进入 Step 1 |
| 多个活跃 change | → 列出清单让用户选择 |

**Preset 检测**：
- 用户明确描述为 bug fix / 热修复 + 满足 hotfix 条件 → 直接 `/comet-hotfix`
- 用户明确描述为文案/配置/文档/prompt 小调整 + 满足 tweak 条件 → 直接 `/comet-tweak`

**Step 1: 读取 `.comet.yaml` 状态元数据**

优先读取 `openspec/changes/<name>/.comet.yaml`。不存在时回退到 `openspec status --change "<name>" --json`、`tasks.md` 和 `docs/superpowers/` 文件检查。

**Step 2: 阶段判定**（按顺序，命中即停）

1. `archived: true` 或 change 已移入 archive → 流程已完成
2. `verify_result: pass` 且 `archived` 不是 `true` → `/comet-archive`
3. `phase: verify` 或 tasks.md 全部勾选 → `/comet-verify`
4. `phase: build` 或已有 Design Doc 但计划/执行未完成 → `/comet-build`
5. `phase: design` 或有 change 但无 Design Doc → `/comet-design`
6. 无活跃 change 或状态无法判定 → `/comet-open`

如果元数据与文件状态冲突，以文件状态为准，修正 `.comet.yaml` 后继续。

### 预设升级条件

**hotfix → full**（满足任一即升级）：
- 改动涉及 **3+ 文件**
- 涉及架构变更（新模块、新接口、新依赖）
- 涉及数据库 schema 变更
- 修复引入新的 public API
- 修复范围超出单一函数/模块

**tweak → full**（满足任一即升级）：
- 改动涉及 **5+ 文件**
- 涉及多个模块的协调修改
- 需要新增测试用例 **5+**
- 涉及配置项的新增或删除（非值修改）

### 错误处理速查

| 场景 | 处理方式 |
|------|---------|
| `openspec list --json` 失败 | 检查 openspec 是否已安装，提示 `openspec init` |
| 子 skill 不可用 | 停止流程，提示安装或启用对应 skill |
| `.comet.yaml` 格式异常或缺失 | 以文件状态为准，用 `bash $COMET_STATE set` 修正后继续 |
| Maven 编译/测试失败 | 返回 build 阶段修复，不进入 verify |
| change 目录结构不完整 | 按 `comet-open` 产物要求补齐 |

### 阶段衔接

<IMPORTANT>
单次 `/comet` 调用从检测到的阶段开始，退出条件满足后进入下一阶段。

流转链：open → design → build → verify → archive

需要用户参与的节点：
1. brainstorming 确认设计方案
2. build 阶段选择执行方式
3. verify 不通过时决定修复或接受偏差
4. finishing-branch 选择分支处理方式
5. 遇到升级条件（hotfix/tweak → 完整流程）

agent 不应跳过这些决策点；其他明确无歧义的阶段衔接可以继续推进。
</IMPORTANT>

---

## 子命令速查

| 命令 | 阶段 | 归属 | 产物 |
|------|------|------|------|
| `/comet-open` | 1. 开启 | OpenSpec | proposal.md、design.md、tasks.md |
| `/comet-design` | 2. 深度设计 | Superpowers | Design Doc、delta spec |
| `/comet-build` | 3. 计划与构建 | Superpowers | 实施计划、代码提交 |
| `/comet-verify` | 4. 验证与收尾 | Both | 验证报告、分支处理 |
| `/comet-archive` | 5. 归档 | OpenSpec | delta→main spec 同步、design doc 标注、归档 |
| `/comet-hotfix` | 预设路径 | Both | 快速修复（跳过 brainstorming） |
| `/comet-tweak` | 预设路径 | Both | 小改动（跳过 brainstorming 和完整 plan） |

```
/comet
  ↓ 自动检测
/comet-open ──→ /comet-design ──→ /comet-build ──→ /comet-verify ──→ /comet-archive
  (OpenSpec)      (Superpowers)     (Superpowers)     (Both)          (OpenSpec)

/comet-hotfix（预设路径，跳过 brainstorming）
  open ──→ build ──→ verify ──→ archive
    ↑ 如触发升级条件 → 补充 Design Doc → 回到完整流程

/comet-tweak（预设路径，跳过 brainstorming 和完整 plan）
  open ──→ lightweight build ──→ light verify ──→ archive
    ↑ 如触发升级条件 → 补充 Design Doc → 回到完整流程
```

---

## 参考附录（Reference Appendix）

### .comet.yaml 字段说明

```yaml
workflow: full
phase: build
design_doc: docs/superpowers/specs/YYYY-MM-DD-topic-design.md
plan: docs/superpowers/plans/YYYY-MM-DD-feature.md
build_mode: subagent-driven-development
isolation: branch
verify_mode: light
verify_result: pending
verified_at: null
archived: false
```

| 字段 | 含义 |
|------|------|
| `workflow` | `full`、`hotfix` 或 `tweak` |
| `phase` | 当前阶段：`open`、`design`、`build`、`verify`、`archive` |
| `design_doc` | 关联的 Superpowers Design Doc 路径，可为空 |
| `plan` | 关联的 Superpowers Plan 路径，可为空 |
| `build_mode` | 已选择的执行方式，可为空 |
| `isolation` | `branch` 或 `worktree`，工作区隔离方式，默认 `branch` |
| `verify_mode` | `light` 或 `full`，可为空 |
| `verify_result` | `pending`、`pass` 或 `fail` |
| `verified_at` | 验证通过时间，可为空 |
| `archived` | change 是否已归档 |

### 脚本定位

Comet 脚本随 skill 包分发在 `comet/scripts/` 下。**不硬编码路径** — 定位一次，缓存到环境变量：

```bash
COMET_GUARD="${COMET_GUARD:-$(find . -path '*/comet/scripts/comet-guard.sh' -type f -print -quit)}"
COMET_STATE="${COMET_STATE:-$(find . -path '*/comet/scripts/comet-state.sh' -type f -print -quit)}"
COMET_ARCHIVE="${COMET_ARCHIVE:-$(find . -path '*/comet/scripts/comet-archive.sh' -type f -print -quit)}"
```

**自动状态更新**：guard 支持 `--apply` 参数，验证通过后自动更新 `.comet.yaml` 状态字段：

```bash
bash "$COMET_GUARD" <change-name> <phase> --apply
```

**归档脚本**：一键完成归档全部步骤：

```bash
bash "$COMET_ARCHIVE" <change-name>
```

加载 comet 后，agent 应执行以上三条变量赋值一次，后续全程复用 `$COMET_GUARD`、`$COMET_STATE`、`$COMET_ARCHIVE`。

### 文件结构

```
openspec/                              # OpenSpec — WHAT
├── config.yaml
├── changes/
│   ├── <name>/                        # 活跃 change
│   │   ├── .openspec.yaml
│   │   ├── .comet.yaml
│   │   ├── proposal.md                # Why + What
│   │   ├── design.md                  # 高层架构决策
│   │   ├── specs/<capability>/spec.md # Delta 能力规格
│   │   └── tasks.md                   # 任务清单
│   └── archive/YYYY-MM-DD-<name>/     # 已归档
└── specs/<capability>/spec.md         # 主 specs（归档时从 delta 覆盖）

docs/superpowers/                      # Superpowers — HOW
├── specs/YYYY-MM-DD-<topic>-design.md # 设计文档（技术 RFC，归档时标注状态）
└── plans/YYYY-MM-DD-<feature>.md      # 实施计划（文件头含 change 关联元数据）
```

### 最佳实践

1. **brainstorming 不可跳过** — 每次变更必须经过深度设计（hotfix 和 tweak 除外）
2. **delta spec 是活文档** — 阶段 3 期间可自由修改，归档时同步
3. **保持 tasks.md 同步** — 完成一个勾一个
4. **频繁提交** — 每个任务一次提交，message 体现设计意图
5. **先验证再归档** — `/comet-verify` 通过后才执行 `/comet-archive`
6. **增量更新分级** — 小编辑、中重 brainstorming、大新 change
7. **Plan 必须关联 change** — 文件头包含 `change:` 和 `design-doc:` 元数据
8. **归档闭环** — design doc 和 plan 必须标注 `archived-with` 状态
9. **修改已有功能** — 直接 open 新 change 即可
10. **Preset 有上限** — hotfix/tweak 满足升级条件时及时切换到完整流程
