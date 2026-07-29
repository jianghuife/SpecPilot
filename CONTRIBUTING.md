# Contributing to SpecPilot

SpecPilot 0.5 is a single TypeScript ESM package for Claude Code and Codex. The supported public
surface is the CLI, repository artifact contracts, and the runtime workflows under `runtime/`.

## Product boundaries

- Do not add generic Skill installation, third-party Skill management, or a platform registry.
- Keep project memory file-first. Do not add SQLite, vector databases, or embeddings.
- Keep CodeGraph optional and preserve source-search fallback behavior.
- Keep TDD opt-in per task and preserve red → green → final evidence semantics.
- Runtime projection may touch only files recorded in the SpecPilot runtime manifest.
- Update and uninstall must preserve specs, tasks, reviews, knowledge, and evidence.

## Development

Requirements:

- Node.js 20 or newer
- pnpm 10
- Git

Install dependencies:

```bash
pnpm install
```

Implement behavior in vertical TDD slices at a module, CLI, or file-contract seam. Add one failing
test, make the smallest implementation pass, then review and refactor while green.

Run the complete verification suite before opening a pull request:

```bash
pnpm run format:check
pnpm run lint
pnpm run build
pnpm run test
pnpm run test:coverage
node scripts/prepublish-check.js
npm pack --dry-run
```

## Repository map

```text
src/project/      artifact schemas, initialization, status, and doctor
src/workflow/     start/work/review/finish gates
src/evidence/     command execution and worktree fingerprints
src/graph/        CodeGraph adapter and source fallback
src/memory/       retrieval, local inventory, and knowledge promotion
src/runtime/      managed Claude/Codex runtime projection
runtime/skills/   English runtime source assets
test/v05/         current behavior tests
```

## Documentation and releases

Update `README.md` for user-facing behavior and `CHANGELOG.md` for release-visible changes. Runtime
instructions are English-only and must remain behaviorally equivalent when projected to Claude
Code and Codex.

Use Conventional Commits with a concise subject. Do not commit generated `dist/`, `coverage/`,
tarballs, local CodeGraph indexes, or consuming-project `.specpilot/local/` and cache data.
