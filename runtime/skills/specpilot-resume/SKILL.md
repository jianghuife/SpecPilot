---
name: specpilot-resume
description: Recover the active SpecPilot change and recommend the next workflow entry.
---

# Resume SpecPilot work

Run `specpilot status --json`. Use the local session pointer when valid; otherwise list open
changes and ask which one to resume. Read the selected change summary before expanding full
artifacts. Recommend exactly one of `specpilot-start`, `specpilot-work`, `specpilot-review`, or
`specpilot-finish`.

This is a read-only recovery entry. Do not mutate project files, repair task state, run update, or
close a change. If the local pointer is stale, report it and base the recommendation on open
changes.
