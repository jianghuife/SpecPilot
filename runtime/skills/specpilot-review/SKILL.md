---
name: specpilot-review
description: Review a change against project standards and its originating specification.
---

# Review a SpecPilot change

For every non-waived task, run
`specpilot context list <change> <task> --purpose review --json` and read every existing
reference. Then read task evidence and the current diff. Review on two independent axes:

The context listing must contain no missing or untrusted references and must remain within its
configured byte budget. If review context is incomplete, preview `specpilot context suggest
<change> <task> --purpose review --json` and inspect every proposed reason before applying it.

1. Standards: does the change follow the documented project standards and the smell baseline
   below?
2. Spec: does it implement the approved behavior without missing requirements or scope creep?

## Standards baseline

The Standards axis reads `specs/project/standards/` and any other documented conventions. On top
of those it always carries this fixed smell baseline (Fowler, _Refactoring_ ch. 3), so the axis
has substance even while the project's standards are still empty. Two rules bind it: a documented
project standard overrides the baseline wherever they conflict, and every smell is a judgement
call ("possible Feature Envy"), never a hard violation. Skip anything tooling already enforces. A
finding backed only by the baseline warrants at most `pass_with_warnings`; `blocked` requires a
documented-standard breach or a Spec violation.

- **Mysterious Name** — a name that doesn't reveal what it does or holds → rename; if no honest
  name comes, the design is murky.
- **Duplicated Code** — the same logic shape in more than one hunk or file → extract the shared
  shape, call it from both.
- **Feature Envy** — a method reaching into another object's data more than its own → move it
  onto the data it envies.
- **Data Clumps** — the same few fields or params travelling together → bundle them into one
  type, pass that.
- **Primitive Obsession** — a primitive standing in for a domain concept → give the concept its
  own small type.
- **Repeated Switches** — the same switch/if-cascade on the same type recurring → polymorphism,
  or one map both sites share.
- **Shotgun Surgery** — one logical change forcing scattered edits across many files → gather
  what changes together into one module.
- **Divergent Change** — one module edited for several unrelated reasons → split it so each part
  changes for one reason.
- **Speculative Generality** — abstraction for needs the spec doesn't have → delete it; inline
  back until a real need shows.
- **Message Chains** — long `a.b().c().d()` navigation → hide the walk behind one method on the
  first object.
- **Middle Man** — a thing that mostly delegates onward → cut it, call the real target directly.
- **Refused Bequest** — an implementer ignoring most of what it inherits → drop the inheritance,
  use composition.

## Process

Use parallel internal reviewers when the host can schedule them; otherwise perform the same two
contracts sequentially. Graph output is advisory. Every blocking finding must cite source, test,
log, or missing acceptance evidence.

Write separate Standards and Spec findings with file references to
`.specpilot/local/review-draft.md`, then record them through the validated interface:

`specpilot review record <change> --standards pass|pass_with_warnings|blocked --spec
pass|pass_with_warnings|blocked --body-file .specpilot/local/review-draft.md`

The workflow harness derives the overall status and captures the current worktree fingerprint,
a fingerprint of the change's spec documents (`spec.md`, `design.md`, `plan.md`), and a fingerprint
of every non-waived task's curated review context. `ProjectStore` writes the frontmatter and body.
Never hand-write `review.md`. Finish blocks a review whose fingerprints no longer match the
worktree, spec documents, or review context, so later code, spec, standard, knowledge, research,
manifest, or context-reason changes require a re-review. A warning does not block finish; any
`blocked` axis does.
