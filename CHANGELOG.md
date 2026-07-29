# Changelog

All notable changes to `specpilot-ai` are documented here.

## [0.5.0-beta.1] - 2026-07-29

### Added

- Repository-backed specs, tasks, reviews, evidence, decisions, and project knowledge.
- `init`, `status`, `doctor`, `graph`, `verify`, `update`, and `uninstall` CLI contracts.
- `specpilot init knowledge` with a gitignored codebase inventory and reviewed knowledge workflow.
- Claude Code and Codex runtime projection from one English source.
- Optional CodeGraph integration with source-search fallback.
- Explicit per-task TDD with red, green, final, and worktree-fingerprint gates.
- Linux, macOS, and Windows CLI smoke coverage.

### Changed

- Rebuilt SpecPilot as a single TypeScript ESM package requiring Node.js 20 or newer.
- Made Markdown/YAML repository artifacts the source of truth.
- Made review two-dimensional: project standards and approved-spec fidelity.
- Kept closed changes in place so references remain stable.

### Removed

- Legacy Comet/OpenSpec orchestration and phase-state machinery.
- Generic Skill installation, optional third-party Skill bundles, and multi-platform distribution.
- Bilingual runtime assets, shell guards, context-compression benchmarks, and legacy tests/docs.

### Safety

- Graph output is advisory and must be confirmed in source, tests, or logs.
- Update touches only manifest-managed runtime files.
- Uninstall preserves project specs, tasks, decisions, reviews, summaries, knowledge, and evidence.
