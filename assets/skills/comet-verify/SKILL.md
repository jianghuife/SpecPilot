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
COMET_SEARCH_ROOTS=("." "$HOME/.claude/skills" "$HOME/.codex/skills" "$HOME/.cursor/skills")
COMET_STATE="${COMET_STATE:-$(find "${COMET_SEARCH_ROOTS[@]}" -path '*/comet/scripts/comet-state.sh' -type f -print -quit 2>/dev/null)}"
COMET_GUARD="${COMET_GUARD:-$(find "${COMET_SEARCH_ROOTS[@]}" -path '*/comet/scripts/comet-guard.sh' -type f -print -quit 2>/dev/null)}"
bash "$COMET_STATE" check <name> verify
```

Proceed to Step 1 after verification passes. The script outputs specific failure reasons when verification fails.

### 1. Change Scale Assessment

Execute scale assessment:

```bash
bash "$COMET_STATE" scale <name>
```

Script automatically counts tasks, delta specs, and changed files to determine whether to use light or full verification mode, and sets the verify_mode field.

Before verification starts, inspect and handle uncommitted changes through `comet/reference/dirty-worktree.md`. Verify-specific handling:

1. If dirty diff belongs to the current change and involves implementation, tests, tasks, delta spec, or design doc changes, do not fix or commit directly in verify; record failure and return to build
2. If dirty diff is only a verify-phase artifact, such as a verification report draft or branch-handling record, continue in verify and record state
3. If dirty diff has implemented work but tasks.md is unchecked, treat it as stale build state; record failure and return to build so `/comet-build` verifies the implementation, checks off tasks, and commits

Return to build:

```bash
bash "$COMET_STATE" transition <name> verify-fail
```

Note: if the build phase committed after each task, worktree diff can underestimate change size. In that case, read the plan header `base-ref` and re-check the full commit range:

```bash
PLAN=$(bash "$COMET_STATE" get <name> plan)
BASE_REF=$(grep '^base-ref:' "$PLAN" 2>/dev/null | head -1 | sed 's/^base-ref: *//')
git diff --stat "$BASE_REF"...HEAD
```

If the commit range exceeds lightweight thresholds (> 5 files, cross-module coordination, or more than 1 delta spec capability), manually switch to full verification:

```bash
bash "$COMET_STATE" set <name> verify_mode full
```

### 2a. Lightweight Verification (Small Changes)

When scale assessment result is "small", skip `openspec-verify-change`, directly execute the following checks:

1. All tasks in tasks.md completed `[x]`
2. Changed files consistent with tasks.md description (compare `git diff --stat` / `git diff --cached --stat` / `git diff --stat <base-ref>...HEAD` against task content)
3. Build passes (run project-appropriate build command, e.g., `npm run build`, `mvn compile`, `cargo build`)
4. Related tests pass
5. No obvious security issues (no hardcoded secrets, no new unsafe operations)

**Pass standard**: All 5 items OK, no CRITICAL issues.

**When failing**: report failed items, record failure, move back to build, then invoke `/comet-build`.

```bash
bash "$COMET_STATE" transition <name> verify-fail
```

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

When verification fails: report missing items, record failure, move back to build, then invoke `/comet-build`.

```bash
bash "$COMET_STATE" transition <name> verify-fail
```

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

### 4. Record Verification Evidence

The verification report must be written to disk and recorded in `.comet.yaml`; branch handling must also be written to state after it completes. Do not manually set `verify_result: pass`; guard performs the transition.

```bash
mkdir -p docs/superpowers/reports
# Write this verification result to a report file, for example:
# docs/superpowers/reports/YYYY-MM-DD-<change-name>-verify.md

bash "$COMET_STATE" set <name> verification_report docs/superpowers/reports/YYYY-MM-DD-<change-name>-verify.md
bash "$COMET_STATE" set <name> branch_status handled
```

## Exit Conditions

- Verification report passed
- Branch handled
- `.comet.yaml` `verification_report` points to an existing verification report file
- `.comet.yaml` has `branch_status: handled`
- **Phase guard**: Run `bash "$COMET_GUARD" <change-name> verify --apply`; after all PASS, it uses `comet-state transition verify-pass` to advance to `phase: archive`

After verification and branch handling are complete, run guard to auto-transition:

```bash
bash "$COMET_GUARD" <change-name> verify --apply
```

State file is automatically updated to `phase: archive`, `verify_result: pass`, `verified_at: YYYY-MM-DD`.

## Automatic Transition

After exit conditions are met, **proceed immediately to the next phase without waiting for user input**:

> **REQUIRED NEXT SKILL:** Invoke `comet-archive` skill to enter the archiving phase.
