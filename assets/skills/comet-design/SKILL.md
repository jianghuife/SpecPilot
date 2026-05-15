---
name: comet-design
description: "Comet Phase 2: Deep Design. Invoke with /comet-design. Produce Design Doc and delta spec through brainstorming."
---

# Comet Phase 2: Deep Design (Design)

## Prerequisites

- Active change exists (proposal.md, design.md, tasks.md)
- No Design Doc (no corresponding file under `docs/superpowers/specs/`)

## Steps

### 0. Entry State Verification (Entry Check)

Before performing any operations, read and verify the current state:

**Checklist:**
1. `openspec/changes/<name>/.comet.yaml` exists
2. `phase` field value is `"design"`
3. `workflow` field value is `"full"`
4. `design_doc` field is `null` or empty
5. `openspec/changes/<name>/proposal.md` exists and is non-empty
6. `openspec/changes/<name>/design.md` exists and is non-empty
7. `openspec/changes/<name>/tasks.md` exists and is non-empty

**Verification method:**
- `cat openspec/changes/<name>/.comet.yaml` to read all fields
- Check checklist items one by one

**Failure output:**
```
[HARD STOP] Entry check failed for comet-design
  Expected: phase=design, design_doc=<empty/null>, workflow=full
  Actual:   phase=<actual-value>, design_doc=<actual-value>, workflow=<actual-value>
  Suggestion: Run comet-open first, or check if .comet.yaml was modified out of sequence.
```

Proceed to Step 1 only after verification passes.

### 1a. Read Existing Context

Read `proposal.md` and `design.md` under the active change, organize core content into summaries:
- **Proposal summary**: goals, motivation, scope
- **Design summary**: architectural decisions, high-level design

### 1b. Execute Brainstorming (With Context)

**Immediately execute:** Use the Skill tool to load the `superpowers:brainstorming` skill, ARGUMENTS contains:

```
Change: <change-name>
Proposal summary: <proposal core content>
Design summary: <design.md architectural decisions>
Skip context exploration, proceed directly to design questioning.
```

Skipping this step is prohibited, and continuing without loading this skill is prohibited.

If `superpowers:brainstorming` is unavailable, stop the process and prompt to install or enable Superpowers skills. Do not substitute this step with normal conversation.

After the skill loads, follow its guidance to produce:
- `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` — design document (technical RFC)
- `openspec/changes/<name>/specs/<capability>/spec.md` — capability specification (delta)

### 2. Update Comet State

Merge and update the following fields in `openspec/changes/<name>/.comet.yaml` (keep other fields unchanged):

```yaml
phase: build
design_doc: docs/superpowers/specs/YYYY-MM-DD-topic-design.md
```

【Write verification】After update completion, must verify:
  cat openspec/changes/<name>/.comet.yaml
  Confirm phase line value is "build"
  Confirm design_doc line value is "docs/superpowers/specs/YYYY-MM-DD-topic-design.md"
  If any field does not match, retry write then verify again. Maximum 2 retries, report error and terminate if still fails.

### 3. Dual Spec Division of Labor

| Spec Type | Belongs To | Location | Definition |
|-----------|-----------|----------|------------|
| Capability specification | OpenSpec | `openspec/changes/<name>/specs/` | What the system should do (requirements + acceptance scenarios) |
| Design document | Superpowers | `docs/superpowers/specs/` | How to build (technical architecture + implementation details) |

### 4. Document Hierarchy Confirmation

```
proposal.md (Phase 1)              → Why + What
design.md (Phase 1, OpenSpec)      → High-level architectural decisions
Design document (Phase 2, Superpowers) → Deep technical design
Capability specification (Phase 2, delta)  → Requirements + acceptance scenarios
```

## Exit Conditions

- Design Doc has been created and saved
- Delta spec has been created if there are new capabilities
- **Phase guard**: Run `bash $COMET_GUARD <change-name> design`, allow transition only after all PASS

## Automatic Transition

After exit conditions are met, **proceed immediately to the next phase without waiting for user input**:

> **REQUIRED NEXT SKILL:** Invoke `comet-build` skill to enter the planning and build phase.
