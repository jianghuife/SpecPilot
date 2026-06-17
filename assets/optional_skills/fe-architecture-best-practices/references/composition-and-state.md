# Composition And State

Small units compose better than large files. Favor code that can be reasoned about in one screen and tested independently.

## React State Ownership

Start by classifying the state. Do not choose a store before identifying ownership.

| State kind | Default owner |
| --- | --- |
| Component-only UI state | `useState` near the component |
| Complex local workflow | `useReducer` or a small state machine |
| URL-shareable filters, tabs, pagination, or search | Router search params |
| Form draft state | Form library, local state, or reducer |
| Server state | Existing server-state layer if one exists |
| Cross-page client state | Existing project global store |
| Stable providers and dependency injection | Context |

Server state rules:

- If the project already has TanStack Query, RTK Query, SWR, or another server-state layer, use it for API cache, loading, error, pagination, invalidation, and optimistic update behavior.
- Do not introduce a server-state library for a few one-off requests. Use the existing API client plus local `useState` or `useReducer`.
- Introduce a server-state library only when caching, invalidation, request deduplication, pagination, optimistic updates, or cross-screen synchronization justify the dependency. Record the choice in an ADR.
- If the project already depends on Redux Toolkit and needs a server-state layer, evaluate RTK Query before adding another cache library.

Global client state rules:

- Global state must prove global necessity. Keep state local until it is shared across distant UI, routes, or workflows.
- If the project already depends on Redux or Redux Toolkit, use Redux for global client state unless the feature's existing area clearly uses another store.
- If the project already depends on Zustand, use Zustand for global client state unless the feature's existing area clearly uses another store.
- If both Redux and Zustand are present, follow the existing feature-local convention. Do not migrate state libraries opportunistically during unrelated work.
- If neither Redux nor Zustand is present, do not add one for a small feature. Start local; propose an ADR only when cross-page client state becomes real.
- Context is for providers and low-frequency stable values, not a default store. Use it for theme, locale, dependency injection, current clients, and stable configuration.

## Small Unit Composition Pattern

Use:

- Pure Function for transformations and calculations.
- Single Responsibility for components, hooks, services, and reducers.
- Composition over inheritance for UI and behavior reuse.
- Pipeline or chain of transforms for step-by-step data shaping.
- Strategy pattern when a workflow has interchangeable policies.
- Command pattern when UI events should become explicit application actions.

Avoid:

- Large page components that fetch, validate, transform, render, persist, and track analytics in one file.
- Omnibus hooks that return every action and state field for a feature.
- Global stores that own unrelated workflows.
- Helper files that become untyped dumping grounds.

## Explicit State Pattern

State must be explicit. Hidden state, boolean combinations, and implicit async phases are common sources of AI mistakes.

Use:

- State Machine for multi-step workflows, modal/drawer flows, onboarding, uploads, checkout, and batch operations.
- Reducer pattern when several events update the same state.
- Explicit state enums such as `idle`, `loading`, `editing`, `saving`, `success`, and `error`.
- Lightweight event sourcing when a frontend workflow benefits from an append-only event list or undo/redo.
- Command + Result for application actions that can fail, instead of throwing across UI boundaries by default.

Practical rules:

- Represent illegal states as impossible in TypeScript when reasonable.
- Put allowed transitions near the reducer or state machine.
- Handle illegal transitions deliberately: ignore, return a failure result, or surface a typed error.
- Prefer `{ ok: true, value } | { ok: false, error }` for user-triggered commands that the UI must handle.

## Architecture Smells

- Page component mixes fetching, validation, rendering, persistence, and analytics.
- Hook returns dozens of fields and actions.
- Several boolean flags encode one workflow state.
- Features import each other's private files.
- Types or schemas are duplicated across feature boundaries.
- A global store owns unrelated workflows.
