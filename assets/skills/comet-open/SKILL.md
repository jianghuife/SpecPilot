---
name: comet-open
description: "Comet Phase 1: Open. Invoke with /comet-open. Explore ideas through OpenSpec and create change structure (proposal + design + tasks)."
---

# Comet Phase 1: Open

## Prerequisites

- No active change, or user wishes to create a new change

## Steps

### 0. Entry State Verification (Entry Check)

Before performing any operations, read and verify the current state:

**Checklist:**
1. `openspec/changes/<name>/` directory exists (created by openspec-new-change)
2. `openspec/changes/<name>/.comet.yaml` file does not exist (not yet initialized)
3. `openspec/changes/<name>/proposal.md` exists and is non-empty
4. `openspec/changes/<name>/design.md` exists and is non-empty
5. `openspec/changes/<name>/tasks.md` exists and is non-empty

**Verification method:**
- Read the above paths to confirm existence/non-existence
- If `.comet.yaml` already exists, read its `phase` field: if phase is not empty, output `[HARD STOP]` and prompt that there may already be an active change

**Failure output:**
```
[HARD STOP] Entry check failed for comet-open
  Expected: .comet.yaml does not exist, proposal.md + design.md + tasks.md exist
  Actual:   phase=<actual-value>, design_doc=<actual-value> (or file does not exist)
  Suggestion: Check if another change with the same name is already active.
```

Proceed to Step 1 only after verification passes.

### 1. Explore Idea

**Immediately execute:** Use the Skill tool to load the `openspec-explore` skill. Skipping this step is prohibited.

After the skill loads, freely explore the problem space following its guidance.

### 2. Create Change Structure

**Immediately execute:** Use the Skill tool to load the `openspec-new-change` skill. If user intent is unclear and needs to form a proposal first, load `openspec-propose` instead. Skipping this step is prohibited.

Confirm the following artifacts have been created:

```
openspec/changes/<name>/
├── .openspec.yaml
├── .comet.yaml
├── proposal.md       # Why + What: problem, goals, scope
├── design.md         # How (high-level): architectural decisions, solution selection
└── tasks.md          # Task checklist (checkboxes)
```

### 3. Initialize Comet State

Create an independent `.comet.yaml` file under `openspec/changes/<name>/`:

```yaml
workflow: full
phase: design
design_doc: null
plan: null
build_mode: null
verify_mode: null
verify_result: pending
verified_at: null
archived: false
```

### 4. Content Completeness Check

Confirm the three documents have complete content:
- **proposal.md**: problem background, goals, scope, non-goals
- **design.md**: high-level architectural decisions, solution selection, data flow
- **tasks.md**: task list, each task has a clear description

## Exit Conditions

- proposal.md, design.md, and tasks.md are all created with complete content
- **Phase guard**: Run `bash $COMET_GUARD <change-name> open`, allow transition only after all PASS

## Automatic Transition

After exit conditions are met, **proceed immediately to the next phase without waiting for user input**:

> **REQUIRED NEXT SKILL:** Invoke `comet-design` skill to enter the deep design phase.
