---
name: domain-modeling
description: Build and sharpen a repository-backed domain model. Use when canonical project terminology needs to be defined or corrected, vague or conflicting domain language needs stress-testing, domain rules or boundaries need checking against scenarios and source, or a durable trade-off decision should be recorded. Do not trigger merely to read existing vocabulary.
---

# Domain Modeling

Actively sharpen the project's domain model while product behavior or architecture is being
decided. Reading established vocabulary is an ordinary repository habit; use this Skill when the
model itself may change.

## Repository contract

- Treat `specs/project/glossary.md` as the canonical domain-language artifact. Read it before
  proposing terminology.
- Record durable trade-off decisions under `specs/project/decisions/`.
- Never create parallel `CONTEXT.md`, `CONTEXT-MAP.md`, or `docs/adr/` artifacts.
- Keep implementation details, temporary hypotheses, and task requirements out of the glossary.
- Do not promote anything into `specs/knowledge/`; verified knowledge follows SpecPilot's separate
  review and promotion workflow.

Read [references/GLOSSARY-FORMAT.md](references/GLOSSARY-FORMAT.md) before changing the glossary.
Read [references/DECISION-FORMAT.md](references/DECISION-FORMAT.md) before proposing a decision
record.

## Modeling loop

1. **Establish the question.** Identify the term, rule, relationship, or decision that is actually
   unresolved. Do not turn routine implementation discussion into a modeling exercise.
2. **Recover the current model.** Read the relevant glossary entries, specifications, decisions,
   source, and tests. Product artifacts establish intended behavior; source and tests establish
   current behavior. Surface contradictions instead of silently choosing one.
3. **Sharpen the language.** Challenge vague or overloaded words and propose one canonical term.
   Distinguish concepts that have different identities, lifecycles, permissions, or invariants.
4. **Stress-test with scenarios.** Use concrete normal, boundary, failure, and lifecycle examples.
   Ask one high-value question at a time when evidence cannot distinguish the answer.
5. **Draft the repository change.** Keep glossary definitions short and domain-only. Offer a
   decision record only when the choice is hard to reverse, surprising without context, and the
   result of a real trade-off.
6. **Confirm before writing.** Show the complete proposed diff, its supporting evidence, and any
   remaining uncertainty. Implicit invocation permits analysis and proposals, not silent writes.
   Write only after the user approves the repository change.
7. **Connect active work.** If an approved glossary or decision artifact materially constrains the
   active task, add it to that task's repository-backed work or review context with
   `specpilot context add`. Do not add unrelated context.

Preserve existing compatible content, call out incompatible definitions, and never invent
historical rationale.
