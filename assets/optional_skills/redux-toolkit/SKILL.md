---
name: redux-toolkit
description: Use when creating, editing, reviewing, testing, or migrating Redux Toolkit, React Redux hooks, RTK Query, createSlice, createAsyncThunk, listener middleware, entity adapters, or Next.js Redux store setup.
---

# Redux Toolkit

Use this skill for Redux Toolkit work in React and Next.js applications. Treat the official Redux Style Guide and Redux Toolkit documentation as the source of truth, then follow the consuming codebase's local architecture, naming, test runner, and API conventions.

## Default Stance

- Use Redux Toolkit as the standard way to write Redux logic. It is the official recommended approach and bakes in the common Redux best practices.
- Keep Redux for state that is global, shared, cached, replayed, or coordinated across distant UI. Keep local component state, temporary form state, and URL-owned state outside Redux unless there is a concrete sharing or persistence reason.
- Use one Redux store for a client-side app. For Next.js App Router, create a fresh store per request and expose it through a client provider.
- Keep state minimal. Store source data, derive computed values through selectors, and avoid duplicating values that can be calculated.
- Structure Redux code by feature when possible, with slice logic, selectors, tests, and related async code close together.

## Store And TypeScript

- Configure stores with `configureStore`, not hand-written Redux store setup.
- Infer `RootState`, `AppStore`, and `AppDispatch` from the actual store or root reducer so middleware and enhancer changes stay reflected in types.
- Export typed React Redux hooks once and use them everywhere:

```typescript
import { useDispatch, useSelector, useStore } from 'react-redux';

import type { AppDispatch, AppStore, RootState } from './store';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<AppStore>();
```

- Next.js App Router: create a store per request, keep Redux providers in client components, and do not read or write Redux state from React Server Components.

```typescript
import { configureStore } from '@reduxjs/toolkit';

import todosReducer from './features/todos/todosSlice';

export const makeStore = () =>
  configureStore({
    reducer: {
      todos: todosReducer,
    },
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
```

## Slices And Reducers

- Model feature state with `createSlice`. Put related action creators and reducer logic together.
- Reducers must stay pure. Do not start requests, read random values, access dates, mutate external variables, or trigger UI side effects inside reducers.
- Immer-powered "mutating" syntax inside RTK reducers is encouraged, but only mutate the draft state that Immer gives you.
- Do not put non-serializable values in state or actions. Keep class instances, promises, DOM nodes, functions, dates that need custom handling, and service clients outside Redux state.
- Name actions as domain events (`todoCompleted`, `userLoggedOut`) instead of generic setters when the action represents something that happened.
- Let reducers own their state shape. Components should read through selectors instead of depending on slice internals.
- Treat complex async and UI flows as state machines with explicit statuses such as `idle`, `pending`, `succeeded`, and `failed`.
- Avoid dispatching many actions sequentially for one user event. Prefer one event action, a thunk, listener middleware, or a reducer that owns the whole transition.

```typescript
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type RequestStatus = 'idle' | 'pending' | 'succeeded' | 'failed';

interface TodosState {
  ids: string[];
  status: RequestStatus;
  error: string | null;
}

const initialState = {
  ids: [],
  status: 'idle',
  error: null,
} satisfies TodosState;

const todosSlice = createSlice({
  name: 'todos',
  initialState,
  reducers: {
    todoAdded(state, action: PayloadAction<string>) {
      state.ids.push(action.payload);
    },
    requestFailed(state, action: PayloadAction<string>) {
      state.status = 'failed';
      state.error = action.payload;
    },
  },
});

export const { todoAdded, requestFailed } = todosSlice.actions;
export default todosSlice.reducer;
```

## Async Logic

- Use RTK Query for server-state fetching and caching. Prefer it for API data that needs cache lifetimes, deduplication, loading states, invalidation, polling, pagination, optimistic updates, or generated React hooks.
- Use `createApi` from `@reduxjs/toolkit/query/react` for React apps so endpoint hooks are generated from the API service.
- Use tags and invalidation deliberately. Mutations should invalidate the smallest useful set of cached data.
- Use `createAsyncThunk` for one-shot request workflows, imperative async work, or cases where RTK Query does not fit the shape of the problem.
- Use listener middleware for reactive logic such as responding to actions, debouncing, cancellation, analytics, persistence bridges, or workflows that should run outside reducers.
- Prefer RTK listener middleware and thunks over sagas or observables for new code unless the existing codebase already relies on those tools for a specific reason.

## Normalized Data And Selectors

- Use `createEntityAdapter` for normalized collections. It gives each collection an `ids` array, an `entities` lookup table, CRUD reducers, and selectors.
- Keep one adapter per entity type in TypeScript so entity IDs, selectors, and reducer helpers remain correctly typed.
- Organize state by data type and domain concepts, not by component tree shape.
- Name selector functions as `selectThing`, `selectThingById`, or `selectVisibleThings`.
- Use `createSelector` for derived data that is expensive, shared, or relies on stable references. Do not store derived arrays or counts in Redux if selectors can compute them.

## Review Checklist

- Is Redux necessary for this state, or should it stay local, URL-owned, or server-cache-owned?
- Is store setup using `configureStore`, inferred store types, and typed React Redux hooks?
- Are reducers pure, event-oriented, and limited to Immer draft updates?
- Are state and actions serializable?
- Is server data handled by RTK Query unless there is a clear reason for `createAsyncThunk` or listener middleware?
- Are relational collections normalized with `createEntityAdapter` or an equivalent normalized shape?
- Are components using selectors instead of reaching into slice internals?
- For Next.js App Router, is the store created per request and only accessed from client components?
- Do tests cover reducers, selectors, thunk or listener behavior, and RTK Query cache or invalidation behavior where relevant?

## Official References

- Redux Toolkit is the standard Redux approach: https://redux.js.org/introduction/why-rtk-is-redux-today
- Redux Style Guide: https://redux.js.org/style-guide
- Redux Toolkit TypeScript usage: https://redux-toolkit.js.org/usage/usage-with-typescript
- RTK Query tutorial: https://redux-toolkit.js.org/tutorials/rtk-query
- `createAsyncThunk`: https://redux-toolkit.js.org/api/createAsyncThunk
- `createEntityAdapter`: https://redux-toolkit.js.org/api/createEntityAdapter
- Side effects approaches: https://redux.js.org/usage/side-effects-approaches
- Redux with Next.js: https://redux.js.org/usage/nextjs
