# Zustand Best Practices

**Version 1.0.0**
Source: Zustand official docs, read on 2026-05-22
Scope: React + TypeScript Zustand usage in SPA projects

## Positioning

Use this guide for Zustand-specific implementation patterns. When a consuming
project has its own architecture or state-management rules, follow those
project-local instructions first.

## When To Use Zustand

Use Zustand for **client-owned** state that is genuinely shared across routes/components or needed outside React. Do not move local UI state into a store just because a store exists.

### Server data belongs to a server-state cache, not Zustand

Anything the backend owns and can re-fetch — current user, account info, tenant
info, billing, MFA status, preferences fetched from an API — belongs in a
server-state cache such as React Query, SWR, or the consuming app's data layer,
**not** Zustand. Don't mirror server state into a store just because multiple
routes need it.

Zustand is for state that has **no server source of truth to refetch from**.

Good fits:

- Cross-route UI preferences and layout state (sidebar collapsed, theme override) that aren't worth a URL param and don't need server persistence
- In-flight wizard / multi-step input that hasn't been submitted yet
- Ephemeral cross-component flags (e.g. "a long task is running, show a banner") read from non-React code
- State produced inside a non-React service that React then needs to observe

Poor fits:

- A single modal's open state → component-local `useState`
- One form's temporary field state → the form library or component-local state
- Derived values that can be calculated during render → compute it inline
- API loading state used by one route only → the app's data-fetching layer
- Any data that can be invalidated and re-fetched → the app's data-fetching layer

## Store Shape

Use explicit TypeScript state and actions. Prefer simple setter actions unless
domain behavior needs a richer action.

```ts
import { create } from "zustand";

interface ExampleState {
  /** What this field represents */
  value: string | null;
}

interface ExampleActions {
  setValue: (value: string | null) => void;
  reset: () => void;
}

export type ExampleStore = ExampleState & { actions: ExampleActions };

const initialState: ExampleState = {
  value: null,
};

export const useExampleStore = create<ExampleStore>()((set) => ({
  ...initialState,
  actions: {
    setValue: (value) => set({ value }),
    reset: () => set(initialState),
  },
}));
```

**Why actions are nested under an `actions` key:** the object literal is built once inside the creator, so `state.actions` has a **stable reference** for the store's lifetime. That lets consumers subscribe to actions independently of state with a plain selector — no `useShallow` and no re-renders when unrelated state changes:

```ts
// ✅ Two separate subscriptions; actions reference is stable
const value = useExampleStore((s) => s.value);
const { setValue } = useExampleStore((s) => s.actions);

// ❌ Packs state + action into a fresh object → re-renders on every store change
const { value, setValue } = useExampleStore((s) => ({
  value: s.value,
  setValue: s.setValue,
}));
```

Need several actions? Subscribe to the whole `actions` bag (stable reference) and destructure outside — no `useShallow` required:

```ts
const { setValue, reset } = useExampleStore((s) => s.actions);
```

Rules:

- Split stores by domain. Avoid a single app-wide store.
- Keep store files in `src/stores/`.
- Keep API calls and business orchestration in hooks or services, then call store setters.
- Do not import UI libraries, route components, or API clients into stores.
- Never import notification, modal, toast, or other UI framework APIs into stores.
- Tiny local persistence for UI preferences is allowed when it stays scoped to that store.
- Keep `initialState` outside the creator so `reset` can reuse it.
- Avoid calling `get()` while constructing the initial state. During synchronous initialization it may not contain the finished store.

## Updating State

Zustand's `set` shallow-merges by default. It does not deep-merge nested objects.

```ts
set((state) => ({ count: state.count + 1 }));
```

For nested state, copy each changed level:

```ts
set((state) => ({
  preferences: {
    ...state.preferences,
    theme: nextTheme,
  },
}));
```

For arrays, use immutable operations:

```ts
set((state) => ({
  items: state.items.map((item) => (item.id === id ? { ...item, name } : item)),
}));
```

Avoid mutating operations in store updates:

- `push`, `pop`, `splice`, `sort`, `reverse`
- assigning `array[index] = value`
- mutating object properties in place

For `Map` and `Set`, always create a new instance:

```ts
set((state) => ({
  selectedIds: new Set(state.selectedIds).add(id),
}));

set((state) => {
  const nextById = new Map(state.byId);
  nextById.set(id, user);
  return { byId: nextById };
});
```

When initializing empty collections, provide type hints:

```ts
selectedIds: new Set([] as string[]),
usersById: new Map([] as [string, User][]),
```

Use `set(nextState, true)` only when replacing the whole state is intentional. It removes keys not present in `nextState`, including actions if they are part of the same store object.

## Selectors And Renders

Always subscribe to the smallest useful value.

```ts
const userName = useUserStore((state) => state.user?.name);
```

Primitive selectors are fine without equality helpers:

```ts
const loading = useBillingStore((state) => state.loading);
```

**When `useShallow` is needed:** only when the selector **constructs a new object or array each call** — picking multiple fields into an object literal, or running `filter`/`map`/`slice`. React's default `===` cannot see through the fresh reference, so without `useShallow` the component re-renders on every store update.

```ts
import { useShallow } from "zustand/react/shallow";

// ✅ constructs a new object literal → useShallow
const { name, email } = useUserStore(
  useShallow((state) => ({ name: state.user?.name, email: state.user?.email })),
);

// ✅ constructs a new array via filter+map → useShallow
const enabledIds = useFeatureStore(
  useShallow((state) =>
    state.features.filter((feature) => feature.enabled).map((feature) => feature.id),
  ),
);
```

**When `useShallow` is NOT needed:** the selector returns a **value that's already stored** in the state — a stored object, array, Map, or the `actions` bag. Reference equality on the stored value is enough.

```ts
// ✅ state.user is the stored reference; plain selector is fine
const user = useUserStore((state) => state.user);

// ✅ state.items is the stored array; plain selector is fine
const items = useItemsStore((state) => state.items);
```

Anti-pattern — packing fields into a new object without `useShallow`:

```ts
// ❌ returns a fresh object every render → triggers re-render on any store change
const data = useExampleStore((state) => ({ value: state.value }));
```

For values used only inside event handlers or effects, consider reading from the store hook's `getState()` at the usage point instead of subscribing the component.

## Actions Outside React

Zustand stores expose `getState`, `setState`, and `subscribe`.

Use `getState()` for imperative code that needs the latest value:

```ts
const token = useAuthStore.getState().token;
```

If a React cleanup function reads store values that may change after mount, read the latest state instead of relying on the captured closure:

```ts
useEffect(() => {
  return () => {
    const latest = useExampleStore.getState().value;
    useExampleStore.getState().actions.reset();
    cleanupWith(latest);
  };
}, []);
```

Use `subscribe` for external systems and always clean up. A naked `subscribe` fires on **every** state change, not just on the field you care about — so either compare yourself, or reach for `subscribeWithSelector`.

Inside React, scope the lifetime to the component:

```ts
useEffect(() => {
  const unsubscribe = useAuthStore.subscribe((state, prev) => {
    if (state.token !== prev.token) syncToken(state.token);
  });
  return unsubscribe;
}, []);
```

Outside React (module-level setup, services), hold the unsubscribe and call it at teardown:

```ts
// src/services/tokenSync.ts
const unsubscribe = useAuthStore.subscribe((state, prev) => {
  if (state.token !== prev.token) syncToken(state.token);
});

// Call unsubscribe() when the service shuts down (e.g. on logout).
```

If diffing in the callback gets repetitive, add the `subscribeWithSelector` middleware so the subscription fires only when the selected slice changes:

```ts
import { subscribeWithSelector } from "zustand/middleware";

export const useAuthStore = create<AuthStore>()(
  subscribeWithSelector((set) => ({ ...initialState, actions: { /* ... */ } })),
);

// Fires only when `token` changes; no manual `prev` comparison.
useAuthStore.subscribe(
  (state) => state.token,
  (token) => syncToken(token),
);
```

Use it deliberately, not by default — it costs a middleware layer and is only worth it when the broad `subscribe` is genuinely too noisy.

## Middleware

Use middleware deliberately, not by default.

### `persist`

Use for client-side state that must survive reloads. Persist only necessary
fields. Prefer router search params or a URL-state helper for state that belongs
in the URL.

```ts
import { persist } from "zustand/middleware";

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      ...initialState,
      actions: {
        setCollapsed: (collapsed) => set({ collapsed }),
      },
    }),
    {
      name: "ui-store",
      partialize: (state) => ({ collapsed: state.collapsed }),
      version: 1,
    },
  ),
);
```

Guidelines:

- Use stable storage keys.
- Use `partialize` to avoid persisting volatile, sensitive, or server-owned data.
- Do not persist server-owned auth/profile/billing data unless the backend contract explicitly allows it.
- Use `version` and `migrate` when persisted shape changes.
- Account for async hydration before assuming persisted state is ready.

### `devtools`

Use for complex state debugging. Give stores readable names. Remove noisy action names or dev-only wiring if it does not help maintainability.

### `immer`

Use only when nested immutable updates are frequent enough to justify the dependency and style. Do not mutate without `immer`.

### Slices

Use slices only for large domains where separate store files would be easier to maintain. Apply middleware at the combined store, not inside individual slices.

## Vanilla Stores

Use `createStore` from `zustand/vanilla` when state must exist independently of React or when a provider supplies per-instance stores.

Use `useStore` to bind a vanilla store in React:

```ts
import { useStore } from "zustand";

const value = useStore(exampleStore, (state) => state.value);
```

For most app-level shared state, prefer the normal hook returned by `create`.

## Testing

Test store behavior through the public store API or through components that consume it.

For store unit tests:

- Reset state before or after each test.
- Use `setState(initialState, true)` carefully if actions are not included in `initialState`.
- Prefer asserting visible behavior or final state over implementation details.

For component tests:

- Seed the store before render when needed.
- Reset stores after each test to prevent leakage.
- Use the consuming project's test runner and DOM environment.

## Review Checklist

When reviewing Zustand code, check:

- Is Zustand the right state tool for this data?
- Is the store split by domain?
- Are simple setter actions sufficient, or does the domain need richer actions?
- Are API calls kept out of stores?
- Are updates immutable, including nested objects, arrays, Map, and Set?
- Are selectors narrow?
- Are selectors that **build a new object/array** (picking fields, `filter`/`map`) wrapped in `useShallow`? Are selectors that return a **stored reference** left as plain selectors?
- Is persisted state minimal, versioned when needed, and non-sensitive?
- Are subscriptions cleaned up?
- Do cleanup functions read latest store state when closure values can be stale?
- Do tests reset stores to avoid cross-test state leakage?

## Official References

- https://zustand.docs.pmnd.rs/learn/getting-started/introduction
- https://zustand.docs.pmnd.rs/learn/guides/immutable-state-and-merging
- https://zustand.docs.pmnd.rs/learn/guides/maps-and-sets-usage
- https://zustand.docs.pmnd.rs/learn/guides/prevent-rerenders-with-use-shallow
- https://zustand.docs.pmnd.rs/learn/guides/slices-pattern
- https://zustand.docs.pmnd.rs/learn/guides/testing
- https://zustand.docs.pmnd.rs/reference/apis/create
- https://zustand.docs.pmnd.rs/reference/middlewares/persist
- https://zustand.docs.pmnd.rs/reference/middlewares/subscribe-with-selector
