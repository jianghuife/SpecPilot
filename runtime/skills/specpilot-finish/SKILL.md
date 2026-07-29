---
name: specpilot-finish
description: Verify finish gates, close a change, and promote reviewed project knowledge.
---

# Finish a SpecPilot change

Record the final verification command:

`specpilot verify run --change <change> --task <task> --phase final -- <command>`

Preview gates with `specpilot internal finish --change <change> --json`. Do not bypass a blocked
result. Finish requires an approved spec (`spec_approved_at`), all tasks done or validly waived,
valid dependencies, no missing curated work/review context, a non-blocking two-axis review whose
`worktree_fingerprint` still matches the worktree and whose `spec_fingerprint` still matches the
change's spec documents, and final evidence matching the current HEAD/worktree fingerprint. Every non-waived TDD task additionally needs red evidence recorded
before green evidence, both using the same command, with green matching the current worktree.

When ready, run `specpilot internal finish --change <change> --apply --json`. This writes
`summary.md` and changes only `status: closed` plus `closed_at` in `change.yaml`; the directory
never moves. If the closed change is active locally, its session pointer is cleared automatically.

Draft durable lessons under `.specpilot/local/knowledge-candidates/` and preview them to the user.
Promote only after review with
`specpilot internal memory-promote <candidate-path> --json`. A promoted
`specs/knowledge/*.md` file must have:

```yaml
---
domain: billing
summary: One durable, reusable claim.
source_refs: [src/billing.ts]
evidence_refs: [.specpilot/evidence/change/task/final.json]
invalidation_condition: The billing write path changes.
verified_at: 2026-01-01T00:00:00.000Z
---
```

Never promote raw conversation, unconfirmed graph output, or a claim without an invalidation
condition.
