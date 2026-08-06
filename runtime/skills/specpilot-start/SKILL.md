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

Scaffold the approved change instead of hand-writing YAML:

1. `specpilot change new <change-id> --title "<Title>" --kind light|standard` creates
   `change.yaml` plus `spec.md` (and `design.md`/`plan.md` for standard changes).
2. Fill in `spec.md` with goal, scope/non-goals, behavior, acceptance criteria, and verification.
   Standard changes also require completed `design.md` and `plan.md`.
3. `specpilot task add <change-id> <task-id> --title "<Title>" [--execution tdd]
[--blocked-by <ids...>]` creates each task with validated frontmatter. Use `--execution tdd`
   only when the user explicitly enables it. Dependencies must be acyclic.
4. Preview deterministic context candidates with `specpilot context suggest <change> <task>
--purpose work --json` and repeat for `--purpose review`. Inspect every reason and budget
   omission; use `--apply` only for the candidates that belong in the approved task. Curate any
   remaining references with `specpilot context add`. Add only relevant
   files from `specs/project/`, `specs/knowledge/`, or the current change, with a concise reason.
   Use `--purpose work` for implementation inputs and `--purpose review` for review inputs. Never
   pre-register source files that the task may edit.
5. After the user approves the spec, run `specpilot change approve <change-id>`. Finish is
   blocked until `spec_approved_at` is recorded. Editing `spec.md`, `design.md`, or `plan.md`
   after a review makes that review stale, so repeat approval and review when the spec changes.
6. Run `specpilot session activate <change-id>` so a later session can recover the approved
   change before task work begins.

Never hand-edit `.specpilot/local/session.json`; `MemoryCatalog` owns that local pointer through
the CLI. Never copy raw conversation into durable knowledge.
