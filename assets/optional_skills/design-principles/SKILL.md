---
name: design-principles
description: Apply pragmatic application-design principles and review architectural fit using an explicit decision order, evidence-based abstraction gates, restrained DRY, change-locality rules, dependency boundaries, and refactor exit criteria. Use when deciding whether to add an abstraction, extract or share code, place a new responsibility, simplify an over-engineered design, or review a change for maintainability and architectural fit.
---

# Design Principles

Optimize for localized, predictable change rather than the maximum number of layers. Treat the
repository's documented architecture, decisions, conventions, and verification requirements as
authoritative wherever they conflict with this Skill.

## Decide in this order

Use this priority order to resolve conflicts between principles:

`Correctness > Understandability > Change locality > Testability > Reuse > Theoretical purity`

State which higher-priority outcome justifies a trade-off. Do not invoke a named principle without
connecting it to repository evidence and the requested change.

## Admit abstractions only at proven seams

Add an interface, adapter, factory, shared service, or other indirection only when at least one of
these conditions holds:

1. Two real implementations exist now.
2. An external system, platform API, storage provider, or vendor dependency needs a stable boundary
   or controllable test substitute.
3. The same stable business or infrastructure policy is already scattered across callers.
4. An approved requirement identifies the replacement or extension axis.

If none holds, keep the concrete implementation. Do not preserve speculative abstractions for
hypothetical future consumers.

Prefer deep modules: a small, stable interface that hides meaningful complexity. Reject
pass-through facades that merely rename or forward calls. Use the deletion test: if deleting a
module makes its complexity reappear across callers, it earns its place; if the complexity simply
vanishes, the module was probably shallow.

## Keep the change local

- Interpret KISS as the smallest coherent diff, not the shortest file.
- Make every changed line traceable to the requested behavior or a necessary supporting repair.
- Avoid drive-by refactors.
- Place new behavior with the narrowest owner that can enforce its invariants.
- Keep feature-internal reuse inside the feature. Move code across features or packages only after
  establishing a stable shared contract.
- Separate rendering, orchestration, domain rules, persistence, and external adapters only when
  they have different reasons to change. Do not manufacture every possible layer.

Treat line counts, nesting, and file length as investigation signals rather than automatic
extraction rules. If the repository defines a hard limit, obey it; otherwise extract only at a
real responsibility, policy, test, or dependency boundary.

## Deduplicate knowledge, not appearance

Before sharing code, ask: **Would every caller need the same change for the same reason?**

- If yes, centralize the shared knowledge or policy.
- If no, preserve independent copies even when they currently look similar.

Strong centralization candidates include authorization, cache identity and invalidation, pricing
or entitlement rules, parsing, error classification, feature-flag access, and environment access.
Weak candidates include similar markup, product copy, one-off components, and feature-local view
models that can evolve independently.

Use three occurrences only as a heuristic, not a law. Two occurrences may justify extraction when
they encode one policy; many visual similarities may still be independent decisions.

## Enforce dependency direction

- Follow the repository's declared dependency direction and public entry points.
- Do not deep-import another module's private implementation.
- Pass the narrowest capability a consumer needs rather than a container, store, or service locator.
- Keep lower-level modules from importing their callers.
- Invert dependencies at real external or volatile seams, not around every concrete module.
- Keep pure domain logic free of navigation, notifications, network calls, and global-state mutation.

Reading nested fields from a plain data object is not a dependency violation. Reaching through a
collaborator to discover and control its internals is.

## Keep state with its narrowest owner

Escalate state deliberately:

`local state -> local reducer/state machine -> shared client state`

Keep server-owned data in the repository's server-cache or data-access layer. Do not copy it into
client state without a documented synchronization requirement.

Give cross-cutting knowledge one authoritative home. Do not create a global home for information
that only one feature owns.

## Require evidence for refactors

Accept a refactor when evidence shows at least one of these problems:

- duplicated business or infrastructure policy;
- one change requires edits across unrelated modules;
- private or direction-breaking imports;
- an interface is broader than its consumers;
- repeated caching, error, authorization, or invalidation policy;
- an unused or pass-through abstraction can be removed.

Do not treat a long file, two similar markup blocks, an available pattern name, or a possible future
implementation as sufficient evidence.

Finish a refactor only when:

- behavior is preserved unless the approved change says otherwise;
- the intended future change becomes more local;
- the public interface does not grow unnecessarily;
- tests exercise the public boundary or policy;
- obsolete duplicates and abstractions are removed;
- no new pass-through layer or private deep import appears; and
- the repository's required verification passes.

Encode mechanically enforceable boundaries as tests or static checks. Documentation describes the
rule; automation prevents drift.

## Review quick pass

Before approving a design or change, verify:

- [ ] Every new abstraction satisfies a proven-seam condition.
- [ ] Shared code passes the same-change-for-the-same-reason test.
- [ ] The diff is the smallest coherent change without unrelated refactoring.
- [ ] Responsibilities and state live with their narrowest appropriate owner.
- [ ] Imports respect dependency direction and public entry points.
- [ ] No pass-through facade, service locator, or one-implementation seam was added.
- [ ] Pure domain logic remains free of delivery and infrastructure effects.
- [ ] New mechanically checkable boundaries have enforcement.
- [ ] The refactor or design satisfies explicit exit criteria and project verification.
