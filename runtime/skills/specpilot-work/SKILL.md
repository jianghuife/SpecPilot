---
name: specpilot-work
description: Implement one SpecPilot task against its approved specification.
---

# Work on a SpecPilot task

Run `specpilot status --json`. Select one unblocked task, then run
`specpilot context list <change> <task> --purpose work --json` and read every existing reference.
The list contains the approved change documents plus curated project standards, verified
knowledge, or research. Do not treat it as a source-file allowlist; inspect source candidates
separately. The listing must have no missing or untrusted references and must be within its byte
budget. If context is incomplete, preview `specpilot context suggest <change> <task> --purpose
work --json`; inspect the reasons before applying selected references. Respect `blocked_by`; run
`specpilot task start <change> <task>` before implementing. This validates the approved spec,
dependencies, trust state, and context budget, sets the task to `doing`, and activates the local
session pointer.

Use `specpilot graph impact <symbol>` or `affected <files...>` to narrow reading when helpful, but
confirm call chains, impact, and candidate tests in source, tests, or logs.

For `execution: tdd`, implement one vertical slice at a time:

1. Add one focused failing test and record the expected failure:
   `specpilot verify run --change <change> --task <task> --phase red --reason "<expected failure>" -- <command>`.
2. Make the smallest implementation change.
3. Record green evidence with the same focused command.
4. Refactor while green, then repeat for the next slice.

For `execution: standard`, use the smallest observable feedback loop and record it as current green
evidence:
`specpilot verify run --change <change> --task <task> --phase green -- <command>`.

When the task is verified, run `specpilot task complete <change> <task>`. Completion is rejected
without green evidence matching both the current worktree and exact curated work-context snapshot.
If a referenced spec, standard, knowledge concept, research file, manifest entry, or reference
reason changes, read the new context and record green evidence again. If work cannot continue, use
`specpilot task block <change> <task> --reason "<reason>"`; use
`specpilot task waive <change> <task> --reason "<reason>"` only after the user accepts the waiver.

Never hand-edit task status or `.specpilot/local/session.json`. Never write all tests before
implementation, and do not complete a task based on graph output or an unrecorded claim.
