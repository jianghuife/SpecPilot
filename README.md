# SpecPilot

SpecPilot is a lightweight, repository-backed AI coding harness for Claude Code and Codex.
It keeps specifications, tasks, decisions, reviews, verification evidence, and durable project
knowledge close to the code.

Version `0.5.0-beta.1` is a clean rewrite. It does not read, migrate, or delete legacy
Comet/OpenSpec data.

## Principles

- Markdown and YAML in the repository are the source of truth.
- Multiple changes may be open; there is no linear workflow phase state machine.
- CodeGraph is recommended but optional. Graph results narrow source reading and are never proof.
- TDD is opt-in per task. When enabled, finish requires red-before-green evidence with a shared
  command and a green run matching the current worktree.
- Runtime files are projected from one English source to Claude Code and Codex.
- There is no general-purpose Skill installer, Skill marketplace, or third-party Skill manager.

## Requirements

- Node.js 20 or newer
- Git
- Claude Code, Codex, or both
- Optional: [CodeGraph](https://colbymchenry.github.io/codegraph/)

## Install

```bash
npm install --global specpilot-kit
```

## Initialize

```bash
cd your-project
specpilot init
```

Interactive initialization previews all managed paths and recommends CodeGraph before asking for
confirmation. It never edits global MCP configuration.

For automation:

```bash
specpilot init . --host all --graph none --yes
specpilot init . --host codex --graph codegraph --yes
specpilot init . --dry-run --json
```

In non-interactive `--yes` mode, CodeGraph installation is allowed only when
`--graph codegraph` is explicit. Otherwise SpecPilot uses source search.

## Initialize project knowledge

After the harness is initialized, create a local codebase inventory:

```bash
specpilot init knowledge
specpilot init knowledge /path/to/project --dry-run --json
```

The command inventories manifests, languages, source roots, test roots, and existing project
memory. It writes `.specpilot/local/knowledge-init.json`, which is gitignored and rebuildable. It
does not write to `specs/knowledge/`.

Next, invoke `specpilot-init-knowledge` in Claude Code or Codex. The workflow confirms candidates
in source/tests/configuration, previews glossary/standards/decision updates, and asks for approval
before writing. Durable knowledge still follows candidate → review → promote.

## Agent workflow

Invoke these installed workflow skills in Claude Code or Codex:

- `specpilot-init-knowledge` builds reviewed project memory from the local inventory without
  promoting unverified claims.
- `specpilot-start` clarifies scope one high-value question at a time, previews the change, then
  creates its spec and tasks.
- `specpilot-work` loads minimal context and implements one task.
- `specpilot-review` independently reviews project standards and spec fidelity.
- `specpilot-finish` enforces exit gates, closes the change in place, and previews knowledge
  candidates.
- `specpilot-resume` is a read-only recovery entry that recommends one of the other workflows.

Light changes contain a spec and the minimum useful tasks. Standard changes additionally contain
design and plan documents with task dependencies. The agent proposes the classification and asks
the user to confirm it before writing.

## CLI

```text
specpilot init [path]
  --host claude|codex|all
  --graph codegraph|none
  --context-injection
  --dry-run --yes --json

specpilot init knowledge [path] [--dry-run] [--json]
specpilot status [path] [--json]
specpilot doctor [path] [--json]

specpilot add skill [name] [--path <path>] [--json]

specpilot change new <id> --title <title> [--kind light|standard] [--path <path>] [--json]
specpilot change approve <id> [--path <path>] [--json]
specpilot task add <change> <id> --title <title> \
  [--execution standard|tdd] [--blocked-by <ids...>] [--path <path>] [--json]
specpilot task start <change> <id> [--path <path>] [--json]
specpilot task complete <change> <id> [--path <path>] [--json]
specpilot task block <change> <id> --reason <reason> [--path <path>] [--json]
specpilot task waive <change> <id> --reason <reason> [--path <path>] [--json]

specpilot context add <change> <task> --purpose work|review \
  --file <path> --reason <reason> [--path <path>] [--json]
specpilot context list <change> <task> --purpose work|review [--path <path>] [--json]
specpilot context remove <change> <task> --purpose work|review \
  --file <path> [--path <path>] [--json]
specpilot context injection enable|disable [--path <path>] [--json]

specpilot session activate <change> [task] [--path <path>] [--json]
specpilot session show [--path <path>] [--json]
specpilot session clear [--path <path>] [--json]

specpilot review record <change> \
  --standards pass|pass_with_warnings|blocked \
  --spec pass|pass_with_warnings|blocked \
  --body-file <path> [--path <path>] [--json]

specpilot graph status [path] [--json]
specpilot graph explore <query> [path] [--json]
specpilot graph impact <symbol> [path] [--json]
specpilot graph affected <files...> [--path <path>] [--json]

specpilot verify run \
  --change <id> --task <id> --phase red|green|final \
  [--reason <expected-failure>] [--path <path>] -- <command>

specpilot update [path] [--json]
specpilot uninstall [path] [--yes] [--json]
```

`doctor` checks config validity, managed runtime drift, artifact contracts, CodeGraph readiness,
and evidence freshness. `update` refreshes only manifest-managed runtime. `uninstall` removes
only manifest-managed runtime and SpecPilot config; specs, tasks, reviews, knowledge, evidence,
and unrelated host files remain.

## Repository contract

```text
specs/
  project/
    glossary.md
    standards/
    decisions/
  changes/<change-id>/
    change.yaml
    spec.md
    design.md          # standard only
    plan.md            # standard only
    tasks/*.md
    context/*.json     # per-task work/review context manifests
    review.md
    summary.md
  knowledge/*.md

.specpilot/
  config.json
  evidence/
  local/               # gitignored; session pointer and knowledge inventory
  cache/               # gitignored and rebuildable
```

`change.yaml` stores only stable identity, `open|closed`, `light|standard`, and timestamps. It
does not store a workflow phase. Task frontmatter uses:

```yaml
---
schema_version: 1
id: implement-parser
title: Implement the parser
status: todo # todo|doing|done|blocked|waived
blocked_by: []
execution: standard # standard|tdd
---
```

Dependency cycles and waivers without a reason are invalid.

Evidence JSON records command arguments, exit code, timestamps, log path, Git HEAD, worktree
fingerprint, change, task, and phase. Red evidence requires an explained non-zero exit; green and
final evidence require zero. A code change makes prior green and final evidence stale; red
evidence stays tied to its green run through ordering and a shared command.

Task status changes go through `WorkflowHarness` and `ProjectStore`. Starting requires an approved
spec and satisfied dependencies; it also activates the local session pointer. Completing requires
fresh green evidence for the current worktree. Blocking and waiving require explicit reasons.

Each task has a repository-backed context manifest under
`specs/changes/<change>/context/<task>.json`. New manifests automatically reference the change
spec and, for standard changes, its design and plan. `context add|remove` curates additional
project standards, verified knowledge, or current-change research separately for work and review.
References must remain under `specs/`; missing files block task start, review recording, and
finish. Source files are discovered from the manifest-guided scope but are never pre-registered as
context.

Closing a change requires an approved spec (`spec_approved_at`, stamped by
`specpilot change approve`) and a `review.md` whose `worktree_fingerprint` still matches the
worktree and whose `spec_fingerprint` still matches the change's spec documents, so a code or
spec change made after review forces a re-review. `specpilot review record` derives the overall
two-axis result and captures both fingerprints automatically. Closing the active change
clears its local session pointer.

Verified knowledge requires `domain`, `summary`, `source_refs`, `evidence_refs`,
`invalidation_condition`, and `verified_at` frontmatter. Raw sessions and unconfirmed graph
results must not enter `specs/knowledge/`.

## Bundled optional Skills

SpecPilot ships a curated optional-Skill catalog under `assets/optional_skills/`. Add a Skill by
name, or omit the name to choose interactively:

```bash
specpilot add skill codebase-design
specpilot add skill domain-modeling
specpilot add skill
```

The selection is stored in `.specpilot/config.json`, projected through the same manifest-managed
Claude/Codex runtime, preserved by `update`, and removed by `uninstall`. This command only accepts
Skills bundled with SpecPilot; it does not install from arbitrary paths, URLs, registries, or
marketplaces.

`codebase-design` is selected implicitly when a request involves designing or improving a module
interface, locating a seam, deepening shallow modules, or improving testability and
AI-navigability. Invoke it explicitly with `$codebase-design`. It is derived from Matt Pocock's
MIT-licensed skill; its license is included with the bundled asset.

`domain-modeling` is selected implicitly when canonical project terminology needs clarification,
domain rules or boundaries need scenario testing, or a durable trade-off decision should be
recorded. It reads and proposes updates to `specs/project/glossary.md` and
`specs/project/decisions/`, but requires confirmation before writing. Invoke it explicitly with
`$domain-modeling`. It is adapted from Matt Pocock's MIT-licensed skill; its license is included
with the bundled asset.

## Optional per-turn state

Enable a short workflow-state breadcrumb during initialization or later:

```bash
specpilot init . --context-injection
specpilot context injection enable
specpilot context injection disable
```

The managed Claude/Codex hook injects only the active change/task, artifact status, recommended
workflow entry, and context-reference count. It does not inline specs, scan source, run finish
gates, or calculate a worktree fingerprint. Injection is disabled by default. The hook entry is
merged into `.claude/settings.local.json` and `.codex/hooks.json` without touching any other
content, so host-side rewrites (for example Claude Code recording permission approvals) never
block later updates; disable/uninstall remove only the SpecPilot hook entry, and projection
refuses only files it cannot parse. Codex requires project hooks to be reviewed and trusted;
after enabling injection, use `/hooks` to review the projected hook.

## CodeGraph behavior

SpecPilot calls the CodeGraph CLI as a subprocess; it does not embed its Node library. The stable
SpecPilot interface is `graph status|explore|impact|affected`, independent of provider output.
If CodeGraph is missing, unindexed, stale, or fails, the workflow can continue using source
search. Every impact or test candidate still needs confirmation in source, tests, or logs.

## Scope

SpecPilot 0.5 supports only Claude Code and Codex. It intentionally excludes generic Skill
distribution, other AI platforms, GitHub/Linear synchronization, embeddings/vector databases,
write-blocking hooks, automatic branch/worktree management, telemetry, and legacy migration.

## Development

```bash
pnpm install
pnpm run format:check
pnpm run lint
pnpm run build
pnpm run test
pnpm run test:coverage
npm pack --dry-run
```

## License

MIT
