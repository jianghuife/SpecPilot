---
name: fe-architecture-best-practices
description: Use when designing, reviewing, documenting, or refactoring frontend architecture, frontend module boundaries, UI feature slices, frontend state flows, frontend API contracts, component boundaries, ADRs, or code organization for AI-editable frontend codebases.
---

# Frontend Architecture

Use this skill for frontend architecture only. Keep recommendations scoped to browser/client UI code, frontend application structure, frontend-facing contracts, and documentation that helps future maintainers and AI agents make safer changes.

Default documentation location: `docs/`. If the project already has `docs/architecture/`, `docs/adrs/`, or another documented convention, follow it. Otherwise write ADRs under `docs/adr/NNNN-short-title.md`.

## Core Rules

- Document the why, not just the what.
- Keep server implementation concerns out of scope.
- Prefer architecture that lets an agent modify one component, hook, service, reducer, or feature slice without understanding the whole app.
- Use explicit boundaries, typed contracts, small composable units, and explicit state models.

## What To Load

- ADRs and decision records: read `references/adr.md`.
- Frontend boundaries, dependency direction, and Clean Architecture adaptation: read `references/boundaries.md`.
- TypeScript contracts, DTOs, schemas, and public APIs: read `references/contracts.md`.
- Small-unit composition, state machines, reducers, and Command + Result: read `references/composition-and-state.md`.

## Review Checklist

- Is this frontend architecture only?
- Are important choices documented in `docs/`, with ADRs in `docs/adr/NNNN-short-title.md` unless the project already has a convention?
- Does the ADR explain why, rejected alternatives, and consequences?
- Are frontend boundaries explicit enough that a small change has a small edit surface?
- Are external dependencies isolated behind adapters?
- Are public frontend APIs typed and documented?
- Are DTOs, schemas, or generated types used where frontend code consumes structured external data?
- Can large components, hooks, services, reducers, or stores be split into smaller composable units?
- Is state represented explicitly, with invalid states and transitions handled deliberately?
