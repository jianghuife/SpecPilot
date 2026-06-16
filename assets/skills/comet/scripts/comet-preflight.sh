#!/bin/bash
# Comet Preflight — lightweight workflow readiness checks.
# Usage: comet-preflight.sh [change-name]

set -euo pipefail

red() { echo -e "\033[31m$1\033[0m" >&2; }

validate_change_name() {
  local name="$1"
  if [ -z "$name" ]; then
    red "ERROR: Change name cannot be empty"
    exit 1
  fi
  if [[ ! "$name" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    red "ERROR: Invalid change name: '$name'"
    red "Valid characters: a-z, A-Z, 0-9, -, _"
    exit 1
  fi
  if [[ "$name" =~ \.\. ]]; then
    red "ERROR: Change name cannot contain '..'"
    exit 1
  fi
}

yaml_field_from_file() {
  local field="$1"
  local file="$2"
  if [ ! -f "$file" ]; then
    return 0
  fi
  grep "^${field}:" "$file" 2>/dev/null | awk -F': *' 'NR == 1 { print $2 }' | awk '
    {
      out = ""
      quote = ""
      for (i = 1; i <= length($0); i++) {
        c = substr($0, i, 1)
        if (quote == "") {
          if (c == "\"" || c == "'\''") {
            quote = c
          } else if (c == "#" && (i == 1 || substr($0, i - 1, 1) ~ /[[:space:]]/)) {
            sub(/[[:space:]]+$/, "", out)
            print out
            next
          }
        } else if (c == quote) {
          quote = ""
        }
        out = out c
      }
      print out
    }
  '
}

first_config_value() {
  local field="$1"
  local change_name="${2:-}"
  local value=""
  if [ -n "$change_name" ] && [ -f "openspec/changes/$change_name/.comet.yaml" ]; then
    value=$(yaml_field_from_file "$field" "openspec/changes/$change_name/.comet.yaml" || true)
  fi
  if [ -z "$value" ]; then
    for file in ".comet.yaml" "comet.yaml" ".comet.yml" "comet.yml"; do
      if [ -f "$file" ]; then
        value=$(yaml_field_from_file "$field" "$file" || true)
        [ -n "$value" ] && break
      fi
    done
  fi
  printf '%s\n' "$value"
}

pass() {
  printf 'PREFLIGHT PASS: %s\n' "$1"
}

warn() {
  printf 'PREFLIGHT WARN: %s\n' "$1"
}

change_name="${1:-}"
if [ -n "$change_name" ]; then
  validate_change_name "$change_name"
fi

if git rev-parse --show-toplevel >/dev/null 2>&1; then
  pass "git repository detected"
else
  warn "git repository not detected"
fi

if command -v openspec >/dev/null 2>&1; then
  pass "openspec CLI available"
else
  warn "openspec CLI not available"
fi

if [ -f ".comet/config.yaml" ]; then
  pass ".comet/config.yaml present"
else
  warn ".comet/config.yaml not found"
fi

if [ -d ".codegraph" ]; then
  pass "CodeGraph index present"
else
  warn "CodeGraph index missing; run: codegraph init -i"
fi

if [ -f ".understand-anything/knowledge-graph.json" ]; then
  pass "Understand Anything graph present"
else
  warn "Understand Anything graph missing; run: /understand --language <current-language>"
fi

build_command=$(first_config_value "build_command" "$change_name")
verify_command=$(first_config_value "verify_command" "$change_name")

if [ -n "$build_command" ]; then
  pass "build_command configured: $build_command"
else
  warn "build_command not configured; guard will use auto-detection"
fi

if [ -n "$verify_command" ]; then
  pass "verify_command configured: $verify_command"
else
  warn "verify_command not configured; guard will use auto-detection"
fi
