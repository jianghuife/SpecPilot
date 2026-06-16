#!/bin/bash
# Comet Plan Lint — validate implementation plan structure before build execution.
# Usage: comet-plan-lint.sh <plan-file>

set -euo pipefail

red() { echo -e "\033[31m$1\033[0m" >&2; }

validate_plan_path() {
  local value="$1"
  if [ -z "$value" ]; then
    red "ERROR: Plan file path cannot be empty"
    exit 1
  fi
  case "$value" in
    /*|~*|[A-Za-z]:*|\\*)
      red "ERROR: plan file must be a relative path within the repo: '$value'"
      exit 1
      ;;
  esac
  if [[ "$value" =~ \.\. ]]; then
    red "ERROR: plan file cannot contain '..': '$value'"
    exit 1
  fi
}

failures=0

fail() {
  printf 'PLAN_LINT FAIL: %s\n' "$1"
  failures=$((failures + 1))
}

pass() {
  printf 'PLAN_LINT PASS: %s\n' "$1"
}

plan_file="${1:-}"
validate_plan_path "$plan_file"

if [ ! -f "$plan_file" ]; then
  red "ERROR: Plan file not found: $plan_file"
  exit 1
fi

if awk 'NR == 1 && $0 == "---" { found = 1 } END { exit found ? 0 : 1 }' "$plan_file"; then
  pass "frontmatter starts at first line"
else
  fail "frontmatter must start at first line"
fi

for field in "change" "design-doc" "base-ref"; do
  if awk -v field="$field" 'index($0, field ":") == 1 { found = 1 } END { exit found ? 0 : 1 }' "$plan_file"; then
    pass "frontmatter includes $field"
  else
    fail "frontmatter missing $field"
  fi
done

if awk '/^- \[[ xX]\] / { found = 1 } END { exit found ? 0 : 1 }' "$plan_file"; then
  pass "contains checkbox tasks"
else
  fail "plan must contain checkbox tasks"
fi

if awk '{ line = tolower($0) } line ~ /(test|verify|verification|build|lint|vitest|pytest|go test|cargo test|npm test|pnpm test)/ { found = 1 } END { exit found ? 0 : 1 }' "$plan_file"; then
  pass "contains verification guidance"
else
  fail "plan must include test/build/verification guidance"
fi

if awk '{ line = tolower($0) } line ~ /(tbd|todo|fixme|implement later|fill in details|appropriate error handling|write tests for the above|similar to task)/ { found = 1 } END { exit found ? 0 : 1 }' "$plan_file"; then
  fail "plan contains placeholder or vague wording"
else
  pass "no placeholder wording detected"
fi

if [ "$failures" -gt 0 ]; then
  printf 'PLAN_LINT_RESULT: fail (%s issue(s))\n' "$failures"
  exit 1
fi

printf 'PLAN_LINT_RESULT: pass\n'
