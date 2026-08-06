---
name: specpilot-init-knowledge
description: Initialize reviewed project memory from a local codebase inventory.
---

# Initialize SpecPilot project knowledge

Run `specpilot init knowledge --json` and `specpilot knowledge audit --json`. The first command creates a gitignored inventory at
`.specpilot/local/knowledge-init.json`; it does not promote knowledge.

The inventory audits all governed knowledge types. Resolve P0 gaps first: architecture boundaries,
testing and verification, API/data/event contracts, and state machines/business flows. Then cover
P1 decisions, requirements history, Skills, examples, runbooks, incidents, anti-patterns, glossary,
observability, release/rollback/migration, and AI evaluations. Treat performance, capacity, and
security constraints as P2 unless project risk makes them more urgent. A `template` status means
the destination exists but still contains only scaffolding; it is not evidence of coverage. Remove
that file's `specpilot-template` marker only when reviewed project-specific content replaces the
scaffold.

Use the inventory to choose a small reading set:

1. Read root manifests, README files, and existing `specs/project/` documents.
2. Use `specpilot graph explore "<project architecture>"` when CodeGraph is ready; otherwise use
   source search.
3. Confirm graph candidates in source, tests, configuration, or logs.
4. Distinguish observed conventions from desired standards. Never turn one incidental code
   pattern into a project rule.

Prepare a preview grouped by the inventory's knowledge types and destination:

- `specs/project/glossary.md`: domain terms that appear in product language and code.
- `specs/project/standards/*.md`: confirmed engineering conventions and their scope.
- `specs/project/decisions/*.md`: decisions with context and trade-offs; do not invent historical
  rationale.
- `.specpilot/local/knowledge-candidates/*.md`: durable reusable claims that may later be promoted.

For each proposed item, cite the source or configuration that supports it and state uncertainty.
Ask one high-value question at a time when evidence cannot distinguish alternatives. Show the
complete proposed diff and get approval before writing.

Do not overwrite existing project memory. Merge compatible content and surface conflicts.
Run `specpilot knowledge audit --json` again after edits. Invalid, stale, or conflicting trusted
knowledge is a hard failure; incomplete category coverage remains visible by priority.

Write new knowledge candidates as OKF v0.2 concepts. `type`, `title`, `description`, `sources`,
`generated`, `verified`, `status`, and `stale_after` use the portable OKF fields. Put SpecPilot's
engineering policy under `specpilot`: `domain`, `criticality`, `authority`, `load_policy`, valid
evidence references, and invalidation watch paths. Every local `sources[].resource` must exist;
every evidence reference must name a valid, current SpecPilot evidence JSON record whose log also
exists. Trusted promotion requires `status: stable` and a `human:` verification event that does not
predate `generated.at`.

After showing the complete candidate and receiving an explicit decision, bind that exact content
to a local review receipt:

```bash
specpilot internal memory-review .specpilot/local/knowledge-candidates/example.md \
  --decision approved --reviewer human:alice \
  --reason "Confirmed against source and evidence." --json
```

Use `--decision rejected` when the user rejects the candidate.

Promotion requires an approved receipt whose SHA-256 still matches the candidate. Any later edit
requires another review. After approval, run `specpilot internal memory-promote <candidate-path>`.
Promotion also writes a tracked attestation that binds the reviewed content to its current local
sources and invalidation watch paths; relevant changes make the concept stale. The receipt reviewer
must match an OKF `verified` human actor. Legacy candidates remain readable,
but new candidates should use the OKF profile so other OKF consumers can use the same Markdown
without understanding SpecPilot's extension block.
