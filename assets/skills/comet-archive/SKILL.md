---
name: comet-archive
description: "Comet Phase 5: Archive. Invoke with /comet-archive. Sync delta spec to main spec, archive change."
---

# Comet Phase 5: Archive (Archive)

## Prerequisites

- Verification passed (Phase 4 complete)
- Branch handled
- `verify_result: pass` in `openspec/changes/<name>/.comet.yaml`

## Steps

### 0. Entry State Verification (Entry Check)

Execute entry verification:

```bash
COMET_STATE="${COMET_STATE:-$(find . -path '*/comet/scripts/comet-state.sh' -type f -print -quit)}"
bash "$COMET_STATE" check <name> archive
```

Proceed to Step 1 after verification passes. The script outputs specific failure reasons when verification fails.

### 1. Execute Archive

Run the archive script to automatically complete all steps:

```bash
COMET_ARCHIVE="${COMET_ARCHIVE:-$(find . -path '*/comet/scripts/comet-archive.sh' -type f -print -quit)}"
bash "$COMET_ARCHIVE" "<change-name>"
```

The script automatically executes:
1. Entry state validation (phase=archive, verify_result=pass, archived=false)
2. Delta spec sync to main spec (overwrite)
3. Design doc frontmatter annotation (archived-with, status)
4. Plan frontmatter annotation (archived-with)
5. Move change to archive directory
6. Update archived: true

If script returns non-zero exit code, report error and stop.
If script returns zero exit code, archive is complete.

Use `--dry-run` flag to preview without executing.

### 2. Lifecycle Closed Loop

Spec lifecycle completes here:
```
brainstorming → delta spec → implementation → verification → main spec overwrite → design doc annotation → archive
```

## Exit Conditions

- Archive script executed successfully (exit code 0)
- **Phase guard**: Run `bash $COMET_GUARD <change-name> archive`, confirm archive complete after all PASS

## Complete

Comet workflow complete. To start new work, invoke `/comet` or `/comet-open`.
