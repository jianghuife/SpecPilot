#!/bin/bash
# Comet Phase Guard — validates exit conditions before phase transitions
# Usage: comet-guard.sh <change-name> <current-phase> [--apply]
# Phases: open, design, build, verify, archive
# Exit 0 = all checks pass, exit 1 = blocked (reasons printed to stderr)
# shellcheck disable=SC2329  # Functions called indirectly via check() dispatch

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
SCRIPT_DIR="$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")" 2>/dev/null || dirname "$0")"
if [[ "${3:-}" == "--apply" ]]; then
  APPLY=1
fi
CHANGE_DIR="openspec/changes/$CHANGE"
if [ "$PHASE" = "archive" ] && [ ! -d "$CHANGE_DIR" ] && [ -d "openspec/changes/archive/$CHANGE" ]; then
  CHANGE_DIR="openspec/changes/archive/$CHANGE"
fi

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

  if [ ! -d "$CHANGE_DIR" ]; then
    red "FATAL: change directory not found: $CHANGE_DIR"
    exit 1
  fi
  if [ ! -f "$CHANGE_DIR/.comet.yaml" ]; then
    red "FATAL: .comet.yaml not found in $CHANGE_DIR"
    exit 1
  fi

  # Schema validation
  local validate_script
  validate_script="$SCRIPT_DIR/comet-yaml-validate.sh"
  if [ -f "$validate_script" ]; then
    if ! bash "$validate_script" "$CHANGE" 2>/dev/null; then
      bash "$validate_script" "$CHANGE"
      red "FATAL: .comet.yaml schema validation failed"
      exit 1
    fi
  fi
}

build_passes() {
  if [ "${COMET_SKIP_BUILD:-0}" = "1" ]; then
    return 0
  fi
  if [ -f "package.json" ] && grep -q '"build"' "package.json"; then
    npm run build >/dev/null
    return $?
  fi
  if [ -f "pom.xml" ]; then
    mvn compile -q >/dev/null
    return $?
  fi
  if [ -f "Cargo.toml" ]; then
    cargo build >/dev/null
    return $?
  fi
  return 1
}

verify_result_is_pass() {
  local result
  result=$(yaml_field_value "verify_result" 2>/dev/null || true)
  [ "$result" = "pass" ]
}

verification_report_exists() {
  local report
  report=$(yaml_field_value "verification_report" 2>/dev/null || true)
  [ -n "$report" ] && [ "$report" != "null" ] && [ -f "$report" ]
}

branch_status_handled() {
  local status
  status=$(yaml_field_value "branch_status" 2>/dev/null || true)
  [ "$status" = "handled" ]
}

archived_is_true() {
  local val
  val=$(yaml_field_value "archived" 2>/dev/null || true)
  [ "$val" = "true" ]
}

# --- Phase-specific checks ---

guard_open() {
  echo "=== Guard: open → next ===" >&2

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
  check "Build passes" build_passes
}

guard_verify() {
  echo "=== Guard: verify → archive ===" >&2

  check "tasks.md all tasks checked" tasks_all_done
  check "Build passes" build_passes
  check "verification_report exists" verification_report_exists
  check "branch_status=handled" branch_status_handled
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
      open)   bash "$state_sh" transition "$CHANGE" open-complete ;;
      design) bash "$state_sh" transition "$CHANGE" design-complete ;;
      build)  bash "$state_sh" transition "$CHANGE" build-complete ;;
      verify) bash "$state_sh" transition "$CHANGE" verify-pass ;;
    esac
  else
    red "FATAL: comet-state.sh not found; cannot apply state transition"
    exit 1
  fi
}

# --- Main ---

case "$PHASE" in
  open)     preflight ; guard_open ;;
  design)   preflight ; guard_design ;;
  build)    preflight ; guard_build ;;
  verify)   preflight ; guard_verify ;;
  archive)  preflight ; guard_archive ;;
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
      open)
        new_phase=$(grep "^phase:" "$CHANGE_DIR/.comet.yaml" | sed 's/^phase: *//' | tr -d '"' | tr -d "'")
        green "  [APPLY] .comet.yaml updated: phase=$new_phase"
        ;;
      design) green "  [APPLY] .comet.yaml updated: phase=build" ;;
      build)  green "  [APPLY] .comet.yaml updated: phase=verify, verify_result=pending" ;;
      verify) green "  [APPLY] .comet.yaml updated: phase=archive, verify_result=pass" ;;
    esac
  fi
  exit 0
fi
