# Comet SKILL.md Agent 可靠性强化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 comet-guard.sh 基础上增加三层纵深防护：入口自校验（Entry Verify）、写入即验证（Write-then-Verify）、Schema 校验脚本（comet-yaml-validate.sh）。

**Architecture:** 7 个 SKILL.md 各自新增 Step 0 入口校验 + 所有 .comet.yaml 写入处追加验证指令；新建 comet-yaml-validate.sh 做结构兜底校验；comet-guard.sh preflight 整合调用。

**Tech Stack:** Bash (comet-yaml-validate.sh, comet-guard.sh), Markdown (SKILL.md), JSON (manifest.json)

**Spec:** `docs/superpowers/specs/2026-05-15-comet-agent-reliability-design.md`

---

### Task 1: comet-open — 入口校验 + 写入验证

**Files:**
- Modify: `assets/skills/comet-open/SKILL.md`

- [ ] **Step 1: 在 comet-open SKILL.md 开头插入 Step 0 入口自校验**

在 `## 前置条件` 段落后、`## 步骤` 段落前插入：

```markdown
### 0. 入口状态验证（Entry Check）

在执行任何操作之前，读取并验证当前状态：

**检查清单：**
1. `openspec/changes/<name>/` 目录已存在（由 openspec-new-change 创建）
2. `openspec/changes/<name>/.comet.yaml` 文件不存在（尚未初始化）
3. `openspec/changes/<name>/proposal.md` 存在且非空
4. `openspec/changes/<name>/design.md` 存在且非空
5. `openspec/changes/<name>/tasks.md` 存在且非空

**验证方式：**
- 读取以上路径确认存在/不存在
- 如 `.comet.yaml` 已存在，读取其 `phase` 字段：如 phase 不为空，输出 `[HARD STOP]` 并提示可能已有活跃 change

**失败输出：**
```
[HARD STOP] Entry check failed for comet-open
  Expected: .comet.yaml does not exist, proposal.md + design.md + tasks.md exist
  Actual:   <实际状态>
  Suggestion: Check if another change with the same name is already active.
```

验证通过后才进入步骤 1。
```

- [ ] **Step 2: 在 .comet.yaml 创建指令后追加写入验证**

在 `### 3. 初始化 Comet 状态` 的 YAML 代码块之后追加：

```markdown

【写入验证】创建完成后必须验证：
  cat openspec/changes/<name>/.comet.yaml
  确认 workflow 行的值为 "full"
  确认 phase 行的值为 "design"
  确认 design_doc 行的值为 "null"
  确认 plan 行的值为 "null"
  确认 build_mode 行的值为 "null"
  确认 verify_mode 行的值为 "null"
  确认 verify_result 行的值为 "pending"
  确认 verified_at 行的值为 "null"
  确认 archived 行的值为 "false"
  如任一字段不匹配，重试写入后再次验证。最多重试 2 次，仍失败则报告错误并终止。
```

- [ ] **Step 3: 提交**

```bash
git add assets/skills/comet-open/SKILL.md
git commit -m "feat: add entry verify and write-then-verify to comet-open"
```

---

### Task 2: comet-design — 入口校验 + 写入验证

**Files:**
- Modify: `assets/skills/comet-design/SKILL.md`

- [ ] **Step 1: 在 comet-design SKILL.md 开头插入 Step 0 入口自校验**

在 `## 前置条件` 段落后、`## 步骤` 段落前插入：

```markdown
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
  Expected: phase=design, design_doc=<empty>, workflow=full
  Actual:   phase=<实际值>, design_doc=<实际值>, workflow=<实际值>
  Suggestion: Run comet-open first, or check if .comet.yaml was modified out of sequence.
```

验证通过后才进入步骤 1。
```

- [ ] **Step 2: 在 .comet.yaml 退出写入后追加写入验证**

在 `### 2. 更新 Comet 状态` 的 YAML 代码块之后追加：

```markdown

【写入验证】更新完成后必须验证：
  cat openspec/changes/<name>/.comet.yaml
  确认 phase 行的值为 "build"
  确认 design_doc 行的值为 "docs/superpowers/specs/YYYY-MM-DD-topic-design.md"
  如任一字段不匹配，重试写入后再次验证。最多重试 2 次，仍失败则报告错误并终止。
```

- [ ] **Step 3: 提交**

```bash
git add assets/skills/comet-design/SKILL.md
git commit -m "feat: add entry verify and write-then-verify to comet-design"
```

---

### Task 3: comet-build — 入口校验 + 3 处写入验证

**Files:**
- Modify: `assets/skills/comet-build/SKILL.md`

- [ ] **Step 1: 在 comet-build SKILL.md 开头插入 Step 0 入口自校验**

在 `## 前置条件` 段落后、`## 步骤` 段落前插入：

```markdown
### 0. 入口状态验证（Entry Check）

在执行任何操作之前，读取并验证当前状态：

**检查清单：**
1. `openspec/changes/<name>/.comet.yaml` 存在
2. `phase` 字段的值为 `"build"`
3. `design_doc` 字段非 null 且非空
4. `design_doc` 引用的文件存在（例如 `docs/superpowers/specs/YYYY-MM-DD-topic-design.md`）
5. `openspec/changes/<name>/proposal.md` 存在且非空
6. `openspec/changes/<name>/tasks.md` 存在且非空

**验证方式：**
- `cat openspec/changes/<name>/.comet.yaml` 读取全部字段
- 用 `ls` 或 `test -f` 确认 design_doc 文件存在

**失败输出：**
```
[HARD STOP] Entry check failed for comet-build
  Expected: phase=build, design_doc=<path> exists
  Actual:   phase=<实际值>, design_doc=<实际值>
  Suggestion: Run comet-design first, or verify design_doc file exists.
```

验证通过后才进入步骤 1。
```

- [ ] **Step 2: 在 plan 写入后追加验证**

在 `### 2. 更新计划状态` 的 YAML 代码块之后追加：

```markdown

【写入验证】更新完成后必须验证：
  cat openspec/changes/<name>/.comet.yaml
  确认 plan 行的值为 "docs/superpowers/plans/YYYY-MM-DD-feature.md"
  如不匹配，重试写入后再次验证。最多重试 2 次，仍失败则报告错误并终止。
```

- [ ] **Step 3: 在 build_mode 写入后追加验证**

在 `### 3. 选择执行方式` 的 few-shot 示例之后、`然后，**立即执行：**` 之前插入：

```markdown

【写入验证】更新完成后必须验证：
  cat openspec/changes/<name>/.comet.yaml
  确认 build_mode 行的值为 "<subagent-driven-development 或 executing-plans 或 direct>"
  如不匹配，重试写入后再次验证。最多重试 2 次，仍失败则报告错误并终止。
```

- [ ] **Step 4: 在退出 .comet.yaml 写入后追加验证**

在 `## 退出条件` 的 YAML 代码块之后追加：

```markdown

【写入验证】更新完成后必须验证：
  cat openspec/changes/<name>/.comet.yaml
  确认 phase 行的值为 "verify"
  确认 verify_result 行的值为 "pending"
  如任一字段不匹配，重试写入后再次验证。最多重试 2 次，仍失败则报告错误并终止。
```

- [ ] **Step 5: 提交**

```bash
git add assets/skills/comet-build/SKILL.md
git commit -m "feat: add entry verify and write-then-verify to comet-build"
```

---

### Task 4: comet-verify — 入口校验 + 2 处写入验证

**Files:**
- Modify: `assets/skills/comet-verify/SKILL.md`

- [ ] **Step 1: 在 comet-verify SKILL.md 开头插入 Step 0 入口自校验**

在 `## 前置条件` 段落后、`## 步骤` 段落前插入：

```markdown
### 0. 入口状态验证（Entry Check）

在执行任何操作之前，读取并验证当前状态：

**检查清单：**
1. `openspec/changes/<name>/.comet.yaml` 存在
2. `phase` 字段的值为 `"verify"`
3. `verify_result` 字段为 `"pending"` 或 null（尚未验证通过）

**验证方式：**
- `cat openspec/changes/<name>/.comet.yaml` 读取全部字段
- 如 `verify_result` 已是 `"pass"`，说明此 change 已验证过

**失败输出：**
```
[HARD STOP] Entry check failed for comet-verify
  Expected: phase=verify, verify_result=pending|null
  Actual:   phase=<实际值>, verify_result=<实际值>
  Suggestion: Run comet-build first, or this change was already verified.
```

验证通过后才进入步骤 1。
```

- [ ] **Step 2: 在 verify_mode 写入后追加验证**

在 `### 1. 改动规模评估` 的 few-shot 示例之后、`### 2a. 轻量验证` 之前插入：

```markdown

【写入验证】更新完成后必须验证：
  cat openspec/changes/<name>/.comet.yaml
  确认 verify_mode 行的值为 "<light 或 full>"
  如不匹配，重试写入后再次验证。最多重试 2 次，仍失败则报告错误并终止。
```

- [ ] **Step 3: 在退出 .comet.yaml 写入后追加验证**

在 `## 退出条件` 的 YAML 代码块之后追加：

```markdown

【写入验证】更新完成后必须验证：
  cat openspec/changes/<name>/.comet.yaml
  确认 phase 行的值为 "archive"
  确认 verify_result 行的值为 "pass"
  确认 verified_at 行的值非空（格式为 YYYY-MM-DD）
  如任一字段不匹配，重试写入后再次验证。最多重试 2 次，仍失败则报告错误并终止。
```

- [ ] **Step 4: 提交**

```bash
git add assets/skills/comet-verify/SKILL.md
git commit -m "feat: add entry verify and write-then-verify to comet-verify"
```

---

### Task 5: comet-archive — 入口校验 + 写入验证

**Files:**
- Modify: `assets/skills/comet-archive/SKILL.md`

- [ ] **Step 1: 在 comet-archive SKILL.md 开头插入 Step 0 入口自校验**

在 `## 前置条件` 段落后、`## 步骤` 段落前插入：

```markdown
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
```

- [ ] **Step 2: 在退出 .comet.yaml 写入后追加验证**

在 `## 退出条件` 的 YAML 代码块之后追加：

```markdown

【写入验证】更新完成后必须验证：
  cat openspec/changes/<name>/.comet.yaml
  确认 phase 行的值为 "archive"
  确认 archived 行的值为 "true"
  如任一字段不匹配，重试写入后再次验证。最多重试 2 次，仍失败则报告错误并终止。
```

- [ ] **Step 3: 在 .comet.yaml 移动指令后追加验证**

在 `### 1b. 移动 Comet 状态文件` 的 bash 代码块之后追加：

```markdown

【写入验证】移动完成后必须验证：
  test -f openspec/changes/archive/YYYY-MM-DD-<name>/.comet.yaml
  确认归档目录中 .comet.yaml 存在
  如文件不在预期位置，检查 mv 命令是否成功执行。
```

- [ ] **Step 4: 提交**

```bash
git add assets/skills/comet-archive/SKILL.md
git commit -m "feat: add entry verify and write-then-verify to comet-archive"
```

---

### Task 6: comet-hotfix — 入口校验 + 创建写入验证

**Files:**
- Modify: `assets/skills/comet-hotfix/SKILL.md`

- [ ] **Step 1: 在 comet-hotfix SKILL.md 开头插入 Step 0 入口自校验**

在 `## 流程（preset workflow，4 阶段）` 段落前插入：

```markdown
### 0. 入口状态验证（Entry Check）

在执行任何操作之前，验证当前状态：

**检查清单：**
1. `openspec/changes/<name>/` 目录不存在，或目录存在但 `.comet.yaml` 不存在（无冲突）

**验证方式：**
- `test -d openspec/changes/<name>` 检查目录
- 如目录存在，`test -f openspec/changes/<name>/.comet.yaml` 检查配置文件
- 如 `.comet.yaml` 已存在，读取 `phase` 检查是否为未完成的 hotfix

**失败输出（有冲突）：**
```
[HARD STOP] Entry check failed for comet-hotfix
  Expected: openspec/changes/<name>/.comet.yaml does not exist (new change)
  Actual:   .comet.yaml exists with phase=<phase>
  Suggestion: Pick a different change name, or check if an existing hotfix is in progress.
```

验证通过后才进入流程步骤。
```

- [ ] **Step 2: 在 .comet.yaml 创建指令后追加写入验证**

在 `### 1. 快速开启（preset open）` 的 YAML 代码块之后追加：

```markdown

【写入验证】创建完成后必须验证：
  cat openspec/changes/<name>/.comet.yaml
  确认 workflow 行的值为 "hotfix"
  确认 phase 行的值为 "build"
  确认 design_doc 行的值为 "null"
  确认 plan 行的值为 "null"
  确认 build_mode 行的值为 "direct"
  确认 verify_mode 行的值为 "light"
  确认 verify_result 行的值为 "pending"
  确认 verified_at 行的值为 "null"
  确认 archived 行的值为 "false"
  如任一字段不匹配，重试写入后再次验证。最多重试 2 次，仍失败则报告错误并终止。
```

- [ ] **Step 3: 提交**

```bash
git add assets/skills/comet-hotfix/SKILL.md
git commit -m "feat: add entry verify and write-then-verify to comet-hotfix"
```

---

### Task 7: comet-tweak — 入口校验 + 创建写入验证

**Files:**
- Modify: `assets/skills/comet-tweak/SKILL.md`

- [ ] **Step 1: 在 comet-tweak SKILL.md 开头插入 Step 0 入口自校验**

在 `## 流程（preset workflow，4 阶段）` 段落前插入：

```markdown
### 0. 入口状态验证（Entry Check）

在执行任何操作之前，验证当前状态：

**检查清单：**
1. `openspec/changes/<name>/` 目录不存在，或目录存在但 `.comet.yaml` 不存在（无冲突）

**验证方式：**
- `test -d openspec/changes/<name>` 检查目录
- 如目录存在，`test -f openspec/changes/<name>/.comet.yaml` 检查配置文件
- 如 `.comet.yaml` 已存在，读取 `phase` 检查是否为未完成的 tweak

**失败输出（有冲突）：**
```
[HARD STOP] Entry check failed for comet-tweak
  Expected: openspec/changes/<name>/.comet.yaml does not exist (new change)
  Actual:   .comet.yaml exists with phase=<phase>
  Suggestion: Pick a different change name, or check if an existing tweak is in progress.
```

验证通过后才进入流程步骤。
```

- [ ] **Step 2: 在 .comet.yaml 创建指令后追加写入验证**

在 `### 1. 快速开启（preset open）` 的 YAML 代码块之后追加：

```markdown

【写入验证】创建完成后必须验证：
  cat openspec/changes/<name>/.comet.yaml
  确认 workflow 行的值为 "tweak"
  确认 phase 行的值为 "build"
  确认 design_doc 行的值为 "null"
  确认 plan 行的值为 "null"
  确认 build_mode 行的值为 "direct"
  确认 verify_mode 行的值为 "light"
  确认 verify_result 行的值为 "pending"
  确认 verified_at 行的值为 "null"
  确认 archived 行的值为 "false"
  如任一字段不匹配，重试写入后再次验证。最多重试 2 次，仍失败则报告错误并终止。
```

- [ ] **Step 3: 提交**

```bash
git add assets/skills/comet-tweak/SKILL.md
git commit -m "feat: add entry verify and write-then-verify to comet-tweak"
```

---

### Task 8: 新建 comet-yaml-validate.sh

**Files:**
- Create: `assets/skills/comet/scripts/comet-yaml-validate.sh`

- [ ] **Step 1: 创建脚本文件**

```bash
#!/bin/bash
# Comet YAML Schema Validator — validates .comet.yaml structure
# Usage: comet-yaml-validate.sh <change-name>
# Exit 0 = valid, exit 1 = errors found (printed to stderr)

set -euo pipefail

CHANGE="$1"
YAML="openspec/changes/$CHANGE/.comet.yaml"

red()   { echo -e "\033[31m$1\033[0m" >&2; }
green() { echo -e "\033[32m$1\033[0m" >&2; }
warn()  { echo -e "\033[33m$1\033[0m" >&2; }

ERRORS=0
WARNINGS=0

# Helper: get value of a top-level field (handles null, empty, quoted)
field_value() {
  grep "^${1}:" "$YAML" 2>/dev/null | sed "s/^${1}: *//" | tr -d '"' | tr -d "'" || true
}

fail()  { red "  FAIL: $1"; ERRORS=$((ERRORS + 1)); }
warn_msg() { warn "  WARN: $1"; WARNINGS=$((WARNINGS + 1)); }

echo "[VALIDATE] $YAML" >&2

# --- Required fields ---
REQUIRED_FIELDS="workflow phase design_doc plan build_mode verify_mode verify_result verified_at archived"
for field in $REQUIRED_FIELDS; do
  if ! grep -q "^${field}:" "$YAML" 2>/dev/null; then
    fail "missing required field '$field'"
  fi
done

# --- Enum validation ---
validate_enum() {
  local field="$1" value="$2"
  shift 2
  local valid_values="$*"

  # null or empty is always acceptable
  if [ -z "$value" ] || [ "$value" = "null" ]; then
    return 0
  fi

  for v in $valid_values; do
    if [ "$value" = "$v" ]; then
      return 0
    fi
  done
  fail "$field='$value' is not valid. Expected: $valid_values"
}

workflow=$(field_value "workflow")
phase=$(field_value "phase")
build_mode=$(field_value "build_mode")
verify_mode=$(field_value "verify_mode")
verify_result=$(field_value "verify_result")
archived=$(field_value "archived")
design_doc=$(field_value "design_doc")
plan=$(field_value "plan")

validate_enum "workflow"      "$workflow"      "full hotfix tweak"
validate_enum "phase"         "$phase"          "design build verify archive"
validate_enum "build_mode"    "$build_mode"     "subagent-driven-development executing-plans direct"
validate_enum "verify_mode"   "$verify_mode"    "light full"
validate_enum "verify_result" "$verify_result"  "pending pass fail"
validate_enum "archived"      "$archived"       "true false"

# --- Path validation ---

if [ -n "$design_doc" ] && [ "$design_doc" != "null" ]; then
  if [ ! -f "$design_doc" ]; then
    fail "design_doc='$design_doc' does not exist on disk"
  fi
fi

if [ -n "$plan" ] && [ "$plan" != "null" ]; then
  if [ ! -f "$plan" ]; then
    fail "plan='$plan' does not exist on disk"
  fi
fi

# --- Unknown keys check ---
KNOWN_KEYS="workflow phase design_doc plan build_mode verify_mode verify_result verified_at archived"
while IFS=: read -r key _; do
  key="${key// /}"
  [ -z "$key" ] && continue
  found=0
  for known in $KNOWN_KEYS; do
    [ "$key" = "$known" ] && found=1 && break
  done
  if [ "$found" -eq 0 ]; then
    warn_msg "unknown field '$key' found"
  fi
done < "$YAML"

# --- Summary ---
echo "" >&2
if [ "$ERRORS" -gt 0 ]; then
  red "$ERRORS error(s), $WARNINGS warning(s) — validation FAILED"
  exit 1
else
  green "0 errors, $WARNINGS warning(s) — validation PASSED"
  exit 0
fi
```

- [ ] **Step 2: 语法检查**

```bash
bash -n assets/skills/comet/scripts/comet-yaml-validate.sh
```

- [ ] **Step 3: 提交**

```bash
git add assets/skills/comet/scripts/comet-yaml-validate.sh
git commit -m "feat: add comet-yaml-validate.sh for .comet.yaml schema validation"
```

---

### Task 9: comet-guard.sh — preflight 集成 validate 调用

**Files:**
- Modify: `assets/skills/comet/scripts/comet-guard.sh`

- [ ] **Step 1: 在 preflight() 末尾新增 validate 调用**

在 `preflight()` 函数的末尾（`fi` 闭合之后、`}` 之前），新增 `comet-yaml-validate.sh` 调用。

找到 preflight 函数末尾的 `fi`：

```bash
  if [ "$actual_phase" != "$expected_phase" ]; then
    red "FATAL: .comet.yaml phase is '$actual_phase', expected '$expected_phase'"
    exit 1
  fi
}
```

修改为：

```bash
  if [ "$actual_phase" != "$expected_phase" ]; then
    red "FATAL: .comet.yaml phase is '$actual_phase', expected '$expected_phase'"
    exit 1
  fi

  # Schema validation
  local script_dir validate_script
  script_dir="$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")" 2>/dev/null || dirname "$0")"
  validate_script="$script_dir/comet-yaml-validate.sh"
  if [ -f "$validate_script" ]; then
    if ! bash "$validate_script" "$CHANGE" 2>/dev/null; then
      bash "$validate_script" "$CHANGE"
      red "FATAL: .comet.yaml schema validation failed"
      exit 1
    fi
  fi
}
```

- [ ] **Step 2: 语法检查**

```bash
bash -n assets/skills/comet/scripts/comet-guard.sh
```

- [ ] **Step 3: 提交**

```bash
git add assets/skills/comet/scripts/comet-guard.sh
git commit -m "feat: integrate comet-yaml-validate.sh into guard preflight"
```

---

### Task 10: manifest.json — 注册新脚本

**Files:**
- Modify: `assets/manifest.json`

- [ ] **Step 1: 在 skills 数组中新增条目**

将 `manifest.json` 从：

```json
{
  "version": "0.1.0",
  "skills": [
    "comet/SKILL.md",
    "comet/scripts/comet-guard.sh",
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

修改为：

```json
{
  "version": "0.1.0",
  "skills": [
    "comet/SKILL.md",
    "comet/scripts/comet-guard.sh",
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

- [ ] **Step 2: JSON 语法检查**

```bash
python -m json.tool assets/manifest.json > /dev/null && echo "Valid JSON"
```

- [ ] **Step 3: 提交**

```bash
git add assets/manifest.json
git commit -m "feat: register comet-yaml-validate.sh in manifest.json"
```

---

### Task 11: 全量验证

**Files:**
- 无新增文件

- [ ] **Step 1: 所有 bash 脚本语法检查**

```bash
bash -n assets/skills/comet/scripts/comet-guard.sh && echo "guard OK"
bash -n assets/skills/comet/scripts/comet-yaml-validate.sh && echo "validate OK"
```

- [ ] **Step 2: manifest.json 有效性检查**

```bash
python -m json.tool assets/manifest.json > /dev/null && echo "manifest OK"
```

- [ ] **Step 3: 检查所有 SKILL.md 文件 Step 0 一致性**

确认每个 SKILL.md 都有 `### 0. 入口状态验证` 或 `### 0. 入口状态验证（Entry Check）` 标题：

```bash
for f in assets/skills/comet-open/SKILL.md assets/skills/comet-design/SKILL.md assets/skills/comet-build/SKILL.md assets/skills/comet-verify/SKILL.md assets/skills/comet-archive/SKILL.md assets/skills/comet-hotfix/SKILL.md assets/skills/comet-tweak/SKILL.md; do
  echo -n "$f: "
  grep -c "入口状态验证" "$f"
done
```

期望：每行输出 `: 1`

- [ ] **Step 4: 检查所有 .comet.yaml 写入处都有写入验证**

```bash
for f in assets/skills/comet-open/SKILL.md assets/skills/comet-design/SKILL.md assets/skills/comet-build/SKILL.md assets/skills/comet-verify/SKILL.md assets/skills/comet-archive/SKILL.md assets/skills/comet-hotfix/SKILL.md assets/skills/comet-tweak/SKILL.md; do
  echo -n "$f: "
  grep -c "【写入验证】" "$f"
done
```

期望：
- comet-open: 1
- comet-design: 1
- comet-build: 3
- comet-verify: 2
- comet-archive: 2 (exit write + mv verify)
- comet-hotfix: 1
- comet-tweak: 1

- [ ] **Step 5: 提交**

```bash
git add -A
git diff --cached --stat
git commit -m "chore: final verification for agent reliability implementation"
```
