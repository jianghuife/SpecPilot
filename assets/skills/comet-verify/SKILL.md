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

Execute entry verification:

```bash
COMET_STATE="${COMET_STATE:-$(find . -path '*/comet/scripts/comet-state.sh' -type f -print -quit)}"
bash "$COMET_STATE" check <name> verify
```

Proceed to Step 1 after verification passes. The script outputs specific failure reasons when verification fails.

### 1. Change Scale Assessment

Execute scale assessment:

```bash
bash "$COMET_STATE" scale <name>
```

Script automatically counts tasks, delta specs, and changed files to determine whether to use light or full verification mode, and sets the verify_mode field.

### 2a. Lightweight Verification (Small Changes)

When scale assessment result is "small", skip `openspec-verify-change`, directly execute the following checks:

1. All tasks in tasks.md completed `[x]`
2. Changed files consistent with tasks.md description (`git diff --stat`对照 tasks content)
3. Build passes (run project-appropriate build command, e.g., `npm run build`, `mvn compile`, `cargo build`)
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
- All tests pass
- No hardcoded secrets or security issues

## Exit Conditions

- Verification report passed
- Branch handled
- `.comet.yaml` `verify_result` recorded as `pass`
- **Phase guard**: Run `bash $COMET_GUARD <change-name> verify`, allow transition only after all PASS

Before exit, run guard to auto-transition:

```bash
bash $COMET_GUARD <change-name> verify --apply
```

State file is automatically updated to `phase: archive`, `verify_result: pass`, `verified_at: YYYY-MM-DD`.

## Automatic Transition

After exit conditions are met, **proceed immediately to the next phase without waiting for user input**:

> **REQUIRED NEXT SKILL:** Invoke `comet-archive` skill to enter the archiving phase.
