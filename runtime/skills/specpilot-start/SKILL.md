---
name: specpilot-start
description: Clarify a change and create its repository-backed specification and tasks.
---

# Start a SpecPilot change

Run `specpilot status --json` and read `specs/project/`. Search relevant memory with
`specpilot internal memory-search "<goal>" --json`. If graph support is useful, run
`specpilot graph explore "<goal>"`; graph results only select candidate source to inspect.
Confirm every conclusion in source, tests, or logs.

Ask one high-value question at a time until the goal, non-goals, acceptance criteria, constraints,
and test seam are clear. Do not turn the interview into a questionnaire.

Classify the proposal semantically:

- `light`: localized, low-risk behavior with no meaningful design choice.
- `standard`: cross-module behavior, migration, architectural choice, or multiple dependent tasks.

Preview the classification, artifact paths, spec outline, and tasks. Get explicit approval before
writing. Multiple changes may remain open; never add a workflow phase.

Write `specs/changes/<change-id>/change.yaml`:

```yaml
schema_version: 1
id: lowercase-hyphen-id
title: Human title
kind: light # or standard
status: open
created_at: 2026-01-01T00:00:00.000Z
spec_approved_at: 2026-01-01T00:00:00.000Z
```

Write `spec.md` with goal, scope/non-goals, behavior, acceptance criteria, and verification.
Standard changes also require `design.md` and `plan.md`. Create at least one task in `tasks/*.md`:

```yaml
---
schema_version: 1
id: task-id
title: Human title
status: todo
blocked_by: []
execution: standard # use tdd only when the user explicitly enables it
---
```

Dependencies must be acyclic. Update `.specpilot/local/session.json` with only the active
change/task pointer and ephemeral notes; never copy raw conversation into durable knowledge.
