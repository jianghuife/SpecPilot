#!/bin/bash
# Comet State — unified interface for .comet.yaml state management
# Usage: comet-state.sh <subcommand> <change-name> [args...]
#
# Subcommands:
#   init <change-name> <workflow>  — Initialize .comet.yaml with workflow defaults
#   get <change-name> <field>       — Read a field value from .comet.yaml
#   set <change-name> <field> <val> — Update a field value
#   check <phase> <change-name>    — Verify entry requirements for a phase
#   scale <change-name>             — Assess and set verification mode based on metrics
#
# Workflows: full, hotfix, tweak
# Phases for check: open, design, build, verify, archive

set -euo pipefail

# --- Color output helpers ---

red() { echo -e "\033[31m$1\033[0m" >&2; }
green() { echo -e "\033[32m$1\033[0m" >&2; }
yellow() { echo -e "\033[33m$1\033[0m" >&2; }

# --- Script location ---

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Input validation ---

validate_change_name() {
  local name="$1"
  # Reject empty names
  if [ -z "$name" ]; then
    red "ERROR: Change name cannot be empty" >&2
    exit 1
  fi
  # Only allow alphanumeric, hyphens, and underscores
  if [[ ! "$name" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    red "ERROR: Invalid change name: '$name'" >&2
    red "Valid characters: a-z, A-Z, 0-9, -, _" >&2
    exit 1
  fi
  # Reject path traversal attempts
  if [[ "$name" =~ \.\. ]]; then
    red "ERROR: Change name cannot contain '..' (path traversal not allowed)" >&2
    exit 1
  fi
}

validate_enum() {
  local value="$1"
  shift
  local valid_values=("$@")

  for valid in "${valid_values[@]}"; do
    if [ "$value" = "$valid" ]; then
      return 0
    fi
  done

  red "ERROR: Invalid value: '$value'" >&2
  red "Valid values: ${valid_values[*]}" >&2
  exit 1
}

# --- Helper functions ---

yaml_field() {
  local field="$1"
  local yaml_file="$2"
  if [ -f "$yaml_file" ]; then
    grep "^${field}:" "$yaml_file" | sed "s/^${field}: *//" | tr -d '"' | tr -d "'"
  fi
}

file_nonempty() {
  [ -f "$1" ] && [ -s "$1" ]
}

# --- Subcommands ---

cmd_init() {
  local change_name="$1"
  local workflow="$2"

  validate_change_name "$change_name"
  validate_enum "$workflow" "full" "hotfix" "tweak"

  local change_dir="openspec/changes/$change_name"
  local yaml_file="$change_dir/.comet.yaml"

  # Check if .comet.yaml already exists
  if [ -f "$yaml_file" ]; then
    red "ERROR: .comet.yaml already exists at $yaml_file"
    exit 1
  fi

  # Create change directory if it doesn't exist
  mkdir -p "$change_dir"

  # Set workflow-appropriate defaults
  local phase build_mode isolation verify_mode

  case "$workflow" in
    full)
      phase="design"
      build_mode="null"
      isolation="null"
      verify_mode="null"
      ;;
    hotfix|tweak)
      phase="build"
      build_mode="direct"
      isolation="branch"
      verify_mode="light"
      ;;
  esac

  # Write .comet.yaml
  cat > "$yaml_file" <<EOF
workflow: $workflow
phase: $phase
build_mode: $build_mode
isolation: $isolation
verify_mode: $verify_mode
design_doc: null
plan: null
verify_result: pending
verified_at: null
archived: false
EOF

  green "Initialized: $yaml_file (workflow=$workflow)"
}

cmd_get() {
  local change_name="$1"
  local field="$2"

  validate_change_name "$change_name"

  local change_dir="openspec/changes/$change_name"
  local yaml_file="$change_dir/.comet.yaml"

  # Check if .comet.yaml exists
  if [ ! -f "$yaml_file" ]; then
    red "ERROR: .comet.yaml not found at $yaml_file"
    exit 1
  fi

  # Read and output the field value
  local value
  value=$(yaml_field "$field" "$yaml_file")
  echo "${value:-}"
}

cmd_set() {
  local change_name="$1"
  local field="$2"
  local value="$3"

  validate_change_name "$change_name"

  local change_dir="openspec/changes/$change_name"
  local yaml_file="$change_dir/.comet.yaml"

  # Check if .comet.yaml exists
  if [ ! -f "$yaml_file" ]; then
    red "ERROR: .comet.yaml not found at $yaml_file"
    exit 1
  fi

  # Validate field name
  case "$field" in
    workflow|phase|build_mode|isolation|verify_mode|verify_result|archived|design_doc|plan|verified_at)
      # Valid field
      ;;
    *)
      red "ERROR: Unknown field: '$field'" >&2
      red "Valid fields: workflow, phase, design_doc, plan, build_mode, isolation, verify_mode, verify_result, verified_at, archived" >&2
      exit 1
      ;;
  esac

  # Validate enum values
  case "$field" in
    workflow)
      validate_enum "$value" "full" "hotfix" "tweak"
      ;;
    phase)
      validate_enum "$value" "design" "build" "verify" "archive"
      ;;
    build_mode)
      validate_enum "$value" "subagent-driven-development" "executing-plans" "direct"
      ;;
    isolation)
      validate_enum "$value" "branch" "worktree"
      ;;
    verify_mode)
      validate_enum "$value" "light" "full"
      ;;
    verify_result)
      validate_enum "$value" "pending" "pass" "fail"
      ;;
    archived)
      validate_enum "$value" "true" "false"
      ;;
    design_doc|plan|verified_at)
      # No validation for path fields and date fields
      ;;
  esac

  # Write or update the field
  if grep -q "^${field}:" "$yaml_file"; then
    # Field exists, replace it
    sed -i "s/^${field}:.*/${field}: ${value}/" "$yaml_file"
  else
    # Field doesn't exist, append it
    echo "${field}: ${value}" >> "$yaml_file"
  fi

  green "[SET] ${field}=${value}"
}

# --- Check helpers for entry verification ---

CHECK_BLOCK=0

check_pass() {
  local msg="$1"
  echo "  $(green "[PASS]") $msg"
}

check_fail() {
  local msg="$1"
  echo "  $(red "[FAIL]") $msg"
  CHECK_BLOCK=1
}

check_nonempty() {
  local desc="$1"
  local path="$1"
  if file_nonempty "$path"; then
    check_pass "$desc non-empty"
  else
    check_fail "$desc missing or empty"
  fi
}

check_yaml_is() {
  local field="$1"
  local expected="$2"
  local change_name="$3"
  local actual
  actual=$(cmd_get "$change_name" "$field")
  if [ "$actual" = "$expected" ]; then
    check_pass "${field}=${actual} (expected: ${expected})"
  else
    check_fail "${field}=${actual} (expected: ${expected})"
  fi
}

check_yaml_empty() {
  local field="$1"
  local change_name="$2"
  local value
  value=$(cmd_get "$change_name" "$field")
  if [ -z "$value" ] || [ "$value" = "null" ]; then
    check_pass "${field} is empty/null"
  else
    check_fail "${field}=${value} (expected: empty/null)"
  fi
}

check_file_not_exists() {
  local desc="$1"
  local path="$2"
  if [ ! -f "$path" ]; then
    check_pass "$desc does not exist"
  else
    check_fail "$desc exists (should not exist)"
  fi
}

cmd_check() {
  local phase="$1"
  local change_name="$2"

  validate_change_name "$change_name"
  validate_enum "$phase" "open" "design" "build" "verify" "archive"

  local change_dir="openspec/changes/$change_name"
  local yaml_file="$change_dir/.comet.yaml"
  local proposal_file="$change_dir/proposal.md"
  local design_file="$change_dir/design.md"
  local tasks_file="$change_dir/tasks.md"

  echo "=== Entry Check: comet-${phase} ==="

  # For non-open phases, .comet.yaml must exist
  if [ "$phase" != "open" ]; then
    if [ ! -f "$yaml_file" ]; then
      red "ERROR: .comet.yaml not found at $yaml_file"
      exit 1
    fi
  fi

  # Phase-specific checks
  case "$phase" in
    open)
      check_file_not_exists ".comet.yaml" "$yaml_file"
      check_nonempty "proposal.md" "$proposal_file"
      check_nonempty "design.md" "$design_file"
      check_nonempty "tasks.md" "$tasks_file"
      ;;
    design)
      check_pass ".comet.yaml exists"
      check_yaml_is "phase" "design" "$change_name"
      check_yaml_is "workflow" "full" "$change_name"
      check_yaml_empty "design_doc" "$change_name"
      check_nonempty "proposal.md" "$proposal_file"
      check_nonempty "design.md" "$design_file"
      check_nonempty "tasks.md" "$tasks_file"
      ;;
    build)
      check_pass ".comet.yaml exists"
      check_yaml_is "phase" "build" "$change_name"
      # Check design_doc is non-null and file exists
      local design_doc
      design_doc=$(cmd_get "$change_name" "design_doc")
      if [ -n "$design_doc" ] && [ "$design_doc" != "null" ] && [ -f "$change_dir/$design_doc" ]; then
        check_pass "design_doc=${design_doc} (file exists)"
      else
        check_fail "design_doc=${design_doc} (expected: non-null and file exists)"
      fi
      check_nonempty "proposal.md" "$proposal_file"
      check_nonempty "tasks.md" "$tasks_file"
      ;;
    verify)
      check_pass ".comet.yaml exists"
      check_yaml_is "phase" "verify" "$change_name"
      # Check verify_result is pending or null
      local verify_result
      verify_result=$(cmd_get "$change_name" "verify_result")
      if [ "$verify_result" = "pending" ] || [ -z "$verify_result" ] || [ "$verify_result" = "null" ]; then
        check_pass "verify_result=${verify_result} (expected: pending or null)"
      else
        check_fail "verify_result=${verify_result} (expected: pending or null)"
      fi
      ;;
    archive)
      check_pass ".comet.yaml exists"
      check_yaml_is "phase" "archive" "$change_name"
      check_yaml_is "verify_result" "pass" "$change_name"
      # Check archived is NOT true
      local archived
      archived=$(cmd_get "$change_name" "archived")
      if [ "$archived" != "true" ]; then
        check_pass "archived=${archived} (expected: not true)"
      else
        check_fail "archived=${archived} (expected: not true)"
      fi
      ;;
    *)
      red "ERROR: Unknown phase for check: $phase"
      exit 1
      ;;
  esac

  echo ""
  if [ "$CHECK_BLOCK" -eq 1 ]; then
    red "BLOCKED — fix failing checks before proceeding"
    exit 1
  else
    green "ALL CHECKS PASSED — ready to proceed"
    exit 0
  fi
}

cmd_scale() {
  local change_name="$1"

  validate_change_name "$change_name"

  local change_dir="openspec/changes/$change_name"
  local yaml_file="$change_dir/.comet.yaml"

  # Verify .comet.yaml exists
  if [ ! -f "$yaml_file" ]; then
    red "ERROR: .comet.yaml not found at $yaml_file"
    exit 1
  fi

  # Read metrics
  # 1. Task count: count lines matching `- [` in tasks.md
  local tasks_file="$change_dir/tasks.md"
  local task_count=0
  if [ -f "$tasks_file" ]; then
    task_count=$(grep -c '^\- \[' "$tasks_file" 2>/dev/null || echo "0")
  fi

  # 2. Delta spec count: count files named spec.md under specs/*/spec.md
  local delta_spec_count=0
  if [ -d "$change_dir/specs" ]; then
    delta_spec_count=$(find "$change_dir/specs" -name "spec.md" -type f 2>/dev/null | wc -l | tr -d ' ')
  fi

  # 3. Changed files: from git diff --stat HEAD
  local changed_files=0
  if git rev-parse --git-dir > /dev/null 2>&1; then
    # Extract the number before "file" in the last line
    local stat_output
    stat_output=$(git diff --stat HEAD 2>/dev/null | tail -1)
    if [[ "$stat_output" =~ ([0-9]+)\ file ]]; then
      changed_files="${BASH_REMATCH[1]}"
    fi
  fi

  # Decision rules
  local result="light"
  if [ "$task_count" -gt 3 ] || [ "$delta_spec_count" -gt 1 ] || [ "$changed_files" -gt 5 ]; then
    result="full"
  fi

  # Output assessment to stderr
  echo "=== Scale Assessment: $change_name ===" >&2
  echo "  Tasks: $task_count (threshold: 3)" >&2
  echo "  Delta specs: $delta_spec_count capabilities (threshold: 1)" >&2
  echo "  Changed files: $changed_files (threshold: 5)" >&2
  echo "  → Result: $result" >&2

  # Update verify_mode in .comet.yaml
  sed -i "s/^verify_mode:.*/verify_mode: $result/" "$yaml_file"

  green "[SCALE] verify_mode=$result"
}

# --- Main ---

SUBCOMMAND="${1:-}"
shift || true

case "$SUBCOMMAND" in
  init)
    if [ $# -lt 2 ]; then
      red "Usage: comet-state.sh init <change-name> <workflow>" >&2
      red "Workflows: full, hotfix, tweak" >&2
      exit 1
    fi
    cmd_init "$@"
    ;;
  get)
    if [ $# -lt 2 ]; then
      red "Usage: comet-state.sh get <change-name> <field>" >&2
      exit 1
    fi
    cmd_get "$@"
    ;;
  set)
    if [ $# -lt 3 ]; then
      red "Usage: comet-state.sh set <change-name> <field> <value>" >&2
      exit 1
    fi
    cmd_set "$@"
    ;;
  check)
    if [ $# -lt 2 ]; then
      red "Usage: comet-state.sh check <phase> <change-name>" >&2
      red "Phases: open, design, build, verify, archive" >&2
      exit 1
    fi
    cmd_check "$@"
    ;;
  scale)
    if [ $# -lt 1 ]; then
      red "Usage: comet-state.sh scale <change-name>" >&2
      exit 1
    fi
    cmd_scale "$@"
    ;;
  *)
    red "Unknown subcommand: $SUBCOMMAND" >&2
    echo "" >&2
    echo "Usage: comet-state.sh <subcommand> <change-name> [args...]" >&2
    echo "" >&2
    echo "Subcommands:" >&2
    echo "  init <change-name> <workflow>  — Initialize .comet.yaml with workflow defaults" >&2
    echo "  get <change-name> <field>       — Read a field value from .comet.yaml" >&2
    echo "  set <change-name> <field> <val> — Update a field value in .comet.yaml" >&2
    echo "  check <phase> <change-name>    — Verify entry requirements for a phase" >&2
    echo "  scale <change-name>             — Assess and set verification mode based on metrics" >&2
    echo "" >&2
    echo "Workflows: full, hotfix, tweak" >&2
    echo "Phases for check: open, design, build, verify, archive" >&2
    exit 1
    ;;
esac
