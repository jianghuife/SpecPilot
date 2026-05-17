---
name: comet-open
description: "Comet Phase 1: Open. Invoke with /comet-open. Explore ideas through OpenSpec and create change structure (proposal + design + tasks)."
---

# Comet Phase 1: Open

## Prerequisites

- No active change, or user wishes to create a new change

## Steps

### 0. Entry State Verification (Entry Check)

Execute entry verification:

```bash
COMET_STATE="${COMET_STATE:-$(find . -path '*/comet/scripts/comet-state.sh' -type f -print -quit)}"
bash "$COMET_STATE" check <name> open
```

Proceed to Step 1 after verification passes. The script outputs specific failure reasons when verification fails.

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

Initialize Comet state file:

```bash
bash "$COMET_STATE" init <name> full
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
