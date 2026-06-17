# Vercel React Best Practices (project copy)

Performance optimization rules for React single-page apps, adapted from Vercel's
upstream guide. Lives under `.agents/skills/` so both Claude Code (via
`.claude/skills/` symlink) and Codex (via the project `AGENTS.md` reference) can
consume the same source.

## Entry points

- `SKILL.md` — Claude Code entry. Loaded by the `Skill` tool.
- `AGENTS.md` — Codex entry. The full compiled rule set in one guide.
- `rules/<area>-<topic>.md` — Individual rules, grouped by area prefix.

## Areas

| Prefix       | Section                   | Default impact |
| ------------ | ------------------------- | -------------- |
| `async-`     | Eliminating Waterfalls    | CRITICAL       |
| `bundle-`    | Bundle Size Optimization  | CRITICAL       |
| `client-`    | Client-Side Data Fetching | MEDIUM-HIGH    |
| `rerender-`  | Re-render Optimization    | MEDIUM         |
| `rendering-` | Rendering Performance     | MEDIUM         |
| `js-`        | JavaScript Performance    | LOW-MEDIUM     |
| `advanced-`  | Advanced Patterns         | LOW            |

See `rules/_sections.md` for full section metadata.

## Rule file format

```markdown
---
title: Rule Title
impact: MEDIUM
impactDescription: Optional one-line context
tags: tag1, tag2
---

## Rule Title

Brief explanation.

**Incorrect:** ...
**Correct:** ...

Reference: ...
```

`_template.md` is the starting point for a new rule.

## When to apply

- Writing new React components
- Implementing client-side data fetching
- Reviewing code for performance issues
- Refactoring existing React SPA code

Apply these rules together with the consuming project's own agent instructions,
framework choices, styling conventions, and dependency policies. Project-specific
exceptions should live in that project, not in this distributable skill.

## Provenance

Source: Vercel React Best Practices v1.0.0 (Jan 2026), originally by
[@shuding](https://x.com/shuding). Modified locally — do not assume parity with
upstream.
