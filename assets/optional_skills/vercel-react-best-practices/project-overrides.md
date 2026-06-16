# Project Overrides — infro-workspace

This file lists where **infro-workspace** intentionally diverges from the
upstream Vercel React Best Practices rules. Read this **before** applying a
rule. When a project rule contradicts the upstream rule, the project rule wins.

> Priority: `CLAUDE.md` (behavior) > `ai-rules.md` (project patterns) >
> this skill (generic React perf) > model defaults.

## Stack reminder

React 19 + Vite + TypeScript SPA. UI: **antd 6**. State: **zustand**.
Routing: **react-router-dom v6**. URL state: **nuqs**. Styles: **Less**.
Copy: English-only via `src/copy.ts`. Tests: **Vitest** + `happy-dom`.

Use Vite SPA and React Router conventions. Use Less, not Tailwind.

## Overrides

### Rule 2.1 — Avoid Barrel File Imports

**Override:** `antd` and `@ant-design/icons` barrel imports are allowed and
preferred in this project.

`antd` ships an `sideEffects: false` declaration plus per-component subpaths.
Vite tree-shakes the barrel correctly, and the project's coding standard
(`ai-rules.md` §6) uses `import { Button, Form } from 'antd'`. Do **not** rewrite
those to `import Button from 'antd/es/button'`.

Still applies to: `lucide-react`, `lodash`, `date-fns`, `rxjs`, `@mui/*`,
`react-icons`, and any future library known to ship a bloated barrel.

### Rule 5.x — Any example using Tailwind class names

**Override:** Ignore the Tailwind class syntax in the example snippets. This
project uses **Less** with BEM (`ai-rules.md` §8). Translate the intent into a
Less class or the antd component's `style` prop.

Affected upstream snippets include `animate-spin`, `animate-pulse h-20 bg-gray-200`,
`overflow-y-auto h-screen`, etc. The underlying rule (e.g. animate the wrapper
div, use `content-visibility` on long lists) still applies — just the styling
mechanism is different.

### Rule 5.6 — `defer` / `async` on script tags

**Override:** Not applicable. The app is bundled by Vite; we do not author raw
`<script>` tags in HTML. Skip.

### Rule 5.8 — React DOM Resource Hints

Prefer plain `<link rel="preconnect">` in `index.html` for global resources and
dynamic `import()` for route or feature bundle warming. Use React DOM resource
hint APIs only when a component has a specific reason to announce a resource
from render.

### State management

The skill does not mention zustand. When upstream says "useContext" or
"useState", check `ai-rules.md` §2 first to decide whether the value belongs in
component state, a reducer, or a zustand store. Selector rules in `ai-rules.md`
(notably `useShallow` for object/array selectors) take precedence.

### `message` / `notification` / `modal`

The skill says nothing antd-specific. `ai-rules.md` §6 mandates the
`App.useApp()` hook form — never the static `message.error()` API. This rule
always applies in this project.

## How agents should use this file

1. Read the user's task.
2. Pick the upstream rule(s) that apply.
3. Cross-check this file for an override.
4. If overridden, follow the override; otherwise follow the upstream rule.
5. If unsure, surface the choice to the user before editing code.
