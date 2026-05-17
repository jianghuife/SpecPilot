#!/bin/bash
# Comet Phase Guard — validates exit conditions before phase transitions
# Usage: comet-guard.sh <change-name> <current-phase> [--apply]
# Phases: open, design, build, verify, archive
# Exit 0 = all checks pass, exit 1 = blocked (reasons printed to stderr)

set -euo pipefail

red() { echo -e "\033[31m$1\033[0m" >&2; }
green() { echo -e "\033[32m$1\033[0m" >&2; }
warn() { echo -e "\033[33m$1\033[0m" >&2; }

# Input validation - prevent path traversal
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

validate_change_name "$1"

CHANGE="$1"
PHASE="$2"
APPLY=0
if [[ "${3:-}" == "--apply" ]]; then
  APPLY=1
fi
CHANGE_DIR="openspec/changes/$CHANGE"

BLOCK=0
check() {
  local desc="$1"
  shift
  if "$@" 2>/dev/null; then
    green "  [PASS] $desc"
  else
    red "  [FAIL] $desc"
    BLOCK=1
  fi
}

# --- Helper functions ---

tasks_all_done() {
  local tasks="$CHANGE_DIR/tasks.md"
  [ -f "$tasks" ] || return 1
  grep -q '\- \[x\]' "$tasks" || return 1
  ! grep -q '\- \[ \]' "$tasks"
}

tasks_has_any() {
  local tasks="$CHANGE_DIR/tasks.md"
  [ -f "$tasks" ] && grep -q '\- \[' "$tasks"
}

yaml_field_value() {
  local field="$1"
  local yaml="$CHANGE_DIR/.comet.yaml"
  if [ -f "$yaml" ]; then
    grep "^${field}:" "$yaml" | sed "s/^${field}: *//" | tr -d '"' | tr -d "'"
  fi
}

file_nonempty() {
  [ -f "$1" ] && [ -s "$1" ]
}

preflight() {
  local expected_phase="$1"

  if [ ! -d "$CHANGE_DIR" ]; then
    red "FATAL: change directory not found: $CHANGE_DIR"
    exit 1
  fi
  if [ ! -f "$CHANGE_DIR/.comet.yaml" ]; then
    red "FATAL: .comet.yaml not found in $CHANGE_DIR"
    exit 1
  fi

  local actual_phase
  actual_phase=$(yaml_field_value "phase" 2>/dev/null || true)
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

maven_compiles() {
  if [ "${COMET_SKIP_BUILD:-0}" = "1" ]; then
    return 0
  fi
  mvn compile -q 2>/dev/null
}

verify_result_is_pass() {
  local result
  result=$(yaml_field_value "verify_result" 2>/dev/null || true)
  [ "$result" = "pass" ]
}

archived_is_true() {
  local val
  val=$(yaml_field_value "archived" 2>/dev/null || true)
  [ "$val" = "true" ]
}

# --- Phase-specific checks ---

guard_open() {
  echo "=== Guard: open → design ===" >&2

  check "proposal.md exists and non-empty" file_nonempty "$CHANGE_DIR/proposal.md"
  check "design.md exists and non-empty" file_nonempty "$CHANGE_DIR/design.md"
  check "tasks.md exists and non-empty" file_nonempty "$CHANGE_DIR/tasks.md"
  check "tasks.md has at least one task" tasks_has_any
}

guard_design() {
  echo "=== Guard: design → build ===" >&2

  local design_doc
  design_doc=$(yaml_field_value "design_doc" 2>/dev/null || true)

  check "proposal.md exists" file_nonempty "$CHANGE_DIR/proposal.md"
  check "tasks.md exists" file_nonempty "$CHANGE_DIR/tasks.md"

  if [ -n "$design_doc" ] && [ "$design_doc" != "null" ]; then
    check "Design Doc ($design_doc) exists" file_nonempty "$design_doc"
  else
    warn "  [WARN] No design_doc recorded in .comet.yaml"
  fi
}

guard_build() {
  echo "=== Guard: build → verify ===" >&2

  check "tasks.md all tasks checked" tasks_all_done
  check "proposal.md exists" file_nonempty "$CHANGE_DIR/proposal.md"
  check "Maven compile passes" maven_compiles
}

guard_verify() {
  echo "=== Guard: verify → archive ===" >&2

  check "verify_result is pass" verify_result_is_pass
  check "tasks.md all tasks checked" tasks_all_done
  check "Maven compile passes" maven_compiles
}

guard_archive() {
  echo "=== Guard: archive completeness ===" >&2

  check "archived is true" archived_is_true
  check "proposal.md exists" file_nonempty "$CHANGE_DIR/proposal.md"
  check "tasks.md all tasks checked" tasks_all_done
}

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

# --- Main ---

case "$PHASE" in
  open)     preflight "design"  ; guard_open ;;
  design)   preflight "build"   ; guard_design ;;
  build)    preflight "verify"  ; guard_build ;;
  verify)   preflight "archive" ; guard_verify ;;
  archive)  preflight "archive" ; guard_archive ;;
  *)
    red "Unknown phase: $PHASE"
    echo "Valid phases: open, design, build, verify, archive" >&2
    exit 1
    ;;
esac

if [ "$BLOCK" -eq 1 ]; then
  echo "" >&2
  red "BLOCKED — fix failing checks before proceeding to next phase"
  exit 1
else
  echo "" >&2
  green "ALL CHECKS PASSED — ready for next phase"
  if [ "$APPLY" -eq 1 ]; then
    apply_state_update "$PHASE"
    case "$PHASE" in
      open)   green "  [APPLY] .comet.yaml updated: phase=design" ;;
      design) green "  [APPLY] .comet.yaml updated: phase=build" ;;
      build)  green "  [APPLY] .comet.yaml updated: phase=verify, verify_result=pending" ;;
      verify) green "  [APPLY] .comet.yaml updated: phase=archive, verify_result=pass" ;;
    esac
  fi
  exit 0
fi
