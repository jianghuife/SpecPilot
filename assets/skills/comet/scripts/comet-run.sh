#!/bin/bash
# Comet Run — execute a command and record pass/fail evidence.
# Usage:
#   comet-run.sh <change-name> <phase> -- <command...>

set -euo pipefail

red() { echo -e "\033[31m$1\033[0m" >&2; }

usage() {
  cat >&2 <<'EOF'
Usage:
  comet-run.sh <change-name> <phase> -- <command...>
EOF
  exit 1
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd -P)"
evidence_script="${COMET_EVIDENCE:-$script_dir/comet-evidence.sh}"
bash_bin="${COMET_BASH:-${BASH:-bash}}"

change_name="${1:-}"
phase="${2:-}"
[ "$#" -ge 4 ] || usage
[ "$3" = "--" ] || usage
shift 3
[ "$#" -gt 0 ] || usage

if [ ! -f "$evidence_script" ]; then
  red "ERROR: comet-evidence.sh not found"
  exit 1
fi

command_text=$(printf '%s ' "$@" | awk '{ sub(/[[:space:]]+$/, ""); print }')

set +e
"$@"
exit_code=$?
set -e

if [ "$exit_code" -eq 0 ]; then
  "$bash_bin" "$evidence_script" record "$change_name" "$phase" pass "$command_text passed"
else
  "$bash_bin" "$evidence_script" record "$change_name" "$phase" fail "$command_text failed with exit $exit_code"
fi

exit "$exit_code"
