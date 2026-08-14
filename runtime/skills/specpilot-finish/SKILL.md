---
name: specpilot-finish
description: Verify finish gates, close a change, and promote reviewed project knowledge.
---

# Finish a SpecPilot change

Record the final verification command:

`specpilot verify run --change <change> --task <task> --phase final -- <command>`

Preview gates with `specpilot internal finish --change <change> --json`. Do not bypass a blocked
result. Finish requires an approved spec (`spec_approved_at`), all tasks done or validly waived,
valid dependencies, no missing, untrusted, or over-budget curated work/review context, a
non-blocking two-axis review whose
`worktree_fingerprint` still matches the worktree and whose `spec_fingerprint` still matches the
change's spec documents, and final evidence matching the current HEAD/worktree fingerprint. Every
non-waived TDD task additionally needs red evidence recorded before green evidence, both using the
same command, with green matching the current worktree. Green evidence must match the task's
current work-context fingerprint; the review must match the current aggregate review-context
fingerprint; final evidence must match the aggregate work and review context for every non-waived
task.

Run `specpilot knowledge audit --json` before proposing durable lessons. Do not use an invalid,
stale, or conflicting knowledge file as the basis for a candidate.

When ready, run `specpilot internal finish --change <change> --apply --json`. This writes
`summary.md` and changes only `status: closed` plus `closed_at` in `change.yaml`; the directory
never moves. If the closed change is active locally, its session pointer is cleared automatically.

Draft durable lessons under `.specpilot/local/knowledge-candidates/`, run
`specpilot knowledge validate <candidate-path> --json`, and preview the complete validated
candidate to the user. Validation does not replace explicit human review. Do not turn requirement
history, observability descriptions, or release/rollback/migration plans into knowledge
candidates; keep them in `specs/changes/` or the project's ordinary documentation. After an
explicit decision, record a content-bound receipt with:

```bash
specpilot internal memory-review .specpilot/local/knowledge-candidates/example.md \
  --decision approved --reviewer human:alice \
  --reason "Confirmed against source and evidence." --json
```

Use `--decision rejected` when the user rejects the candidate. Promotion rejects a missing,
rejected, or stale receipt. Promote an approved candidate with
`specpilot internal memory-promote <candidate-path> --json`. New promoted files use an OKF v0.2
concept plus a strict SpecPilot profile:

```yaml
---
type: Architecture Boundary
title: Billing write boundary
description: Billing writes cross the invoice boundary.
sources:
  - id: billing-source
    resource: src/billing.ts
    author: team:billing
generated: { by: specpilot/0.8, at: 2026-08-05T09:00:00.000Z }
verified: { by: human:reviewer, at: 2026-08-05T10:00:00.000Z }
status: stable
stale_after: 2026-11-05
specpilot:
  domain: billing
  criticality: p0
  authority: normative
  load_policy: required_when_matched
  evidence_refs: [.specpilot/evidence/change/task/final.json]
  invalidation:
    description: The billing write path changes.
    watch_paths: [src/billing.ts]
---
```

Never promote raw conversation, unconfirmed graph output, or a claim without an invalidation
condition.
