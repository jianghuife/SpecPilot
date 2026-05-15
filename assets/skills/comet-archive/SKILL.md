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

Before performing any operations, read and verify the current state:

**Checklist:**
1. `openspec/changes/<name>/.comet.yaml` exists
2. `phase` field value is `"archive"`
3. `verify_result` field value is `"pass"`
4. `archived` field is `"false"` or null (not yet archived)

**Verification method:**
- `cat openspec/changes/<name>/.comet.yaml` to read all fields
- If `verify_result` is not `"pass"`, must complete verification first

**Failure output:**
```
[HARD STOP] Entry check failed for comet-archive
  Expected: phase=archive, verify_result=pass, archived=false|null
  Actual:   phase=<actual-value>, verify_result=<actual-value>, archived=<actual-value>
  Suggestion: Run comet-verify first, or this change was already archived.
```

Proceed to Step 1 only after verification passes.

### 1. Execute Archive

Before archiving, if `verify_result` is not `pass`, stop archiving and return to `/comet-verify`.

**Immediately execute:** Use the Skill tool to load the `openspec-archive-change` skill. Skipping this step is prohibited.

After the skill loads, follow its guidance to archive. Automatic checks:
1. Artifact completion status (proposal, design, specs, tasks)
2. All tasks marked `[x]`
3. Delta specs sync status

### 1b. Move Comet State File

`openspec-archive-change` is not aware of `.comet.yaml`, so Comet needs to move this file itself after OpenSpec archiving completes:

```bash
mv openspec/changes/<name>/.comet.yaml openspec/changes/archive/YYYY-MM-DD-<name>/.comet.yaml
```

【Write verification】After move completion, must verify:
  test -f openspec/changes/archive/YYYY-MM-DD-<name>/.comet.yaml
  Confirm .comet.yaml exists in archive directory
  If file is not at expected location, check if mv command executed successfully.

### 2. Delta Spec Sync

Sync delta specs to main specs during archiving:

```
openspec/changes/<name>/specs/<capability>/spec.md
       ↓ sync
openspec/specs/<capability>/spec.md  ← main spec (persistent)
```

### 3. Design Doc & Plan Handling

Handle associated files under `docs/superpowers/` during archiving. If target file already has YAML frontmatter, merge archive fields into existing frontmatter; if no frontmatter, create new frontmatter.

**3a. Design Doc Consistency Annotation**

Find design documents associated with current change in `docs/superpowers/specs/`:
- Compare delta spec final version with design doc content
- If there are discrepancies (incremental spec modifications during implementation), set the following metadata in design doc's YAML frontmatter:

```yaml
---
archived-with: YYYY-MM-DD-<name>
status: superseded-by-main-spec
implementation-notes: |
  <briefly describe key changes deviating from original design during implementation>
---
```

- If completely consistent, only set:

```yaml
---
archived-with: YYYY-MM-DD-<name>
status: final
---
```

**3b. Plan Association Annotation**

Find implementation plans associated with current change in `docs/superpowers/plans/`, set the same `archived-with` metadata in YAML frontmatter.

### 4. Archive Directory

Change moves to archive directory:

```
openspec/changes/archive/YYYY-MM-DD-<name>/
├── .openspec.yaml
├── .comet.yaml
├── proposal.md
├── design.md
├── specs/<capability>/spec.md
└── tasks.md
```

### 5. Lifecycle Closed Loop

Spec lifecycle completes here:
```
brainstorming → delta spec → implementation (incremental modifications) → verification → main spec sync → design doc annotation → archive
```

## Exit Conditions

- Change archived (removed from active list)
- Main specs updated (delta → main sync complete)
- Associated design doc annotated with archive status
- Associated plan annotated with archive status
- `.comet.yaml` `archived` recorded as `true`
- **Phase guard**: Run `bash $COMET_GUARD <change-name> archive`, confirm archive complete after all PASS

After archiving completes, update `.comet.yaml` in archive directory:

```yaml
phase: archive
archived: true
```

【Write verification】After update completion, must verify:
  cat openspec/changes/archive/YYYY-MM-DD-<name>/.comet.yaml
  Confirm phase line value is "archive"
  Confirm archived line value is "true"
  If any field does not match, retry write then verify again. Maximum 2 retries, report error and terminate if still fails.

## Complete

Comet workflow complete. To start new work, invoke `/comet` or `/comet-open`.
