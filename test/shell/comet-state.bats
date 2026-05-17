#!/usr/bin/env bats

setup() {
  export TEST_TMPDIR="$(mktemp -d)"
  export SCRIPT_PATH="$BATS_TEST_DIRNAME/../../assets/skills/comet/scripts/comet-state.sh"
  cd "$TEST_TMPDIR"
  mkdir -p openspec/changes
}

teardown() {
  rm -rf "$TEST_TMPDIR"
}

# --- init subcommand ---

@test "init creates .comet.yaml with full workflow defaults" {
  run bash "$SCRIPT_PATH" init my-change full
  [ "$status" -eq 0 ]
  [ -f "openspec/changes/my-change/.comet.yaml" ]
  grep -q "phase: design" "openspec/changes/my-change/.comet.yaml"
  grep -q "verify_mode: null" "openspec/changes/my-change/.comet.yaml"
}

@test "init creates .comet.yaml with hotfix workflow defaults" {
  run bash "$SCRIPT_PATH" init hotfix-123 hotfix
  [ "$status" -eq 0 ]
  grep -q "phase: build" "openspec/changes/hotfix-123/.comet.yaml"
  grep -q "build_mode: direct" "openspec/changes/hotfix-123/.comet.yaml"
}

@test "init creates .comet.yaml with tweak workflow defaults" {
  run bash "$SCRIPT_PATH" init tweak-abc tweak
  [ "$status" -eq 0 ]
  grep -q "phase: build" "openspec/changes/tweak-abc/.comet.yaml"
  grep -q "isolation: branch" "openspec/changes/tweak-abc/.comet.yaml"
}

@test "init rejects duplicate .comet.yaml" {
  bash "$SCRIPT_PATH" init my-change full
  run bash "$SCRIPT_PATH" init my-change full
  [ "$status" -ne 0 ]
}

@test "init rejects invalid workflow" {
  run bash "$SCRIPT_PATH" init my-change invalid
  [ "$status" -ne 0 ]
}

@test "init rejects empty change name" {
  run bash "$SCRIPT_PATH" init "" full
  [ "$status" -ne 0 ]
}

@test "init rejects change name with special characters" {
  run bash "$SCRIPT_PATH" init "my change" full
  [ "$status" -ne 0 ]
}

@test "init rejects path traversal" {
  run bash "$SCRIPT_PATH" init ".." full
  [ "$status" -ne 0 ]
}

# --- get subcommand ---

@test "get retrieves field value" {
  bash "$SCRIPT_PATH" init my-change full
  run bash "$SCRIPT_PATH" get my-change phase
  [ "$status" -eq 0 ]
  [ "$output" = "design" ]
}

@test "get fails for missing change" {
  run bash "$SCRIPT_PATH" get nonexistent phase
  [ "$status" -ne 0 ]
}

# --- set subcommand ---

@test "set updates a field value" {
  bash "$SCRIPT_PATH" init my-change full
  run bash "$SCRIPT_PATH" set my-change phase build
  [ "$status" -eq 0 ]

  run bash "$SCRIPT_PATH" get my-change phase
  [ "$output" = "build" ]
}

@test "set rejects unknown field" {
  bash "$SCRIPT_PATH" init my-change full
  run bash "$SCRIPT_PATH" set my-change invalid_field value
  [ "$status" -ne 0 ]
}

@test "set validates phase enum" {
  bash "$SCRIPT_PATH" init my-change full
  run bash "$SCRIPT_PATH" set my-change phase invalid
  [ "$status" -ne 0 ]
}

@test "set validates verify_mode enum" {
  bash "$SCRIPT_PATH" init my-change full
  run bash "$SCRIPT_PATH" set my-change verify_mode invalid
  [ "$status" -ne 0 ]
}

@test "set validates archived enum" {
  bash "$SCRIPT_PATH" init my-change full
  run bash "$SCRIPT_PATH" set my-change archived maybe
  [ "$status" -ne 0 ]
}

@test "set allows free-form design_doc value" {
  bash "$SCRIPT_PATH" init my-change full
  run bash "$SCRIPT_PATH" set my-change design_doc "docs/design.md"
  [ "$status" -eq 0 ]
}

# --- check subcommand ---

@test "check open requires proposal, design, and tasks" {
  mkdir -p openspec/changes/my-change
  run bash "$SCRIPT_PATH" check open my-change
  [ "$status" -ne 0 ]
}

@test "check open passes with all required files" {
  mkdir -p openspec/changes/my-change
  echo "content" > openspec/changes/my-change/proposal.md
  echo "content" > openspec/changes/my-change/design.md
  echo "content" > openspec/changes/my-change/tasks.md
  run bash "$SCRIPT_PATH" check open my-change
  [ "$status" -eq 0 ]
}

@test "check design passes with correct state" {
  bash "$SCRIPT_PATH" init my-change full
  echo "content" > openspec/changes/my-change/proposal.md
  echo "content" > openspec/changes/my-change/design.md
  echo "content" > openspec/changes/my-change/tasks.md
  run bash "$SCRIPT_PATH" check design my-change
  [ "$status" -eq 0 ]
}

@test "check design fails if design_doc is set (not empty)" {
  bash "$SCRIPT_PATH" init my-change full
  bash "$SCRIPT_PATH" set my-change design_doc "some-doc.md"
  echo "content" > openspec/changes/my-change/proposal.md
  echo "content" > openspec/changes/my-change/design.md
  echo "content" > openspec/changes/my-change/tasks.md
  run bash "$SCRIPT_PATH" check design my-change
  [ "$status" -ne 0 ]
}

# --- scale subcommand ---

@test "scale defaults to light for small changes" {
  bash "$SCRIPT_PATH" init my-change full
  mkdir -p openspec/changes/my-change
  echo "- [ ] task 1" > openspec/changes/my-change/tasks.md
  run bash "$SCRIPT_PATH" scale my-change
  [ "$status" -eq 0 ]

  run bash "$SCRIPT_PATH" get my-change verify_mode
  [ "$output" = "light" ]
}

# --- usage errors ---

@test "unknown subcommand exits with error" {
  run bash "$SCRIPT_PATH" unknown-cmd
  [ "$status" -ne 0 ]
}

@test "init missing args shows usage" {
  run bash "$SCRIPT_PATH" init my-change
  [ "$status" -ne 0 ]
}

@test "get missing args shows usage" {
  run bash "$SCRIPT_PATH" get my-change
  [ "$status" -ne 0 ]
}

@test "set missing args shows usage" {
  run bash "$SCRIPT_PATH" set my-change phase
  [ "$status" -ne 0 ]
}

@test "check missing args shows usage" {
  run bash "$SCRIPT_PATH" check design
  [ "$status" -ne 0 ]
}

@test "scale missing args shows usage" {
  run bash "$SCRIPT_PATH" scale
  [ "$status" -ne 0 ]
}
