---
name: specpilot-work
description: Implement one SpecPilot task against its approved specification.
---

# Work on a SpecPilot task

Run `specpilot status --json`. Select one unblocked task, then load only its change spec, relevant
project standards, directly applicable verified knowledge, and source candidates. Respect
`blocked_by`; set the task to `doing` while implementing and `done` only with current evidence.
Keep `.specpilot/local/session.json` pointed at this one active change/task.

Use `specpilot graph impact <symbol>` or `affected <files...>` to narrow reading when helpful, but
confirm call chains, impact, and candidate tests in source, tests, or logs.

For `execution: tdd`, implement one vertical slice at a time:

1. Add one focused failing test and record the expected failure:
   `specpilot verify run --change <change> --task <task> --phase red --reason "<expected failure>" -- <command>`.
2. Make the smallest implementation change.
3. Record green evidence with the same focused command.
4. Refactor while green, then repeat for the next slice.

Never write all tests before implementation. For `execution: standard`, use the smallest
observable feedback loop. Do not mark a task done based on graph output or an unrecorded claim.
