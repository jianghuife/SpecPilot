---
title: Hoist RegExp Creation
impact: LOW-MEDIUM
impactDescription: avoids recreation
tags: javascript, regexp, optimization, memoization
---

## Hoist RegExp Creation

Don't recreate a RegExp on every render or call. Hoist a constant pattern to module scope; memoize a pattern that depends on props/state with `useMemo()`.

**Incorrect (constant regex rebuilt on every call):**

```tsx
function isEmail(value: string) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/ // recompiled every call
  return regex.test(value)
}
```

**Correct (hoist the constant pattern to module scope):**

```tsx
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isEmail(value: string) {
  return EMAIL_REGEX.test(value)
}
```

**Correct (memoize a pattern that depends on a prop):**

```tsx
function Highlighter({ text, query }: Props) {
  const regex = useMemo(() => new RegExp(`(${query})`, 'gi'), [query])
  const parts = text.split(regex)
  return <>{parts.map((part, i) => <span key={i}>{part}</span>)}</>
}
```

**Warning (global regex has mutable state):**

Global regex (`/g`) has mutable `lastIndex` state:

```typescript
const regex = /foo/g;
regex.test("foo"); // true, lastIndex = 3
regex.test("foo"); // false, lastIndex = 0
```
