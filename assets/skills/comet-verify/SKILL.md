---
name: comet-verify
description: "Comet Phase 4: Verify and Complete. Invoke with /comet-verify. Verify implementation matches design, handle development branch."
---

# Comet Phase 4: Verify and Complete (Verify)

## Prerequisites

- Code has been committed (Phase 3 complete)
- All tasks in tasks.md are complete

## Steps

### 0. Entry State Verification (Entry Check)

Before performing any operations, read and verify the current state:

**Checklist:**
1. `openspec/changes/<name>/.comet.yaml` exists
2. `phase` field value is `"verify"`
3. `verify_result` field is `"pending"` or null (not yet verified)

**Verification method:**
- `cat openspec/changes/<name>/.comet.yaml` to read all fields
- If `verify_result` is already `"pass"`, this change has already been verified

**Failure output:**
```
[HARD STOP] Entry check failed for comet-verify
  Expected: phase=verify, verify_result=pending|null
  Actual:   phase=<actual-value>, verify_result=<actual-value>
  Suggestion: Run comet-build first, or this change was already verified.
```

Proceed to Step 1 only after verification passes.

### 1. Change Scale Assessment

Determine change scale based on the following metrics:

| Metric | Small (lightweight verification) | Large (full verification) |
|------|-------------------------------|--------------------------|
| tasks.md task count | ≤ 3 | > 3 |
| Changed file count (git diff --stat) | ≤ 5 | > 5 |
| Has delta spec | No | Yes |
| New capability added | No | Yes |

**Decision rule**: Any metric hitting "large" → full verification. All hitting "small" → lightweight verification.

After determination, record actual verification mode in `openspec/changes/<name>/.comet.yaml`. `verify_mode` only allows one of the following values:

- `light`
- `full`

Few-shot examples:

```yaml
# All metrics hit "small"
phase: verify
verify_mode: light
verify_result: pending
```

```yaml
# Any metric hits "large"
phase: verify
verify_mode: full
verify_result: pending
```

【Write verification】After update completion, must verify:
  cat openspec/changes/<name>/.comet.yaml
  Confirm verify_mode line value is "<light or full>"
  If not matching, retry write then verify again. Maximum 2 retries, report error and terminate if still fails.

### 2a. Lightweight Verification (Small Changes)

When scale assessment result is "small", skip `openspec-verify-change`, directly execute the following checks:

1. All tasks in tasks.md completed `[x]`
2. Changed files consistent with tasks.md description (`git diff --stat`对照 tasks content)
3. Build passes (for Maven projects, first execute `mvn spotless:apply`, then execute `mvn compile` or equivalent command)
4. Related tests pass
5. No obvious security issues (no hardcoded secrets, no new unsafe operations)

**Pass standard**: All 5 items OK, no CRITICAL issues.

**Report format**: Brief table listing 5 check results + PASS/FAIL.

**Skipped items** (not checked in lightweight verification):
- spec scenario coverage
- design doc consistency deep comparison
- code pattern consistency recommendations
- delta spec and design doc drift detection

### 2b. Full Verification (Large Changes)

When scale assessment result is "large":

**Immediately execute:** Use the Skill tool to load the `openspec-verify-change` skill. Skipping this step is prohibited.

After the skill loads, follow its guidance to verify. Check items:
1. All tasks in tasks.md completed (`[x]`)
2. Implementation matches design.md design decisions
3. Implementation matches brainstorming design document
4. All capability specification scenarios pass
5. proposal.md goals satisfied
6. No contradiction between delta spec and design doc (if Build phase had incremental spec modifications, check if design doc has corresponding records)
7. `docs/superpowers/specs/` associated design document can be located (file exists and relates to current change)

When verification fails: report missing items, return to Phase 3 to supplement (invoke `/comet-build`).

**Spec drift handling**:
- If check item 6 finds contradiction (delta spec has content but design doc doesn't reflect it), prompt user:
  - Option A: Append "Implementation Divergence" section to design doc recording deviation reason
  - Option B: Roll back to Build phase, supplement brainstorming to update design doc
  - Option C: Confirm deviation acceptable, continue verification (design doc will be marked as `superseded-by-main-spec` during archiving)

### 3. Completion (Superpowers)

**Immediately execute:** Use the Skill tool to load the `superpowers:finishing-a-development-branch` skill. Skipping this step is prohibited.

If `superpowers:finishing-a-development-branch` is unavailable, stop the process and prompt to install or enable Superpowers skills. Do not substitute this step with normal conversation.

After the skill loads, follow its guidance to complete. Branch handling options:
1. Local merge to main branch
2. Push and create PR
3. Keep branch (handle later)
4. Discard work

**Confirmation items**:
- Maven test or build commands have executed `mvn spotless:apply`
- All tests pass
- No remaining spotless formatting issues
- No hardcoded secrets or security issues

## Exit Conditions

- Verification report passed
- Branch handled
- `.comet.yaml` `verify_result` recorded as `pass`
- **Phase guard**: Run `bash $COMET_GUARD <change-name> verify`, allow transition only after all PASS

Before exit, merge and update the following fields in `.comet.yaml` (keep other fields unchanged):

```yaml
phase: archive
verify_result: pass
verified_at: YYYY-MM-DD
```

【Write verification】After update completion, must verify:
  cat openspec/changes/<name>/.comet.yaml
  Confirm phase line value is "archive"
  Confirm verify_result line value is "pass"
  Confirm verified_at line value is non-empty (format YYYY-MM-DD)
  If any field does not match, retry write then verify again. Maximum 2 retries, report error and terminate if still fails.

## Automatic Transition

After exit conditions are met, **proceed immediately to the next phase without waiting for user input**:

> **REQUIRED NEXT SKILL:** Invoke `comet-archive` skill to enter the archiving phase.
