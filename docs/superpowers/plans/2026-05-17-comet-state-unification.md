# Comet 状态统一 实现计划

> **给 agentic worker：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务执行本计划。步骤使用 checkbox (`- [ ]`) 语法跟踪。

**目标：** 实现 `comet-state.sh` 统一状态管理脚本，改造所有 skill 文件消除 agent 手动 YAML 编辑。

**架构：** 单一脚本提供 5 个子命令（init/set/get/check/scale）作为 agent 与 `.comet.yaml` 的唯一接口。现有 guard.sh 和 archive.sh 内部改用 state.sh 操作状态。所有 SKILL.md 文件的入口验证、状态创建、字段更新改用脚本调用。

**技术栈：** Bash 脚本，Markdown SKILL.md 文件

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 创建 | `assets/skills/comet/scripts/comet-state.sh` | 统一状态管理脚本（5 个子命令） |
| 修改 | `assets/skills/comet/scripts/comet-guard.sh` | 内部改用 state.sh set |
| 修改 | `assets/skills/comet/scripts/comet-archive.sh` | 内部改用 state.sh get/set |
| 修改 | `assets/skills-zh/comet/SKILL.md` | 中文主入口 skill |
| 修改 | `assets/skills-zh/comet-open/SKILL.md` | 中文 Phase 1 |
| 修改 | `assets/skills-zh/comet-design/SKILL.md` | 中文 Phase 2 |
| 修改 | `assets/skills-zh/comet-build/SKILL.md` | 中文 Phase 3 |
| 修改 | `assets/skills-zh/comet-verify/SKILL.md` | 中文 Phase 4 |
| 修改 | `assets/skills-zh/comet-archive/SKILL.md` | 中文 Phase 5 |
| 修改 | `assets/skills-zh/comet-hotfix/SKILL.md` | 中文 hotfix |
| 修改 | `assets/skills-zh/comet-tweak/SKILL.md` | 中文 tweak |
| 修改 | `assets/skills/comet/SKILL.md` | 英文主入口 |
| 修改 | `assets/skills/comet-open/SKILL.md` | 英文 Phase 1 |
| 修改 | `assets/skills/comet-design/SKILL.md` | 英文 Phase 2 |
| 修改 | `assets/skills/comet-build/SKILL.md` | 英文 Phase 3 |
| 修改 | `assets/skills/comet-verify/SKILL.md` | 英文 Phase 4 |
| 修改 | `assets/skills/comet-archive/SKILL.md` | 英文 Phase 5 |
| 修改 | `assets/skills/comet-hotfix/SKILL.md` | 英文 hotfix |
| 修改 | `assets/skills/comet-tweak/SKILL.md` | 英文 tweak |
| 修改 | `README.md` | 新增脚本说明 |
| 修改 | `CHANGELOG.md` | 版本记录 |

---

## Phase 1: 脚本实现

### Task 1: 创建 comet-state.sh 骨架 + init + get

**文件：**
- 创建：`assets/skills/comet/scripts/comet-state.sh`

- [ ] **Step 1: 创建脚本骨架，包含公共函数、输入验证、init 和 get 子命令**

```bash
#!/bin/bash
# Comet State — unified state management for .comet.yaml
# Usage: comet-state.sh <subcommand> <change-name> [args...]
# Subcommands: init, set, get, check, scale

set -euo pipefail

red()    { echo -e "\033[31m$1\033[0m" >&2; }
green()  { echo -e "\033[32m$1\033[0m" >&2; }
yellow() { echo -e "\033[33m$1\033[0m" >&2; }

# --- Input validation ---
validate_change_name() {
  local name="$1"
  if [ -z "$name" ]; then
    red "FATAL: Change name cannot be empty"
    exit 1
  fi
  if [[ ! "$name" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    red "FATAL: Invalid change name: '$name'"
    red "Valid characters: a-z, A-Z, 0-9, -, _"
    exit 1
  fi
  if [[ "$name" =~ \.\. ]]; then
    red "FATAL: Change name cannot contain '..'"
    exit 1
  fi
}

# --- Helpers ---
yaml_field() {
  local field="$1"
  local yaml="$CHANGE_DIR/.comet.yaml"
  if [ -f "$yaml" ]; then
    grep "^${field}:" "$yaml" 2>/dev/null | sed "s/^${field}: *//" | tr -d '"' | tr -d "'" || true
  fi
}

file_nonempty() {
  [ -f "$1" ] && [ -s "$1" ]
}

# --- Script self-location ---
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")" 2>/dev/null || dirname "$0")" && pwd)"

# --- Enum validation (used by set and check) ---
validate_enum() {
  local field="$1"
  local value="$2"
  shift 2
  local valid_values="$*"

  for v in $valid_values; do
    if [ "$value" = "$v" ]; then
      return 0
    fi
  done
  red "FATAL: Invalid value for '$field': '$value'"
  red "Allowed values: $valid_values"
  exit 1
}

# --- Subcommand: init ---
cmd_init() {
  local workflow="$1"
  local yaml="$CHANGE_DIR/.comet.yaml"

  case "$workflow" in
    full|hotfix|tweak) ;;
    *) red "FATAL: Invalid workflow: '$workflow'. Expected: full, hotfix, tweak"; exit 1 ;;
  esac

  if [ -f "$yaml" ]; then
    red "FATAL: .comet.yaml already exists: $yaml"
    exit 1
  fi

  mkdir -p "$CHANGE_DIR"

  local phase="design"
  local build_mode="null"
  local isolation="null"
  local verify_mode="null"

  if [ "$workflow" != "full" ]; then
    phase="build"
    build_mode="direct"
    isolation="branch"
    verify_mode="light"
  fi

  cat > "$yaml" <<EOF
workflow: $workflow
phase: $phase
design_doc: null
plan: null
build_mode: $build_mode
isolation: $isolation
verify_mode: $verify_mode
verify_result: pending
verified_at: null
archived: false
EOF

  green "[INIT] $CHANGE_DIR/.comet.yaml created (workflow=$workflow, phase=$phase)"
}

# --- Subcommand: get ---
cmd_get() {
  local field="$1"
  local yaml="$CHANGE_DIR/.comet.yaml"

  if [ ! -f "$yaml" ]; then
    red "FATAL: .comet.yaml not found: $yaml"
    exit 1
  fi

  local value
  value=$(yaml_field "$field")

  if [ -z "$value" ] || [ "$value" = "null" ]; then
    echo ""
  else
    echo "$value"
  fi
}

# --- Parse arguments ---
if [ $# -lt 2 ]; then
  red "Usage: comet-state.sh <subcommand> <change-name> [args...]"
  red "Subcommands: init, set, get, check, scale"
  exit 1
fi

SUBCMD="$1"
shift
validate_change_name "$1"
CHANGE="$1"
CHANGE_DIR="openspec/changes/$CHANGE"
shift

case "$SUBCMD" in
  init)  cmd_init "$@" ;;
  get)   cmd_get "$@" ;;
  *)     red "Unknown subcommand: $SUBCMD"; red "Subcommands: init, set, get, check, scale"; exit 1 ;;
esac
```

- [ ] **Step 2: 手动测试 init 和 get**

```bash
mkdir -p /tmp/comet-test/openspec/changes/test-feature
cd /tmp/comet-test

# Test init full
bash <项目路径>/assets/skills/comet/scripts/comet-state.sh init test-feature full
cat openspec/changes/test-feature/.comet.yaml
# 预期：workflow=full, phase=design, build_mode=null

# Test get
bash <项目路径>/assets/skills/comet/scripts/comet-state.sh get test-feature phase
# 预期：design

bash <项目路径>/assets/skills/comet/scripts/comet-state.sh get test-feature build_mode
# 预期：（空字符串）

# Test init hotfix
rm openspec/changes/test-feature/.comet.yaml
bash <项目路径>/assets/skills/comet/scripts/comet-state.sh init test-feature hotfix
cat openspec/changes/test-feature/.comet.yaml
# 预期：workflow=hotfix, phase=build, build_mode=direct

# Test duplicate init (should fail)
bash <项目路径>/assets/skills/comet/scripts/comet-state.sh init test-feature full
# 预期：FATAL: .comet.yaml already exists

rm -rf /tmp/comet-test
```

- [ ] **Step 3: 提交**

```bash
git add assets/skills/comet/scripts/comet-state.sh
git commit -m "feat(comet): add comet-state.sh with init and get subcommands"
```

---

### Task 2: 实现 set 子命令

**文件：**
- 修改：`assets/skills/comet/scripts/comet-state.sh`

- [ ] **Step 1: 在 `cmd_get` 函数之后添加 `cmd_set` 函数，更新 case 语句**

在 `cmd_get` 函数之后、`# --- Parse arguments ---` 之前插入：

```bash
# --- Subcommand: set ---
cmd_set() {
  local field="$1"
  local value="$2"
  local yaml="$CHANGE_DIR/.comet.yaml"

  if [ ! -f "$yaml" ]; then
    red "FATAL: .comet.yaml not found: $yaml"
    exit 1
  fi

  local KNOWN_FIELDS="workflow phase design_doc plan build_mode isolation verify_mode verify_result verified_at archived"
  local found=0
  for f in $KNOWN_FIELDS; do
    [ "$field" = "$f" ] && found=1 && break
  done
  if [ "$found" -eq 0 ]; then
    red "FATAL: Unknown field: '$field'"
    red "Known fields: $KNOWN_FIELDS"
    exit 1
  fi

  case "$field" in
    workflow)      validate_enum "$field" "$value" "full hotfix tweak" ;;
    phase)         validate_enum "$field" "$value" "design build verify archive" ;;
    build_mode)    validate_enum "$field" "$value" "subagent-driven-development executing-plans direct" ;;
    isolation)     validate_enum "$field" "$value" "branch worktree" ;;
    verify_mode)   validate_enum "$field" "$value" "light full" ;;
    verify_result) validate_enum "$field" "$value" "pending pass fail" ;;
    archived)      validate_enum "$field" "$value" "true false" ;;
  esac

  if grep -q "^${field}:" "$yaml" 2>/dev/null; then
    sed -i "s|^${field}:.*|${field}: ${value}|" "$yaml"
  else
    echo "${field}: ${value}" >> "$yaml"
  fi

  green "[SET] ${field}=${value}"
}
```

更新 case 语句添加 `set) cmd_set "$@" ;;`

- [ ] **Step 2: 测试 set 子命令**

```bash
mkdir -p /tmp/comet-test/openspec/changes/test-feature && cd /tmp/comet-test
bash <项目路径>/assets/skills/comet/scripts/comet-state.sh init test-feature full

# Valid set
bash <项目路径>/assets/skills/comet/scripts/comet-state.sh set test-feature build_mode direct
bash <项目路径>/assets/skills/comet/scripts/comet-state.sh get test-feature build_mode
# 预期：direct

# Invalid enum (should fail)
bash <项目路径>/assets/skills/comet/scripts/comet-state.sh set test-feature build_mode invalid
# 预期：FATAL: Invalid value for 'build_mode'

# Unknown field (should fail)
bash <项目路径>/assets/skills/comet/scripts/comet-state.sh set test-feature unknown value
# 预期：FATAL: Unknown field

# Path field (no enum check)
bash <项目路径>/assets/skills/comet/scripts/comet-state.sh set test-feature design_doc docs/specs/test.md
bash <项目路径>/assets/skills/comet/scripts/comet-state.sh get test-feature design_doc
# 预期：docs/specs/test.md

rm -rf /tmp/comet-test
```

- [ ] **Step 3: 提交**

```bash
git add assets/skills/comet/scripts/comet-state.sh
git commit -m "feat(comet): add set subcommand with enum validation"
```

---

### Task 3: 实现 check 子命令

**文件：**
- 修改：`assets/skills/comet/scripts/comet-state.sh`

- [ ] **Step 1: 在 `cmd_set` 函数之后添加 `cmd_check` 函数和辅助函数**

```bash
# --- Subcommand: check ---
CHECK_BLOCK=0

check_pass() { green "  [PASS] $1"; }
check_fail() { red "  [FAIL] $1"; CHECK_BLOCK=1; }

check_nonempty() {
  local desc="$1" path="$2"
  if file_nonempty "$path"; then
    check_pass "$desc"
  else
    check_fail "$desc (missing or empty: $path)"
  fi
}

check_yaml_is() {
  local field="$1" expected="$2"
  local actual
  actual=$(yaml_field "$field" 2>/dev/null || true)
  if [ "$actual" = "$expected" ]; then
    check_pass "$field=$actual (expected: $expected)"
  else
    check_fail "$field=$actual (expected: $expected)"
  fi
}

check_yaml_empty() {
  local field="$1"
  local actual
  actual=$(yaml_field "$field" 2>/dev/null || true)
  if [ -z "$actual" ] || [ "$actual" = "null" ]; then
    check_pass "$field is empty/null"
  else
    check_fail "$field=$actual (expected: empty/null)"
  fi
}

check_file_not_exists() {
  local desc="$1" path="$2"
  if [ ! -f "$path" ]; then
    check_pass "$desc"
  else
    check_fail "$desc (file exists: $path)"
  fi
}

cmd_check() {
  local phase="$1"
  CHECK_BLOCK=0
  echo "=== Entry Check: comet-$phase ===" >&2

  if [ "$phase" != "open" ]; then
    if [ ! -f "$CHANGE_DIR/.comet.yaml" ]; then
      red "  [FAIL] .comet.yaml exists (not found: $CHANGE_DIR/.comet.yaml)"
      echo "" >&2
      red "BLOCKED — fix failing checks before proceeding"
      exit 1
    fi
  fi

  case "$phase" in
    open)
      check_file_not_exists ".comet.yaml" "$CHANGE_DIR/.comet.yaml"
      check_nonempty "proposal.md exists" "$CHANGE_DIR/proposal.md"
      check_nonempty "design.md exists" "$CHANGE_DIR/design.md"
      check_nonempty "tasks.md exists" "$CHANGE_DIR/tasks.md"
      ;;
    design)
      check_pass ".comet.yaml exists"
      check_yaml_is "phase" "design"
      check_yaml_is "workflow" "full"
      check_yaml_empty "design_doc"
      check_nonempty "proposal.md exists" "$CHANGE_DIR/proposal.md"
      check_nonempty "design.md exists" "$CHANGE_DIR/design.md"
      check_nonempty "tasks.md exists" "$CHANGE_DIR/tasks.md"
      ;;
    build)
      check_pass ".comet.yaml exists"
      check_yaml_is "phase" "build"
      local design_doc
      design_doc=$(yaml_field "design_doc" 2>/dev/null || true)
      if [ -n "$design_doc" ] && [ "$design_doc" != "null" ] && [ -f "$design_doc" ]; then
        check_pass "design_doc exists ($design_doc)"
      else
        check_fail "design_doc missing or file not found ($design_doc)"
      fi
      check_nonempty "proposal.md exists" "$CHANGE_DIR/proposal.md"
      check_nonempty "tasks.md exists" "$CHANGE_DIR/tasks.md"
      ;;
    verify)
      check_pass ".comet.yaml exists"
      check_yaml_is "phase" "verify"
      local verify_result
      verify_result=$(yaml_field "verify_result" 2>/dev/null || true)
      if [ -z "$verify_result" ] || [ "$verify_result" = "pending" ] || [ "$verify_result" = "null" ]; then
        check_pass "verify_result is pending/null"
      else
        check_fail "verify_result=$verify_result (expected: pending or null)"
      fi
      ;;
    archive)
      check_pass ".comet.yaml exists"
      check_yaml_is "phase" "archive"
      check_yaml_is "verify_result" "pass"
      local archived
      archived=$(yaml_field "archived" 2>/dev/null || true)
      if [ "$archived" != "true" ]; then
        check_pass "archived is not true"
      else
        check_fail "archived=true (already archived)"
      fi
      ;;
    *)
      red "FATAL: Unknown phase: '$phase'. Expected: open, design, build, verify, archive"
      exit 1
      ;;
  esac

  echo "" >&2
  if [ "$CHECK_BLOCK" -eq 1 ]; then
    red "BLOCKED — fix failing checks before proceeding"
    exit 1
  else
    green "ALL CHECKS PASSED — ready to proceed"
    exit 0
  fi
}
```

更新 case 语句添加 `check) cmd_check "$@" ;;`

- [ ] **Step 2: 测试 check 各阶段**

```bash
mkdir -p /tmp/comet-test/openspec/changes/test-feature && cd /tmp/comet-test
echo "test" > openspec/changes/test-feature/proposal.md
echo "test" > openspec/changes/test-feature/design.md
echo "- [ ] task1" > openspec/changes/test-feature/tasks.md

# check open
bash <项目路径>/assets/skills/comet/scripts/comet-state.sh check test-feature open
# 预期：ALL CHECKS PASSED

# init full, check design
bash <项目路径>/assets/skills/comet/scripts/comet-state.sh init test-feature full
bash <项目路径>/assets/skills/comet/scripts/comet-state.sh check test-feature design
# 预期：ALL CHECKS PASSED

# wrong phase, check failure
bash <项目路径>/assets/skills/comet/scripts/comet-state.sh set test-feature phase build
bash <项目路径>/assets/skills/comet/scripts/comet-state.sh check test-feature design
# 预期：BLOCKED

rm -rf /tmp/comet-test
```

- [ ] **Step 3: 提交**

```bash
git add assets/skills/comet/scripts/comet-state.sh
git commit -m "feat(comet): add check subcommand for entry verification"
```

---

### Task 4: 实现 scale 子命令

**文件：**
- 修改：`assets/skills/comet/scripts/comet-state.sh`

- [ ] **Step 1: 在 `cmd_check` 函数之后添加 `cmd_scale` 函数**

```bash
# --- Subcommand: scale ---
cmd_scale() {
  local yaml="$CHANGE_DIR/.comet.yaml"

  if [ ! -f "$yaml" ]; then
    red "FATAL: .comet.yaml not found: $yaml"
    exit 1
  fi

  local task_count=0
  local spec_count=0
  local file_count=0

  local tasks_file="$CHANGE_DIR/tasks.md"
  if [ -f "$tasks_file" ]; then
    task_count=$(grep -c '\- \[' "$tasks_file" 2>/dev/null || echo 0)
  fi

  local spec_root="$CHANGE_DIR/specs"
  if [ -d "$spec_root" ]; then
    spec_count=$(find "$spec_root" -name "spec.md" -type f 2>/dev/null | wc -l | tr -d ' ')
  fi

  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    file_count=$(git diff --stat HEAD 2>/dev/null | tail -1 | grep -o '[0-9]* file' | grep -o '[0-9]*' || echo 0)
    if [ -z "$file_count" ]; then
      file_count=0
    fi
  fi

  echo "=== Scale Assessment: $CHANGE ===" >&2
  echo "  Tasks: $task_count (threshold: 3)" >&2
  echo "  Delta specs: $spec_count capabilities (threshold: 1)" >&2
  echo "  Changed files: $file_count (threshold: 5)" >&2

  local result="light"

  if [ "$task_count" -gt 3 ] || [ "$spec_count" -gt 1 ] || [ "$file_count" -gt 5 ]; then
    result="full"
  fi

  echo "  → Result: $result" >&2

  sed -i "s|^verify_mode:.*|verify_mode: $result|" "$yaml"
  green "[SCALE] verify_mode=$result"
}
```

更新 case 语句添加 `scale) cmd_scale ;;`

- [ ] **Step 2: 测试 scale**

```bash
mkdir -p /tmp/comet-test/openspec/changes/test-feature && cd /tmp/comet-test
bash <项目路径>/assets/skills/comet/scripts/comet-state.sh init test-feature full

# light scale
echo "- [ ] task1
- [ ] task2" > openspec/changes/test-feature/tasks.md
bash <项目路径>/assets/skills/comet/scripts/comet-state.sh scale test-feature
# 预期：Result: light

# full scale (> 3 tasks)
echo "- [ ] t1
- [ ] t2
- [ ] t3
- [ ] t4" > openspec/changes/test-feature/tasks.md
bash <项目路径>/assets/skills/comet/scripts/comet-state.sh scale test-feature
# 预期：Result: full

rm -rf /tmp/comet-test
```

- [ ] **Step 3: 提交**

```bash
git add assets/skills/comet/scripts/comet-state.sh
git commit -m "feat(comet): add scale subcommand for verification mode assessment"
```

---

## Phase 2: 内部重构

### Task 5: 重构 comet-guard.sh 内部使用 state.sh

**文件：**
- 修改：`assets/skills/comet/scripts/comet-guard.sh`（第 184-208 行 `apply_state_update` 函数）

- [ ] **Step 1: 替换 `apply_state_update` 函数**

将原函数替换为优先使用 `comet-state.sh set`，保留 fallback：

```bash
apply_state_update() {
  local state_sh="$SCRIPT_DIR/comet-state.sh"
  local p="$1"

  if [ -f "$state_sh" ]; then
    case "$p" in
      open)   bash "$state_sh" set "$CHANGE" phase design ;;
      design) bash "$state_sh" set "$CHANGE" phase build ;;
      build)
        bash "$state_sh" set "$CHANGE" phase verify
        bash "$state_sh" set "$CHANGE" verify_result pending
        ;;
      verify)
        bash "$state_sh" set "$CHANGE" phase archive
        bash "$state_sh" set "$CHANGE" verify_result pass
        bash "$state_sh" set "$CHANGE" verified_at "$(date +%Y-%m-%d)"
        ;;
    esac
  else
    # Fallback: direct sed
    local yaml="$CHANGE_DIR/.comet.yaml"
    case "$p" in
      open)   sed -i 's/^phase:.*/phase: design/' "$yaml" ;;
      design) sed -i 's/^phase:.*/phase: build/' "$yaml" ;;
      build)  sed -i 's/^phase:.*/phase: verify/' "$yaml"; sed -i 's/^verify_result:.*/verify_result: pending/' "$yaml" ;;
      verify)
        sed -i 's/^phase:.*/phase: archive/' "$yaml"
        sed -i 's/^verify_result:.*/verify_result: pass/' "$yaml"
        if ! grep -q '^verified_at:' "$yaml" 2>/dev/null; then
          echo "verified_at: $(date +%Y-%m-%d)" >> "$yaml"
        else
          sed -i "s/^verified_at:.*/verified_at: $(date +%Y-%m-%d)/" "$yaml"
        fi
        ;;
    esac
  fi
}
```

- [ ] **Step 2: 提交**

```bash
git add assets/skills/comet/scripts/comet-guard.sh
git commit -m "refactor(comet): guard uses comet-state.sh internally for state updates"
```

---

### Task 6: 重构 comet-archive.sh 内部使用 state.sh

**文件：**
- 修改：`assets/skills/comet/scripts/comet-archive.sh`

- [ ] **Step 1: 添加 SCRIPT_DIR 和 STATE_SH，替换 yaml_field 为优先使用 state.sh**

在脚本开头 `CHANGE_DIR="openspec/changes/$CHANGE"` 之后添加：

```bash
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")" 2>/dev/null || dirname "$0")" && pwd)"
STATE_SH="$SCRIPT_DIR/comet-state.sh"
```

替换 `yaml_field` 函数为：

```bash
yaml_field() {
  local field="$1"
  if [ -f "$STATE_SH" ]; then
    bash "$STATE_SH" get "$CHANGE" "$field" 2>/dev/null
  else
    if [ -f "$YAML" ]; then
      grep "^${field}:" "$YAML" | sed "s/^${field}: *//" | tr -d '"' | tr -d "'"
    fi
  fi
}
```

注意：archived 更新（第 231 行 `sed -i 's/^archived:.*/archived: true/'`）保持不变，因为此时文件已移动到 archive 路径，`state.sh` 无法通过原路径访问。

- [ ] **Step 2: 提交**

```bash
git add assets/skills/comet/scripts/comet-archive.sh
git commit -m "refactor(comet): archive uses comet-state.sh for state reads"
```

---

## Phase 3: 中文 SKILL.md 改造

> 按 CLAUDE.md 规则，先改中文版，用户确认后再改英文版。

### Task 7: 改造 comet/SKILL.md（中文）

**文件：**
- 修改：`assets/skills-zh/comet/SKILL.md`

- [ ] **Step 1: 在 Script Location 章节添加 COMET_STATE**

在现有 `COMET_GUARD` 和 `COMET_ARCHIVE` 的 `find` 命令之后添加：

```bash
COMET_STATE=$(find . -path '*/comet/scripts/comet-state.sh' -type f -print -quit)
```

说明三个脚本用途：`COMET_STATE` 状态管理（init/set/get/check/scale），`COMET_GUARD` 阶段流转守卫，`COMET_ARCHIVE` 归档自动化。

- [ ] **Step 2: 更新 Error Handling 中"`.comet.yaml` 格式错误或缺失"行**

改为 "用 `bash $COMET_STATE set <name> phase <正确阶段>` 修正元数据后继续"。

- [ ] **Step 3: 提交**

```bash
git add assets/skills-zh/comet/SKILL.md
git commit -m "refactor(comet): update Chinese main skill to reference comet-state.sh"
```

---

### Task 8: 改造 comet-open/SKILL.md（中文）

**文件：**
- 修改：`assets/skills-zh/comet-open/SKILL.md`

- [ ] **Step 1: 替换 Step 0 入口验证为 check 调用**

替换整个 Step 0 checklist 和 Verification method 段落为：

```bash
COMET_STATE=$(find . -path '*/comet/scripts/comet-state.sh' -type f -print -quit)
bash "$COMET_STATE" check <name> open
```

- [ ] **Step 2: 替换 Step 3 初始化 Comet 状态为 init 调用**

替换整个 YAML 模板块为：

```bash
bash "$COMET_STATE" init <name> full
```

- [ ] **Step 3: 提交**

```bash
git add assets/skills-zh/comet-open/SKILL.md
git commit -m "refactor(comet): update Chinese comet-open to use comet-state.sh"
```

---

### Task 9: 改造 comet-design/SKILL.md（中文）

**文件：**
- 修改：`assets/skills-zh/comet-design/SKILL.md`

- [ ] **Step 1: 替换 Step 0 入口验证**

替换为 `bash "$COMET_STATE" check <name> design`

- [ ] **Step 2: 替换 Step 2 中 `sed -i` 写 design_doc**

替换 `sed -i 's|^design_doc:.*|...|'` 为：

```bash
bash "$COMET_STATE" set <name> design_doc docs/superpowers/specs/YYYY-MM-DD-topic-design.md
```

- [ ] **Step 3: 提交**

```bash
git add assets/skills-zh/comet-design/SKILL.md
git commit -m "refactor(comet): update Chinese comet-design to use comet-state.sh"
```

---

### Task 10: 改造 comet-build/SKILL.md（中文）

**文件：**
- 修改：`assets/skills-zh/comet-build/SKILL.md`

- [ ] **Step 1: 替换 Step 0 入口验证**

替换为 `bash "$COMET_STATE" check <name> build`

- [ ] **Step 2: 替换 Step 2 中 `sed -i` 写 plan 路径**

替换为 `bash "$COMET_STATE" set <name> plan docs/superpowers/plans/YYYY-MM-DD-feature.md`

- [ ] **Step 3: 替换 Step 3 中 isolation 写入**

替换手动 sed 描述为 `bash "$COMET_STATE" set <name> isolation <用户选择>`

- [ ] **Step 4: 替换 Step 4 中 build_mode 写入**

替换手动 sed 描述为 `bash "$COMET_STATE" set <name> build_mode <用户选择>`

- [ ] **Step 5: 提交**

```bash
git add assets/skills-zh/comet-build/SKILL.md
git commit -m "refactor(comet): update Chinese comet-build to use comet-state.sh"
```

---

### Task 11: 改造 comet-verify/SKILL.md（中文）

**文件：**
- 修改：`assets/skills-zh/comet-verify/SKILL.md`

- [ ] **Step 1: 替换 Step 0 入口验证**

替换为 `bash "$COMET_STATE" check <name> verify`

- [ ] **Step 2: 替换 Step 1 规模评估为 scale 调用**

替换整个规模评估表格和文字规则为：

```bash
bash "$COMET_STATE" scale <name>
# 脚本自动评估任务数、增量规格、变更文件数，设置 verify_mode
```

- [ ] **Step 3: 替换 verify_result 写入**

替换为 `bash "$COMET_STATE" set <name> verify_result pass`

- [ ] **Step 4: 提交**

```bash
git add assets/skills-zh/comet-verify/SKILL.md
git commit -m "refactor(comet): update Chinese comet-verify to use comet-state.sh"
```

---

### Task 12: 改造 comet-archive/SKILL.md（中文）

**文件：**
- 修改：`assets/skills-zh/comet-archive/SKILL.md`

- [ ] **Step 1: 替换 Step 0 入口验证**

替换为 `bash "$COMET_STATE" check <name> archive`

- [ ] **Step 2: 提交**

```bash
git add assets/skills-zh/comet-archive/SKILL.md
git commit -m "refactor(comet): update Chinese comet-archive to use comet-state.sh"
```

---

### Task 13: 改造 comet-hotfix/SKILL.md（中文）

**文件：**
- 修改：`assets/skills-zh/comet-hotfix/SKILL.md`

- [ ] **Step 1: 替换 Step 0 入口验证**

替换为 `bash "$COMET_STATE" check <name> open`

- [ ] **Step 2: 替换 Step 1 中手动 YAML 创建和写入验证**

将整个 YAML 模板块和【写入验证】段落替换为：

```bash
bash "$COMET_STATE" init <name> hotfix
```

- [ ] **Step 3: 提交**

```bash
git add assets/skills-zh/comet-hotfix/SKILL.md
git commit -m "refactor(comet): update Chinese comet-hotfix to use comet-state.sh"
```

---

### Task 14: 改造 comet-tweak/SKILL.md（中文）

**文件：**
- 修改：`assets/skills-zh/comet-tweak/SKILL.md`

- [ ] **Step 1: 替换 Step 0 入口验证**

替换为 `bash "$COMET_STATE" check <name> open`

- [ ] **Step 2: 替换 Step 1 中手动 YAML 创建和写入验证**

将整个 YAML 模板块和【写入验证】段落替换为：

```bash
bash "$COMET_STATE" init <name> tweak
```

- [ ] **Step 3: 提交**

```bash
git add assets/skills-zh/comet-tweak/SKILL.md
git commit -m "refactor(comet): update Chinese comet-tweak to use comet-state.sh"
```

---

## Phase 4: 英文 SKILL.md 同步

> 中文版用户确认后执行。每个英文文件与对应中文文件做相同替换，仅翻译为英文。

### Task 15: 同步所有英文 SKILL.md

**文件：**
- 修改：`assets/skills/comet/SKILL.md`
- 修改：`assets/skills/comet-open/SKILL.md`
- 修改：`assets/skills/comet-design/SKILL.md`
- 修改：`assets/skills/comet-build/SKILL.md`
- 修改：`assets/skills/comet-verify/SKILL.md`
- 修改：`assets/skills/comet-archive/SKILL.md`
- 修改：`assets/skills/comet-hotfix/SKILL.md`
- 修改：`assets/skills/comet-tweak/SKILL.md`

- [ ] **Step 1: 逐文件同步英文版，改动与中文版完全对应**

对每个文件执行相同替换：入口验证 → check、状态创建 → init、字段更新 → set、规模评估 → scale。语言保持英文。

- [ ] **Step 2: 提交**

```bash
git add assets/skills/
git commit -m "refactor(comet): sync English skills to use comet-state.sh"
```

---

## Phase 5: 文档更新

### Task 16: 更新 README.md

**文件：**
- 修改：`README.md`

- [ ] **Step 1: 在 Guard & Automation Scripts 表格中添加 comet-state.sh**

添加行：

```
| `comet-state.sh` | Unified state management — init/set/get/check/scale, agents' exclusive YAML interface |
```

- [ ] **Step 2: 更新 Reliability Features 章节**

替换 "Automated State Transitions" 描述，提及 `comet-state.sh` 作为 agent 唯一状态接口。

- [ ] **Step 3: 更新 Project Structure 中 scripts 目录**

添加 `comet-state.sh` 注释。

- [ ] **Step 4: 提交**

```bash
git add README.md
git commit -m "docs: add comet-state.sh to README"
```

---

### Task 17: 更新 CHANGELOG.md 和版本号

**文件：**
- 修改：`CHANGELOG.md`
- 修改：`package.json`

- [ ] **Step 1: 添加 v0.1.8 changelog**

在文件顶部添加：

```markdown
## What's Changed [0.1.8] - 2026-05-17

### Added

- **`comet-state.sh` script**: Unified state management with 5 subcommands — `init`, `set` (with enum validation), `get`, `check` (entry verification), `scale` (verification mode assessment)
- **Scripted entry verification**: `comet-state.sh check` replaces text checklists in all 8 skills
- **Scripted scale assessment**: `comet-state.sh scale` replaces prose decision rules

### Changed

- **All `.comet.yaml` writes go through `comet-state.sh`**: No more raw `sed -i` — enum validation on every field write
- **All skill Step 0 checklists replaced with `check` subcommand**: Single command replaces text-based entry verification
- **`comet-guard.sh` and `comet-archive.sh` use state.sh internally**: All state mutations through unified interface
```

- [ ] **Step 2: 更新 package.json 版本号为 0.1.8**

- [ ] **Step 3: 提交**

```bash
git add CHANGELOG.md package.json package-lock.json
git commit -m "chore: bump version to 0.1.8 and update changelog"
```
