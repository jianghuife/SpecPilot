---
change: comet-archive-automation
status: draft
---

# Comet Archive Automation & State Auto-Update Design

## Overview

Optimize the Comet workflow by automating mechanical steps in the archive phase and eliminating manual `.comet.yaml` editing across all phase transitions. Two changes: (1) new `comet-archive.sh` script for one-command archiving, (2) `--apply` mode for `comet-guard.sh` to auto-update state files.

## Problem Statement

During the `brand-copyright-cleanup` change execution, the following friction was observed:

1. **Archive phase required 6 manual Edit/Bash calls**, each blocked by security hooks requiring fact confirmation
2. **Every phase transition required manual `.comet.yaml` editing** (5 transitions x 1-3 fields each)
3. **Delta spec sync, frontmatter annotation, and file moves** are mechanical steps that don't require agent judgment

## Part 1: `comet-archive.sh` Script

### Location

`assets/skills/comet/scripts/comet-archive.sh`

### Interface

```bash
comet-archive.sh <change-name> [--dry-run]
```

### Behavior

```
comet-archive.sh <change-name>
│
├── 1. Read .comet.yaml, extract design_doc and plan paths
├── 2. Validate entry state (phase=archive, verify_result=pass, archived=false)
├── 3. Compute archive name: YYYY-MM-DD-<change-name>
├── 4. Sync delta specs → main specs (openspec/specs/<capability>/spec.md)
├── 5. Annotate design doc frontmatter (archived-with, status)
├── 6. Annotate plan frontmatter (archived-with)
├── 7. mv openspec/changes/<name> → openspec/changes/archive/YYYY-MM-DD-<name>
├── 8. Update archive/.comet.yaml → archived: true
└── 9. Print archive summary
```

### Output Format

```
=== Comet Archive: <change-name> ===
  [OK] Entry state verified
  [OK] Delta spec synced: <capability> → openspec/specs/<capability>/spec.md
  [OK] Design doc annotated: <path>
  [OK] Plan annotated: <path>
  [OK] Moved to: openspec/changes/archive/YYYY-MM-DD-<change-name>/
  [OK] archived: true

Archive complete. N/N steps succeeded.
```

### Error Handling

| Scenario | Exit Code | Message |
|----------|-----------|---------|
| `.comet.yaml` not found | 1 | "FATAL: .comet.yaml not found in openspec/changes/<name>/" |
| `verify_result` != `pass` | 1 | "FATAL: verify_result is '<val>', expected 'pass'. Run comet-verify first." |
| `archived` == `true` | 1 | "FATAL: change already archived" |
| Archive directory exists | 1 | "FATAL: archive target already exists: <path>" |
| Delta spec has no main spec | 0 | Auto-create main spec file, continue |
| Design doc has no frontmatter | 0 | Create new frontmatter block, continue |
| YAML field parse failure | 1 | "FATAL: Cannot parse .comet.yaml field '<field>'" |

### Delta Spec Sync Logic

For each `openspec/changes/<name>/specs/<capability>/spec.md`:

1. Check if `openspec/specs/<capability>/spec.md` exists
2. If not exists: copy delta spec as main spec
3. If exists: append delta spec `## ADDED` sections to main spec
4. Preserve existing main spec content

### Frontmatter Annotation Logic

For design doc (`docs/superpowers/specs/*.md`):
- If has YAML frontmatter: merge `archived-with` and `status` fields
- If no frontmatter: create new frontmatter block
- `status` value: `final` (default) or `superseded-by-main-spec` (if user indicates divergence)

For plan (`docs/superpowers/plans/*.md`):
- Same frontmatter handling
- Always set `archived-with` field

## Part 2: `comet-guard.sh --apply` Mode

### Interface

```bash
comet-guard.sh <change-name> <phase> [--apply]
```

### Behavior

Without `--apply`: unchanged (validation only, exit 0/1).

With `--apply`: after all checks pass, auto-update `.comet.yaml`:

| Phase Transition | Fields Updated |
|-----------------|---------------|
| open → design | `phase: design` |
| design → build | `phase: build` |
| build → verify | `phase: verify`, `verify_result: pending` |
| verify → archive | `phase: archive`, `verify_result: pass`, `verified_at: YYYY-MM-DD` |

### Implementation

Add to `comet-guard.sh`:

```bash
apply_state_update() {
  local yaml="$CHANGE_DIR/.comet.yaml"
  local phase="$1"

  case "$phase" in
    open)
      sed -i 's/^phase:.*/phase: design/' "$yaml"
      ;;
    design)
      sed -i 's/^phase:.*/phase: build/' "$yaml"
      ;;
    build)
      sed -i 's/^phase:.*/phase: verify/' "$yaml"
      sed -i 's/^verify_result:.*/verify_result: pending/' "$yaml"
      ;;
    verify)
      sed -i 's/^phase:.*/phase: archive/' "$yaml"
      sed -i 's/^verify_result:.*/verify_result: pass/' "$yaml"
      echo "verified_at: $(date +%Y-%m-%d)" >> "$yaml"
      ;;
  esac
}
```

### Guard Output with --apply

```
=== Guard: build → verify ===
  [PASS] tasks.md all tasks checked
  [PASS] proposal.md exists
  [PASS] Maven compile passes

ALL CHECKS PASSED — ready for next phase
  [APPLY] .comet.yaml updated: phase=verify, verify_result=pending
```

## Part 3: Skill Definition Changes

### `comet-archive/SKILL.md`

Replace Steps 1b-4 with single script call:

```markdown
### 1. Execute Archive

Run the archive script:

```bash
COMET_SCRIPTS="$(dirname "$0")/comet/scripts"
bash "$COMET_SCRIPTS/comet-archive.sh" "<change-name>"
```

If script exits non-zero, report error and stop.
If script exits zero, archive is complete.
```

Remove: manual delta spec sync instructions, manual frontmatter annotation, manual file move, manual .comet.yaml update, write verification loops.

### Other Skills (comet-open, comet-design, comet-build, comet-verify)

Replace manual `.comet.yaml` update sections with:

```markdown
### Update State

Run guard with --apply to transition:

```bash
bash $COMET_GUARD <change-name> <current-phase> --apply
```

State file is updated automatically. No manual editing required.
```

Remove: "Merge and update the following fields" blocks, "Write verification" blocks.

### `comet/SKILL.md`

Update phase transition instructions to reference `--apply` mode.

## File Inventory

| File | Action | Description |
|------|--------|-------------|
| `assets/skills/comet/scripts/comet-archive.sh` | CREATE | Archive automation script |
| `assets/skills/comet/scripts/comet-guard.sh` | MODIFY | Add --apply mode |
| `assets/skills/comet/SKILL.md` | MODIFY | Reference --apply mode |
| `assets/skills/comet-open/SKILL.md` | MODIFY | Remove manual state editing |
| `assets/skills/comet-design/SKILL.md` | MODIFY | Remove manual state editing |
| `assets/skills/comet-build/SKILL.md` | MODIFY | Remove manual state editing |
| `assets/skills/comet-verify/SKILL.md` | MODIFY | Remove manual state editing |
| `assets/skills/comet-archive/SKILL.md` | MODIFY | Replace with script call |

## Success Criteria

1. `comet-archive.sh brand-copyright-cleanup` completes all 6 archive steps in one call
2. `comet-guard.sh <name> verify --apply` auto-updates .comet.yaml after validation
3. No manual .comet.yaml editing required in any phase transition
4. All existing guard checks still pass (backward compatible)
5. `--apply` is opt-in; without it, behavior unchanged
