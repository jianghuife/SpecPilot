# Frontend Contracts

AI agents edit more reliably when boundaries have explicit contracts.

## Contract Tools

- TypeScript types as contracts for component props, hooks, services, events, commands, and state.
- Zod / JSON Schema / OpenAPI / GraphQL when frontend code consumes structured external data.
- DTOs define frontend inputs and outputs at API-client and feature boundaries.
- Public component APIs document props, callbacks, return values, loading states, empty states, and error conditions.

## Rules

- Convert unknown external data at adapter boundaries, then pass typed domain data inward.
- Keep API transport shapes separate from UI view models when they change for different reasons.
- Document error shapes explicitly. Avoid forcing callers to infer behavior from thrown exceptions.
- If a module is imported by many features, treat it as a public API and give it stable types and examples.

## Public API Checklist

- Are parameters typed and named for the caller's intent?
- Are return values typed, including empty and error cases?
- Are callback semantics clear?
- Is ownership of loading, empty, and error presentation explicit?
- Is the API stable enough for other features to import?
- Does the API hide transport, storage, analytics, and router details where possible?
