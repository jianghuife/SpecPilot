# Changelog

All notable changes to `specpilot-kit` are documented here.

## [0.5.0] - 2026-07-29

### Changed

- The npm package is renamed from `specpilot-ai` to `specpilot-kit`; the CLI command remains
  `specpilot`. Versions up to 0.4.0 stay published under the old name.

### Added

- A curated bundled optional-Skill catalog under `assets/optional_skills/`.
  `specpilot add skill [name]` installs a selected asset through `RuntimeProjector`, persists the
  selection across updates, and supports interactive selection when the name is omitted. The
  bundled catalog includes the MIT-licensed `codebase-design` and an adapted `domain-modeling`
  Skill for reviewed updates to the repository-backed glossary and project decisions.
- Repository-backed per-task context manifests distinguish work and review references.
  `specpilot context add|list|remove` validates project-relative SpecPilot artifact paths, and
  missing curated context blocks start, review recording, and finish.
- Optional lightweight per-turn state injection for Claude Code and Codex. Enable it with
  `specpilot init --context-injection` or `specpilot context injection enable`; it injects only
  the active pointer, statuses, recommended workflow, and context count.
- `specpilot change new`, `specpilot change approve`, and `specpilot task add` scaffold changes
  and tasks with validated frontmatter instead of hand-written YAML, refusing overwrites.
- `specpilot task start|complete|block|waive` routes task state changes through workflow gates and
  validated artifact writes. Start requires approved specs and satisfied dependencies; complete
  requires fresh green evidence; block and waive require reasons.
- `specpilot session activate|show|clear` manages the local change/task pointer. Starting a task
  activates it, status identifies stale references, and closing the active change clears it.
- `specpilot review record` derives the overall two-axis review status, captures the current
  worktree fingerprint, and writes validated `review.md` content through `ProjectStore`.
- A public CLI E2E test exercises init, start, work evidence, task completion, review, final
  evidence, finish preview/apply, and session cleanup.
- Finish gate: `change.yaml` must record `spec_approved_at`.
- Finish gate: `review.md` must record a `worktree_fingerprint` matching the current worktree, so
  code changes after review force a re-review.
- Finish gate: `review.md` must record a `spec_fingerprint` matching the change's current
  `spec.md`/`design.md`/`plan.md`. The worktree fingerprint excludes `specs/**`, so this closes
  the gap where editing the approved spec after a passing review would still allow finish.
- The per-turn `prompt-context` hook degrades to a visible "state unavailable" note instead of
  failing the hook when the project state cannot be read, and a corrupt local `session.json` is
  treated as no session by status/resume instead of crashing them.
- Finish gate: a TDD task's red and green evidence must use the same command.
- Finish gate: evidence records must carry the change id of the change being closed, so records
  copied from another change's directory cannot satisfy green or final gates.
- Finish preview and apply list pending knowledge candidates from
  `.specpilot/local/knowledge-candidates/`, and `summary.md` records them plus the verified
  review/final-evidence facts instead of hard-coded text; nothing is promoted automatically.

### Changed

- Per-turn state injection now merges the SpecPilot hook entry into
  `.claude/settings.local.json` / `.codex/hooks.json` instead of managing the whole file.
  Host-side rewrites (such as Claude Code recording permission approvals) no longer block
  `update`, `context injection disable`, or `uninstall`, which remove only the SpecPilot hook
  entry; projection refuses only hooks files it cannot parse.
- A `blocked` review can be recorded while tasks are still unfinished; only passing reviews
  require finished tasks and complete review context.
- `status` no longer marks a session without an active pointer as stale; stale strictly means a
  reference to a missing or closed change/task.

### Fixed

- Red evidence no longer needs to match the final worktree fingerprint, which was impossible in
  a genuine red-implement-green flow; it is now tied to green through ordering and the shared
  command, while green and final evidence still require the current fingerprint.
- Evidence discovery now belongs to `EvidenceRunner`; workflow and doctor callers no longer read
  evidence directories directly.

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
