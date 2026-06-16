#!/bin/bash
# Comet Evidence — append durable workflow evidence records.
# Usage:
#   comet-evidence.sh path <change-name>
#   comet-evidence.sh record <change-name> <phase> <status> <summary>

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

change_dir_for() {
  local change_name="$1"
  if [ -d "openspec/changes/$change_name" ]; then
    printf '%s\n' "openspec/changes/$change_name"
  elif [ -d "openspec/changes/archive/$change_name" ]; then
    printf '%s\n' "openspec/changes/archive/$change_name"
  else
    printf '%s\n' "openspec/changes/$change_name"
  fi
}

evidence_path_for() {
  local change_name="$1"
  local change_dir
  change_dir=$(change_dir_for "$change_name")
  printf '%s\n' "$change_dir/.comet/evidence.jsonl"
}

json_escape() {
  awk '
    BEGIN { ORS = "" }
    {
      gsub(/\\/,"\\\\")
      gsub(/"/,"\\\"")
      gsub(/\t/,"\\t")
      gsub(/\r/,"\\r")
      gsub(/\n/,"\\n")
      print
    }
  '
}

cmd_path() {
  local change_name="$1"
  validate_change_name "$change_name"
  evidence_path_for "$change_name"
}

cmd_record() {
  local change_name="$1"
  local phase="$2"
  local status="$3"
  local summary="$4"
  validate_change_name "$change_name"

  case "$phase" in
    open|design|build|verify|archive|hotfix|tweak) ;;
    *)
      red "ERROR: Invalid phase: '$phase'"
      exit 1
      ;;
  esac

  case "$status" in
    pass|fail|warn|info|skip) ;;
    *)
      red "ERROR: Invalid status: '$status'"
      exit 1
      ;;
  esac

  if [ -z "$summary" ]; then
    red "ERROR: Summary cannot be empty"
    exit 1
  fi

  local evidence_path evidence_dir timestamp summary_json
  evidence_path=$(evidence_path_for "$change_name")
  evidence_dir=$(dirname "$evidence_path")
  mkdir -p "$evidence_dir"
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  summary_json=$(printf '%s' "$summary" | json_escape)

  printf '{"timestamp":"%s","change":"%s","phase":"%s","status":"%s","summary":"%s"}\n' \
    "$timestamp" "$change_name" "$phase" "$status" "$summary_json" >> "$evidence_path"

  printf 'EVIDENCE: %s\n' "$evidence_path"
}

usage() {
  cat >&2 <<'EOF'
Usage:
  comet-evidence.sh path <change-name>
  comet-evidence.sh record <change-name> <phase> <status> <summary>
EOF
  exit 1
}

cmd="${1:-}"
case "$cmd" in
  path)
    [ "$#" -eq 2 ] || usage
    cmd_path "$2"
    ;;
  record)
    [ "$#" -eq 5 ] || usage
    cmd_record "$2" "$3" "$4" "$5"
    ;;
  *)
    usage
    ;;
esac
