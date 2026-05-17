---
name: comet-build
description: "Comet Phase 3: Plan and Build. Invoke with /comet-build. Create plans and execute implementation through subagent-driven-development."
---

# Comet Phase 3: Plan and Build (Build)

## Prerequisites

- Design Doc has been created (Phase 2 complete)
- Active change exists

## Steps

### 0. Entry State Verification (Entry Check)

Execute entry verification:

```bash
COMET_STATE="${COMET_STATE:-$(find . -path '*/comet/scripts/comet-state.sh' -type f -print -quit)}"
bash "$COMET_STATE" check <name> build
```

Proceed to Step 1 after verification passes. The script outputs specific failure reasons when verification fails.

### 1. Create Plan

**Immediately execute:** Use the Skill tool to load the `superpowers:writing-plans` skill. Skipping this step is prohibited.

After the skill loads, follow its guidance to create a plan. Plan requirements:
- Save to `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`
- Reference design document, break down into executable tasks
- **Plan file header must contain associated metadata**:

```yaml
---
change: <openspec-change-name>
design-doc: docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md
---
```

### 2. Update Plan Status

Record plan path:

```bash
bash "$COMET_STATE" set <name> plan docs/superpowers/plans/YYYY-MM-DD-feature.md
```

No manual phase update needed — guard auto-transitions when exit conditions are met.

### 3. Workspace Isolation

Plan has been written to the current branch. Before starting execution, choose workspace isolation method:

| Option | Method | Description |
|--------|--------|-------------|
| A | Create branch | Create a new branch in the current repo, simple and fast |
| B | Create Worktree | Isolated workspace, fully independent, suitable for parallel development |

**Recommendation rules**:
- Change involves ≤ 3 files → Recommend A
- Need parallel development, current branch has uncommitted work → Recommend B

After user selection, update `isolation` field. `isolation` only allows one of the following values:

```bash
bash "$COMET_STATE" set <name> isolation <value>
```

- `branch`
- `worktree`

**Execute isolation**:

- **branch**: Run `git checkout -b <change-name>`, subsequent work on the new branch
- **worktree**: Invoke `superpowers:using-git-worktrees` skill or use native `EnterWorktree` tool to create isolated workspace

After creating isolation, confirm plan file is accessible (naturally accessible with branch method; for worktree method, confirm plan has been committed).

### 4. Select Execution Method

Present plan summary to user (task count, involved modules), then ask for execution method:

| Option | Skill | Applicable Scenario |
|------|------|-------------------|
| A | `superpowers:subagent-driven-development` | Independent tasks, high complexity, requires two-phase review |
| B | `superpowers:executing-plans` | Simple tasks, no subagent environment, lightweight and fast |

**Recommendation rules**:
- Task count ≥ 3 → Recommend A
- Task count ≤ 2 and no cross-module dependencies → Recommend B
- From hotfix path → Recommend B

After user selection, update `build_mode` field. `build_mode` only allows one of the following values:

```bash
bash "$COMET_STATE" set <name> build_mode <value>
```

- `subagent-driven-development`
- `executing-plans`
- `direct` (only for hotfix preset use)

Then, **immediately execute:** Use the Skill tool to load the corresponding skill. Skipping this step is prohibited.

If the selected Superpowers skill is unavailable, stop the process and prompt to install or enable the corresponding skill. Do not substitute this step with normal conversation.

After the skill loads, follow its guidance to execute:
- Execute tasks according to plan
- Complete tasks.md check (`- [ ]` → `- [x]`)
- Commit code after each task completion

### 5. Spec Incremental Updates

When the initial spec is found incomplete during implementation, handle by scale:

| Scale | Trigger Conditions | Approach |
|------|-------------------|----------|
| Small | Missing acceptance scenarios, edge cases | Directly edit delta spec + design.md, append tasks.md tasks |
| Medium | Interface changes, new components, data flow changes | Re-run `superpowers:brainstorming` to update Design Doc + delta spec |
| Large | Brand-new capability requirements | `/opsx:new` to create independent change |

**50% Threshold Determination**: Using initial task count in tasks.md as baseline, if new tasks exceed half of that total, it's considered outside original plan scope, should consider splitting into new change.

**Principles**:
- Delta spec is a living document, can be modified at any time during this phase
- Each update should be committed with commit message explaining the change reason
- Do not sync to main spec in advance, sync uniformly during archiving
- If incremental tasks exceed 50% of initial tasks.md total task count, consider splitting into new change
- For small-scale incremental direct delta spec edits, note in commit message to facilitate design doc drift assessment during archiving

## Exit Conditions

- All tasks.md checked
- Code committed
- Tests pass
- `.comet.yaml` `phase` updated to `verify`
- **Phase guard**: Run `bash $COMET_GUARD <change-name> build`, allow transition only after all PASS

Before exit, run guard to auto-transition:

```bash
bash $COMET_GUARD <change-name> build --apply
```

State file is automatically updated to `phase: verify`, `verify_result: pending`.

## Automatic Transition

After exit conditions are met, **proceed immediately to the next phase without waiting for user input**:

> **REQUIRED NEXT SKILL:** Invoke `comet-verify` skill to enter the verification and completion phase.
