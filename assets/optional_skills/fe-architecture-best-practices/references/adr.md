# Frontend ADRs

Use ADRs for important frontend architecture decisions that are expensive to reverse or likely to be revisited. ADRs are for the why behind a choice, not a duplicate of the code.

## When To Write

| Write ADR | Skip ADR |
| --- | --- |
| State management choice | Bug fixes |
| Routing and layout structure | Minor version upgrades |
| Data fetching and cache strategy | Small styling changes |
| Component architecture or design system boundary | Routine refactors within one component |
| Form strategy and validation ownership | Local implementation details |
| API client contract strategy | One-off config tweaks |
| Build tooling, package boundaries, or monorepo structure | Mechanical formatting changes |

## Lifecycle

Proposed -> Accepted -> Deprecated -> Superseded

Rejected is a terminal status for an option that was considered but not adopted.

## Standard ADR Template

```markdown
# ADR-0001: Adopt TanStack Query for Server State

## Status

Accepted

## Context

The frontend has multiple screens that fetch the same account and project data. Current components duplicate loading, retry, cache, and error handling. We need a shared server-state approach that works with React and preserves clear feature boundaries.

## Decision Drivers

- Must avoid duplicating server state in local component state.
- Must support cache invalidation after mutations.
- Must expose loading, empty, and error states clearly to UI components.
- Should keep API transport details behind adapters.
- Should be easy for feature teams and AI agents to use consistently.

## Considered Options

### Option 1: TanStack Query

- Pros: mature cache, request deduping, invalidation, optimistic updates, React hooks, strong ecosystem.
- Cons: introduces cache configuration concepts and query-key discipline.

### Option 2: Redux async thunks

- Pros: fits apps already using Redux, explicit actions, centralized debugging.
- Cons: more boilerplate for server state, manual cache and invalidation work.

### Option 3: Component-level fetching

- Pros: minimal setup for simple screens.
- Cons: duplicates loading/error/cache behavior and creates inconsistent UX.

## Decision

Use TanStack Query for frontend server state. Keep fetch clients and response normalization behind adapters.

## Rationale

TanStack Query gives the frontend a consistent cache and mutation model while keeping domain and UI layers small. Query hooks can be colocated with features, and adapters can preserve a typed boundary around remote data.

## Consequences

### Positive

- Shared loading, error, retry, and cache behavior.
- Less component-level effect code.
- Clear query-key and invalidation conventions.

### Negative

- Team must learn query freshness and invalidation rules.
- Poor query-key design can cause stale or duplicated cache entries.

### Risks

- Cache behavior may hide data flow bugs.
- Mitigation: document query-key factories and test critical invalidation flows.

## Implementation Notes

- Put query keys near the feature or API adapter that owns the data.
- Keep DTO conversion at adapter boundaries.
- Use explicit empty and error view states in feature UI.

## Related Decisions

- ADR-0002: Frontend API Client Boundary
- ADR-0003: Feature Slice Structure

## References

- Internal: `docs/architecture/frontend-data-flow.md`
- Internal: `docs/adr/0002-frontend-api-client-boundary.md`
```

Rejected alternatives are valuable. Keep them visible so future readers understand which plausible paths were considered and why they were not chosen.

## Lightweight ADR Template

```markdown
# ADR-0012: Adopt Reducers for Multi-Step Form State

**Status**: Accepted
**Date**: 2026-06-17
**Deciders**: Frontend team

## Context

The checkout form has several async steps and impossible boolean combinations.

## Decision

Represent the form as an explicit reducer-driven state machine.

## Consequences

**Good**: Illegal transitions are easier to prevent, tests can cover state transitions, UI components become simpler.

**Bad**: Slightly more structure than local `useState`.

**Mitigations**: Keep events and states close to the feature; avoid generic state-machine abstractions until needed.
```

## Y-Statement Template

```markdown
# ADR-0015: Feature Slice Boundaries

In the context of **a growing frontend with cross-feature imports**,
facing **unclear ownership and fragile AI edits**,
we decided for **feature slices with public feature APIs**
and against **deep imports into feature internals**,
to achieve **clear ownership, smaller edit surfaces, and safer refactors**,
accepting that **some shared code must move into explicit shared modules**.
```

## Deprecation ADR Template

```markdown
# ADR-0020: Deprecate Legacy Global Store Shape

## Status

Accepted (Supersedes ADR-0004)

## Context

ADR-0004 chose a single global store for all frontend state. Since then, server state, URL state, and form state have been mixed together, making changes risky.

## Decision

Move server state to the data-fetching layer, keep form state local or reducer-driven, and reserve the global store for cross-cutting client state.

## Migration Plan

1. Identify server-state selectors and consumers.
2. Introduce feature query hooks behind public feature APIs.
3. Move one feature at a time.
4. Remove obsolete global store fields after consumers migrate.

## Consequences

### Positive

- Smaller global store.
- Clearer ownership for server-state invalidation.
- Less accidental coupling between features.

### Negative

- Temporary compatibility layer during migration.
- Requires careful feature-by-feature rollout.

## Lessons Learned

State ownership should be documented early. "Global by default" made future changes harder than expected.
```

## ADR Index

Keep an ADR index at `docs/adr/README.md` unless the project already has a convention.

```markdown
# Architecture Decision Records

This directory contains frontend Architecture Decision Records.

## ADR index

| ADR | Title | Status | Date |
| --- | --- | --- | --- |
| [0001](0001-adopt-tanstack-query.md) | Adopt TanStack Query for Server State | Accepted | 2026-06-17 |
| [0012](0012-reducers-for-multi-step-form-state.md) | Adopt Reducers for Multi-Step Form State | Accepted | 2026-06-17 |

## Creating a New ADR

1. Create `NNNN-title-with-dashes.md` from the Standard ADR Template in this skill (use the Lightweight or Y-Statement template for smaller decisions).
2. Fill in context, drivers, options, decision, rationale, and consequences.
3. Submit the ADR with the code change or design proposal.
4. Update this index after acceptance.

## Status Values

- Proposed
- Accepted
- Deprecated
- Superseded
- Rejected
```

## Review Checklist

- Context clearly explains the frontend problem.
- Decision Drivers are explicit.
- Considered Options are plausible and honestly compared.
- Decision is specific enough to guide implementation.
- Rationale explains why this option won.
- Consequences include positive and negative outcomes.
- Related Decisions are linked when relevant.
- Do not change accepted ADRs. Write a new ADR that supersedes or deprecates the old one.
