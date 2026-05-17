# @rpamis/comet

```
 ██████╗ ██████╗ ███╗   ███╗███████╗████████╗
██╔════╝██╔═══██╗████╗ ████║██╔════╝╚══██╔══╝
██║     ██║   ██║██╔████╔██║█████╗     ██║
██║     ██║   ██║██║╚██╔╝██║██╔══╝     ██║
╚██████╗╚██████╔╝██║ ╚═╝ ██║███████╗   ██║
 ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝   ╚═╝
```

> English version: [README.md](README.md)

**OpenSpec + Superpowers 双星开发工作流** — 从创意到归档，一条命令。

OpenSpec 处理 **WHAT**（大纲、提案、spec 生命周期、归档）。Superpowers 处理 **HOW**（技术设计、规划、执行、收尾）。Comet 将二者串联为五阶段自动化流水线。

## 安装

```bash
npm install -g @rpamis/comet
```

## 快速开始

```bash
cd your-project
comet init
```

`comet init` 会：

1. 提示你选择 AI 平台（自动检测已有配置）
2. 选择安装范围：项目级（当前目录）或全局（用户主目录）
3. 选择 Comet 技能语言：English 或 中文
4. 安装 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 技能
5. 安装 [Superpowers](https://github.com/obra/superpowers) 技能
6. 将 Comet 技能（你选择的语言）部署到所选平台
7. 创建 `docs/superpowers/specs/` 和 `docs/superpowers/plans/` 工作目录

## 命令

| 命令 | 描述 |
|---------|-------------|
| `comet init [path]` | 初始化 Comet 工作流 |
| `comet status [path]` | 显示活跃更改和工作流状态 |
| `comet doctor [path]` | 诊断 Comet 安装健康状态 |
| `comet update [path]` | 更新 comet 技能到最新版本 |
| `comet --help` | 显示帮助 |
| `comet --version` | 显示版本 |

### init 选项

| 选项 | 描述 |
|--------|-------------|
| `--yes` | 非交互模式，自动选择已检测平台 |
| `--skip-existing` | 跳过已安装的组件 |
| `--overwrite` | 覆盖已安装的组件 |
| `--json` | 输出结构化 JSON |

### status / doctor / update 选项

| 选项 | 适用于 | 描述 |
|--------|-----------|-------------|
| `--json` | `status`, `doctor` | 输出结构化 JSON |
| `--language <lang>` | `update` | 技能语言 (`en`, `zh`) |
| `--scope <scope>` | `update` | 安装范围 (`global`, `project`)|

## 支持平台

`comet init` 支持 28 个 AI 编码平台：

| 平台 | 技能目录 | 平台 | 技能目录 |
|----------|-----------|----------|-----------|
| Claude Code | `.claude/` | Cursor | `.cursor/` |
| Codex | `.codex/` | OpenCode | `.opencode/` |
| Windsurf | `.windsurf/` | Cline | `.cline/` |
| RooCode | `.roo/` | Continue | `.continue/` |
| GitHub Copilot | `.github/` | Gemini CLI | `.gemini/` |
| Amazon Q Developer | `.amazonq/` | Qwen Code | `.qwen/` |
| Kilo Code | `.kilocode/` | Auggie | `.augment/` |
| Kiro | `.kiro/` | Lingma | `.lingma/` |
| Junie | `.junie/` | CodeBuddy | `.codebuddy/` |
| CoStrict | `.cospec/` | Crush | `.crush/` |
| Factory Droid | `.factory/` | iFlow | `.iflow/` |
| Pi | `.pi/` | Qoder | `.qoder/` |
| Antigravity | `.agent/` | Bob Shell | `.bob/` |
| ForgeCode | `.forge/` | Trae | `.trae/` |

## 技能

`comet init` 完成后，三组技能将被安装到所选平台的 `skills/` 目录：

### Comet 技能

| 技能 | 描述 |
|-------|-------------|
| `/comet` | 主入口 — 自动检测阶段并分派到子命令 |
| `/comet-open` | 阶段 1：打开变更（提案、设计、任务分解） |
| `/comet-design` | 阶段 2：深度设计（头脑风暴、设计文档） |
| `/comet-build` | 阶段 3：规划与构建（实现计划、代码提交） |
| `/comet-verify` | 阶段 4：验证与完成（测试、验证报告） |
| `/comet-archive` | 阶段 5：归档（delta spec 同步、状态标注） |
| `/comet-hotfix` | 快捷路径：快速 bug 修复（跳过头脑风暴） |
| `/comet-tweak` | 快捷路径：小改动（跳过头脑风暴和完整计划） |

### 守护与自动化脚本

| 脚本 | 用途 |
|--------|---------|
| `comet-guard.sh` | 阶段转换守护 — 验证退出条件，`--apply` 自动更新 `.comet.yaml` |
| `comet-archive.sh` | 一键归档 — 验证状态、同步 specs、移至归档、更新状态 |
| `comet-yaml-validate.sh` | 模式校验器 — 校验 `.comet.yaml` 结构和字段值 |
| `comet-state.sh` | 统一状态管理 — init/set/get/check/scale，agent 的专属 YAML 接口 |

### OpenSpec 技能

Spec 生命周期管理：propose、explore、sync、verify、archive 等。

### Superpowers 技能

开发方法论：brainstorming、TDD、subagent-driven development、code review、plan writing 等。

## 工作流

```
/comet
  ↓ auto-detect
/comet-open  -->  /comet-design  -->  /comet-build  -->  /comet-verify  -->  /comet-archive
(OpenSpec)         (Superpowers)       (Superpowers)       (Both)           (OpenSpec)

/comet-hotfix（快捷路径，跳过头脑风暴）
  open  -->  build  -->  verify  -->  archive

/comet-tweak（快捷路径，跳过头脑风暴和完整计划）
  open  -->  轻量构建  -->  轻量验证  -->  archive
```

### 五个阶段

| 阶段 | 命令 | 归属 | 产出物 |
|-------|---------|-------|-----------|
| 1. Open | `/comet-open` | OpenSpec | proposal.md、design.md、tasks.md |
| 2. Deep Design | `/comet-design` | Superpowers | Design Doc、delta spec |
| 3. Plan & Build | `/comet-build` | Superpowers | 实现计划、代码提交 |
| 4. Verify & Finish | `/comet-verify` | Both | 验证报告、分支处理 |
| 5. Archive | `/comet-archive` | OpenSpec | delta→main spec 同步、归档 |

### 核心原则

- **头脑风暴不可跳过** — 每个变更必须经过深度设计（hotfix/tweak 除外）
- **Delta spec 是活文档** — 在阶段 3 中可自由编辑，归档时同步
- **保持 tasks.md 同步** — 每完成一个任务就勾选
- **频繁提交** — 每个任务一个 commit，message 体现设计意图
- **先验证再归档** — `/comet-verify` 必须通过才能执行 `/comet-archive`

### 状态管理

Comet 使用解耦状态架构，YAML 文件独立管理：

| 文件 | 归属 | 用途 |
|------|-------|---------|
| `.openspec.yaml` | OpenSpec | Spec 生命周期、变更元数据 |
| `.comet.yaml` | Comet | 工作流阶段、执行模式、验证状态 |

**`.comet.yaml` 关键字段：**
- `workflow`：`full`、`hotfix` 或 `tweak`
- `phase`：`design`、`build`、`verify`、`archive`
- `design_doc`：Superpowers 设计文档路径
- `plan`：实现计划路径
- `build_mode`：`subagent-driven-development`、`executing-plans` 或 `direct`
- `isolation`：`branch` 或 `worktree`，工作空间隔离方式
- `verify_mode`：`light` 或 `full`
- `verify_result`：`pending`、`pass` 或 `fail`
- `archived`：布尔值，标识变更是否已归档

### 可靠性特性

Comet 通过自动化状态转换确保 agent 执行可靠性：

1. **入口验证** — 每个阶段在执行前验证前置条件
   - 检查文件存在、状态一致性、阶段转换
   - 验证失败时输出 `[HARD STOP]` 及可操作建议

2. **自动化状态转换** — `comet-guard.sh --apply` 自动更新 `.comet.yaml`
   - 所有阶段转换（design → build → verify → archive）使用 `guard --apply`
   - 无需手动状态编辑 — 消除写入验证错误
   - `comet-state.sh` 是 agent 对状态操作的专属接口
   - Guard 和 archive 脚本内部使用 `comet-state.sh` 进行状态管理

3. **模式校验** — `comet-yaml-validate.sh` 确保数据完整性
   - 校验必填字段（10 个字段）
   - 校验枚举值（7 种枚举类型）
   - 校验引用文件路径存在
   - 检测未知/拼写错误字段

4. **归档自动化** — `comet-archive.sh` 一键处理完整归档流程
   - 验证入口状态、同步 delta specs 到 main specs
   - 标注设计文档和计划文档的 frontmatter
   - 将变更移至归档目录并更新 `archived: true`
   - 支持 `--dry-run` 预览

**安全**：所有变更名称输入均受路径遍历保护

## 项目结构

```
your-project/
├── .claude/skills/              # 平台技能目录（Comet + OpenSpec + Superpowers）
│   ├── comet/SKILL.md
│   │   └── scripts/
│   │       ├── comet-guard.sh       # 阶段转换守护（--apply 自动更新状态）
│   │       ├── comet-archive.sh     # 一键归档自动化
│   │       ├── comet-yaml-validate.sh # 模式校验器
│   │       └── comet-state.sh       # 统一状态管理（init/set/get/check/scale）
│   ├── comet-*/SKILL.md
│   ├── openspec-*/SKILL.md
│   └── brainstorming/SKILL.md
├── openspec/                    # OpenSpec — WHAT
│   ├── config.yaml
│   └── changes/
│       └── <name>/
│           ├── .openspec.yaml       # OpenSpec 状态
│           ├── .comet.yaml          # Comet 工作流状态（解耦）
│           ├── proposal.md
│           ├── design.md
│           ├── specs/<capability>/spec.md
│           └── tasks.md
└── docs/superpowers/            # Superpowers — HOW
    ├── specs/                   # 设计文档
    └── plans/                   # 实现计划
```

## 开发

```bash
# 克隆
git clone https://github.com/rpamis/comet
cd comet

# 安装依赖
pnpm install

# 开发模式（监听）
pnpm dev

# 构建
pnpm build

# 测试（单元 + 覆盖率）
pnpm test
pnpm test:coverage
pnpm test:shell         # bats shell 测试

# Lint & format
pnpm lint
pnpm format
```

详见 [CHANGELOG.md](CHANGELOG.md) 了解版本历史与更新。

## 安全

- 发布前扫描 API keys、secrets、tokens、private keys
- `.npmignore` 阻止源码和配置文件进入 npm 包
- `.gitignore` 覆盖 secrets、credentials、IDE configs 等

## License

MIT
