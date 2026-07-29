# SpecPilot repository guidance

## Product boundary

SpecPilot is a repository-backed AI coding harness for Claude Code and Codex.

- Keep the package as one TypeScript ESM CLI package.
- Treat CLI behavior, repository artifacts, the five change workflows, and
  `specpilot-init-knowledge` as the public compatibility surface.
- Do not add a TypeScript library API, generic Skill installation, third-party Skill management,
  a platform registry, legacy Comet/OpenSpec migration, or global MCP configuration.
- Keep the runtime English-only and generate Claude/Codex projections from `runtime/`.
- CodeGraph is optional and advisory. Always preserve the source-search fallback.
- TDD stays opt-in per task.

## Deep module boundaries

- `ProjectStore` owns artifact layout and schema validation.
- `WorkflowHarness` owns workflow gates.
- `EvidenceRunner` owns command execution and fingerprinted evidence.
- `GraphProvider` owns provider-neutral graph operations and fallback.
- `MemoryCatalog` owns file-first retrieval, local pointers, cache rebuild, and knowledge
  inventory/promotion validation.
- `RuntimeProjector` owns only manifest-marked SpecPilot runtime files.

Do not bypass these boundaries from workflow assets or CLI commands.

## Safety invariants

- Never read, migrate, or delete legacy Comet/OpenSpec data.
- Never delete specs, tasks, decisions, knowledge, reviews, summaries, or evidence during update
  or uninstall.
- Preserve unrelated Claude Code/Codex files and refuse to overwrite unmanaged runtime
  collisions.
- Execute verification and provider commands without shell interpretation.
- Graph output narrows reading scope; source, tests, or logs establish conclusions.
- Keep `.specpilot/local/` and `.specpilot/cache/` gitignored and rebuildable.

## Development workflow

Implement behavior in vertical TDD slices:

1. Add a failing test at the module interface or CLI/file contract.
2. Add the smallest implementation that passes.
3. Review and refactor while green.

Before handing off:

```bash
pnpm run format:check
pnpm run lint
pnpm run build
pnpm run test
pnpm run test:coverage
node scripts/prepublish-check.js
npm pack --dry-run
```

Update `README.md` and `CHANGELOG.md` for user-visible behavior. Keep CI smoke coverage on Linux,
macOS, and Windows.
