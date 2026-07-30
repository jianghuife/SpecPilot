---
name: tanstack-query
description: Use when creating, editing, reviewing, testing, or migrating TanStack Query, React Query, QueryClient providers, query keys, queryOptions, useQuery, useMutation, useInfiniteQuery, cache invalidation, optimistic updates, SSR hydration, or server-state fetching in React apps.
---

# TanStack Query

Use this skill for TanStack Query work in React applications. Treat the official TanStack Query React docs as the source of truth, then follow the consuming codebase's local routing, API client, error UI, test runner, and file organization.

## Default Stance

- Use TanStack Query for server state: data fetched from remote APIs that needs caching, background refetching, retries, invalidation, pagination, or synchronization.
- Do not copy server state into `useState`, Redux, Zustand, or context unless there is a specific client-state reason. Keep client-only UI state in local state or the existing client-state store.
- Create one stable `QueryClient` for each client app/runtime boundary. Do not create a new `QueryClient` during render.
- Understand the defaults before overriding them: queries are stale by default, inactive queries are garbage collected after 5 minutes, failed queries retry 3 times with exponential backoff, and JSON-compatible results use structural sharing.
- Set `staleTime` to model data freshness. Prefer `staleTime` over disabling refetch triggers when the problem is excessive refetching.

## Setup

- Wrap React trees that use queries with `QueryClientProvider`.
- Keep the `QueryClient` stable through module scope, React state initialization, or the framework's recommended provider pattern.
- Add Devtools when helpful for development, but do not make Devtools a production or universal requirement.

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

## Query Keys And Options

- Query keys must be top-level arrays. Include every variable that changes the fetched data in the query key.
- Keep query keys JSON-serializable and unique to the represented data. Object property order is normalized, but array item order matters.
- Prefer `queryOptions` to colocate a query's `queryKey`, `queryFn`, and defaults once while preserving TypeScript inference across `useQuery`, `useSuspenseQuery`, `useQueries`, `prefetchQuery`, and `setQueryData`.

```typescript
import { queryOptions, useQuery } from '@tanstack/react-query';

function projectOptions(projectId: string) {
  return queryOptions({
    queryKey: ['projects', projectId],
    queryFn: () => fetchProject(projectId),
    staleTime: 60_000,
  });
}

export function useProject(projectId: string) {
  return useQuery(projectOptions(projectId));
}
```

## Query Functions

- Query functions must return data or throw. Return `null` for a successful empty value; do not return `undefined`.
- When using `fetch`, manually throw for non-2xx responses because `fetch` does not reject HTTP errors by default.
- Use `enabled` for dependent queries so a query waits until required inputs exist.
- Use `select` to transform or subscribe to part of a response without copying server data into component state.
- Use `useQueries` for dynamic parallel queries and `useInfiniteQuery` for cursor or page-based infinite loading.

```typescript
const projectTasksQuery = useQuery({
  queryKey: ['projects', projectId, 'tasks'],
  queryFn: async () => {
    const response = await fetch(`/api/projects/${projectId}/tasks`);
    if (!response.ok) {
      throw new Error('Failed to fetch project tasks');
    }
    return response.json() as Promise<Task[]>;
  },
  enabled: Boolean(projectId),
  select: (tasks) => tasks.filter((task) => !task.archived),
});
```

## Mutations And Cache Updates

- Use `useMutation` for writes and side-effecting server operations.
- Invalidate related queries after successful mutations. Target invalidation by query key prefix or exact filters instead of invalidating the whole cache by default.
- Return or await invalidation promises from mutation callbacks when the mutation should remain pending until the refetch work finishes.
- Use `onMutate` for cache-level optimistic updates: cancel outgoing queries, snapshot previous cache data, update the cache, roll back on error, and invalidate or refetch on settle.
- For simple optimistic UI, prefer rendering the pending mutation variables instead of editing the cache directly.

```typescript
const queryClient = useQueryClient();

const updateTask = useMutation({
  mutationFn: saveTask,
  onSuccess: async (task) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['projects', task.projectId] }),
    ]);
  },
});
```

## Server Rendering

- Prefetch, dehydrate, and hydrate for server rendering. The server should prefetch data before rendering, dehydrate the cache into serializable data, and the client should hydrate that data into TanStack Query.
- Prefer framework router integration when available so route loaders or server components prefetch the queries they render.
- Avoid duplicate client fetches by aligning server-prefetched query keys, query functions, and `staleTime` with the client queries.

## Testing

- Use an isolated `QueryClient` per test or clear the client between tests. Shared clients can leak cache state across test cases.
- Disable retries in tests unless retry behavior is the behavior under test.
- Wrap hook or component tests in `QueryClientProvider`.
- Assert query states with async testing utilities such as `waitFor` rather than fixed sleeps.

## Review Checklist

- Is this server state, not client-only UI state?
- Is the `QueryClient` stable and provided once for the relevant runtime boundary?
- Do query keys include every data-changing variable and remain JSON-serializable?
- Are reusable queries expressed through `queryOptions` or an equivalent local query-key pattern?
- Do query functions throw on errors and avoid resolving `undefined`?
- Are dependent queries gated with `enabled`?
- Are mutation invalidations targeted and awaited when pending state must include refetch work?
- Are optimistic updates either UI-only or implemented with snapshot, rollback, and invalidation?
- For server rendering, do prefetch/dehydrate/hydrate use matching keys and freshness settings?
- Do tests isolate `QueryClient` cache state?

## Official References

- Important defaults: https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
- Query keys: https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
- Query functions: https://tanstack.com/query/latest/docs/framework/react/guides/query-functions
- Query options: https://tanstack.com/query/latest/docs/framework/react/guides/query-options
- Dependent queries: https://tanstack.com/query/latest/docs/framework/react/guides/dependent-queries
- Query invalidation: https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation
- Invalidations from mutations: https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations
- Optimistic updates: https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates
- Server rendering and hydration: https://tanstack.com/query/latest/docs/framework/react/guides/ssr
- Testing: https://tanstack.com/query/latest/docs/framework/react/guides/testing
- Stable Query Client ESLint rule: https://tanstack.com/query/latest/docs/eslint/stable-query-client
