---
name: specpilot-init-knowledge
description: Initialize reviewed project memory from a local codebase inventory.
---

# Initialize SpecPilot project knowledge

Run `specpilot init knowledge --json`. This creates a gitignored inventory at
`.specpilot/local/knowledge-init.json`; it does not promote knowledge.

Use the inventory to choose a small reading set:

1. Read root manifests, README files, and existing `specs/project/` documents.
2. Use `specpilot graph explore "<project architecture>"` when CodeGraph is ready; otherwise use
   source search.
3. Confirm graph candidates in source, tests, configuration, or logs.
4. Distinguish observed conventions from desired standards. Never turn one incidental code
   pattern into a project rule.

Prepare a preview grouped by destination:

- `specs/project/glossary.md`: domain terms that appear in product language and code.
- `specs/project/standards/*.md`: confirmed engineering conventions and their scope.
- `specs/project/decisions/*.md`: decisions with context and trade-offs; do not invent historical
  rationale.
- `.specpilot/local/knowledge-candidates/*.md`: durable reusable claims that may later be promoted.

For each proposed item, cite the source or configuration that supports it and state uncertainty.
Ask one high-value question at a time when evidence cannot distinguish alternatives. Show the
complete proposed diff and get approval before writing.

Do not overwrite existing project memory. Merge compatible content and surface conflicts.
Knowledge candidates still require `domain`, `summary`, `source_refs`, `evidence_refs`,
`invalidation_condition`, and `verified_at`, followed by explicit review and
`specpilot internal memory-promote <candidate-path>`.
