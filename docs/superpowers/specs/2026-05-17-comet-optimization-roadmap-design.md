---
name: comet-optimization-roadmap
description: "Comet 全面优化路线图：三层架构覆盖 Skill 可靠性、CLI 完善、工程化三个维度"
date: 2026-05-17
status: approved
---

# Comet 全面优化路线图设计

## 背景

Comet 当前版本 0.1.8，支持 28 个 AI 编码平台，核心功能包括 `comet init` CLI 和 8 个 skill 文件（中英双语）。经过全面审视，识别出三个维度的优化机会：

1. **Skill 可靠性** — agent 使用 comet skill 时的体验和可靠性
2. **CLI 完善** — 运维命令的缺失
3. **工程化** — 测试、CI、代码组织的短板

设计目标：用户使用体验和项目工程化并重，按 ROI 排序，每个阶段都有可交付成果。

---

## Layer 1: Skill 可靠性优化

### 1.1 SKILL.md 结构拆分

**问题**：comet/SKILL.md 有 220 行，agent 需要全部读完才能做决策。决策逻辑和参考信息混在一起。

**方案**：将 SKILL.md 拆为两个区域：

```
上半部分（决策核心，约 50 行）：
  - 阶段检测决策树（Step 0/1/2 的精简版）
  - 预设路径判断条件
  - 错误处理速查表

下半部分（参考附录，按需展开）：
  - 完整字段说明表
  - 文件结构图
  - 最佳实践列表
  - 脚本定位命令
```

agent 做决策只需读前半部分，参考信息按需查阅。同样适用于所有子命令 SKILL.md（comet-open、comet-build 等）。

### 1.2 预设升级条件明确化

**问题**：hotfix/tweak 升级到 full 流程的条件是模糊的"满足升级条件时及时切换"。

**方案**：给出可操作的量化标准：

```
hotfix → full 升级条件（满足任一即升级）：
  - 改动涉及 3+ 文件
  - 涉及架构变更（新模块、新接口、新依赖）
  - 涉及数据库 schema 变更
  - 修复引入新的 public API
  - 修复范围超出单一函数/模块

tweak → full 升级条件（满足任一即升级）：
  - 改动涉及 5+ 文件
  - 涉及多个模块的协调修改
  - 需要新增测试用例 5+
  - 涉及配置项的新增或删除（非值修改）
```

将这些标准写入 comet-hotfix/SKILL.md 和 comet-tweak/SKILL.md 的决策核心区。

### 1.3 脚本定位优化

**问题**：`find` 在大型 monorepo 中可能慢。

**方案**：优先使用缓存的环境变量，回退到 `find`：

```bash
COMET_GUARD="${COMET_GUARD:-$(find . -path '*/comet/scripts/comet-guard.sh' -type f -print -quit)}"
```

在 SKILL.md 决策核心区开头明确要求 agent 首次定位后缓存路径。

### 1.4 manifest.json 修复

**问题**：`comet-state.sh` 和 `comet-archive.sh` 未在 manifest.json 的 skills 列表中，导致安装时不被部署。

**方案**：在 manifest.json 中添加：

```json
{
  "skills": [
    "comet/SKILL.md",
    "comet/scripts/comet-guard.sh",
    "comet/scripts/comet-archive.sh",
    "comet/scripts/comet-state.sh",
    "comet/scripts/comet-yaml-validate.sh",
    "comet-open/SKILL.md",
    "comet-design/SKILL.md",
    "comet-build/SKILL.md",
    "comet-verify/SKILL.md",
    "comet-archive/SKILL.md",
    "comet-hotfix/SKILL.md",
    "comet-tweak/SKILL.md"
  ]
}
```

---

## Layer 2: CLI 完善

### 2.1 `comet status`

**用途**：显示当前项目的工作流状态，方便人和 agent 快速了解进度。

```bash
$ comet status
Active Changes:
  1. user-auth-refactor [phase: build, 3/5 tasks]
     workflow: full | build_mode: subagent-driven
     design: docs/superpowers/specs/2026-05-17-auth-design.md
     plan:   docs/superpowers/plans/2026-05-17-auth-plan.md

  2. fix-login-timeout [phase: verify, verify_result: pending]
     workflow: hotfix

No archived changes in recent 7 days.
```

**实现**：读取 `openspec/changes/*/` 下的 `.comet.yaml` + `tasks.md` 聚合状态。

**`--json` 输出**：
```json
{
  "changes": [
    {
      "name": "user-auth-refactor",
      "workflow": "full",
      "phase": "build",
      "tasksCompleted": 3,
      "tasksTotal": 5,
      "designDoc": "docs/superpowers/specs/2026-05-17-auth-design.md",
      "plan": "docs/superpowers/plans/2026-05-17-auth-plan.md"
    }
  ]
}
```

### 2.2 `comet doctor`

**用途**：诊断 Comet 安装和配置是否健康。

检查项：

| 检查 | 说明 |
|------|------|
| openspec CLI | 是否安装、版本是否兼容 |
| 目录结构 | `docs/superpowers/specs/` 和 `plans/` 是否存在 |
| Skill 完整性 | 每个平台的 skills 是否齐全（对比 manifest） |
| 脚本可执行 | `comet-guard.sh` 等脚本是否有执行权限 |
| .comet.yaml 合法性 | 活跃 change 的状态文件是否合法 |

输出示例：
```
Comet Doctor
✓ openspec CLI: installed (v1.2.3)
✓ working directories: present
⚠ skill completeness: .claude/skills/ missing comet-state.sh
✓ scripts executable: OK
✗ .comet.yaml validation: fix-login-timeout has unknown field "phaze"
```

**`--json` 输出**：结构化的检查结果数组。

### 2.3 `comet update`

**用途**：更新已安装的 comet skill 到最新版本。

```bash
$ comet update
```

逻辑：
1. 读取当前 npm 包版本和 manifest 版本
2. 如果有更新，用与 `init` 相同的 `copyCometSkillsForPlatform` 逻辑覆盖部署
3. 只更新 comet 自身的 skill，不动 openspec/superpowers
4. 显示更新摘要

### 2.4 命令架构

```
comet
├── init [path]       # 现有
├── status            # 新增 — 工作流状态概览
├── doctor            # 新增 — 环境诊断
├── update            # 新增 — 更新 skill 文件
├── --help
└── --version
```

新命令在 `src/commands/` 下独立模块，复用 `core/` 和 `utils/` 的逻辑。

---

## Layer 3: 工程化

### 3.1 测试覆盖

优先级排序：

| 优先级 | 测试范围 | 工具 | 说明 |
|--------|---------|------|------|
| P0 | shell 脚本逻辑（state/guard/archive/validate） | bats 或 bash test | agent 运行时最依赖的部分 |
| P1 | init.ts 核心流程 | vitest + mock file system | 平台检测、skill 复制、manifest 读取 |
| P2 | CLI 命令集成测试 | vitest + child_process | init/status/doctor/update 端到端 |
| P3 | 平台检测逻辑 | vitest | 边界情况（无平台、多平台、未知平台） |

### 3.2 代码组织

将 `init.ts`（620 行）拆为：

```
src/
├── cli/
│   └── index.ts          # Commander 注册（入口）
├── commands/
│   ├── init.ts           # init 命令编排逻辑
│   ├── status.ts         # 新增：status 命令
│   ├── doctor.ts         # 新增：doctor 命令
│   └── update.ts         # 新增：update 命令
├── core/
│   ├── platforms.ts      # 现有，保持不变
│   ├── openspec.ts       # 从 init.ts 抽取：openspec 安装/检测逻辑
│   ├── superpowers.ts    # 从 init.ts 抽取：superpowers 安装逻辑
│   └── skills.ts         # 从 init.ts 抽取：comet skill 复制/manifest 逻辑
└── utils/
    └── file-system.ts    # 现有，保持不变
```

### 3.3 CI/CD

GitHub Actions workflow：

```yaml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - run: pnpm build
      - run: pnpm test
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: shellcheck assets/skills/comet/scripts/*.sh
```

### 3.4 代码质量工具

| 工具 | 用途 | 配置 |
|------|------|------|
| ESLint | TS/JS linting | `eslint.config.js` |
| Prettier | 代码格式化 | `.prettierrc` |
| shellcheck | shell 脚本静态分析 | CI 集成 |

### 3.5 文档

新增 `CONTRIBUTING.md`，包含：
- 开发环境设置（pnpm install、build、test）
- 提交规范（conventional commits）
- PR 流程
- 如何添加新平台
- 如何添加新 skill

---

## 路线图总览

```
Phase 1（Skill 可靠性）     Phase 2（CLI 完善）       Phase 3（工程化）
─────────────────────     ──────────────────      ──────────────────
✦ SKILL.md 结构拆分        ✦ comet status            ✦ 测试覆盖 (P0-P1)
✦ 预设升级条件明确化         ✦ comet doctor            ✦ 代码组织拆分
✦ 脚本定位优化              ✦ comet update            ✦ GitHub Actions CI
✦ manifest bug 修复         ✦ --json 输出             ✦ ESLint/Prettier/shellcheck
                                                    ✦ CONTRIBUTING.md
```

每个 Phase 独立可交付，Phase 之间无硬依赖。建议按 Phase 1 → 3 → 2 顺序执行（先修 bug、再打基础、最后加功能）。
