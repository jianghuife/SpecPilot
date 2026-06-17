---
name: zustand-best-practices
description: Use when creating, editing, reviewing, testing, or debugging Zustand stores, selectors, middleware, persistence, vanilla stores, or React components that read Zustand state.
metadata:
  source: https://zustand.docs.pmnd.rs/
---

# Zustand Best Practices

Use this skill for Zustand state design, store implementation, selectors, middleware, persistence, tests, and render behavior.

## Fast Rules

- Use Zustand only for shared cross-component, cross-route, or non-React state. Keep component-local state in React.
- Prefer typed `create<State>()((set, get) => ({ ... }))`.
- Prefer simple setter actions unless domain behavior needs a richer action.
- Put API calls and business orchestration in hooks or services, then call store setters.
- Never import UI framework APIs or React components into stores.
- Keep state updates immutable. `set` shallow-merges only one level.
- For object, array, Map, or Set updates, create new references.
- Use narrow selectors. Primitives, and stored object/array references, don't need `useShallow`.
- Use `useShallow` only when the selector **constructs a new object/array each call** (picks multiple fields, runs `filter`/`map`, etc.).
- Do not call `get()` synchronously while constructing initial state.
- Use `persist`, `devtools`, `immer`, and `subscribeWithSelector` only when they solve a concrete problem.
- Reset stores between tests when state can leak across cases.

Full guidance and examples are in `AGENTS.md`.
