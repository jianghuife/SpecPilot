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
- TDD is opt-in per task. When enabled, finish requires current red and green evidence.
- Runtime files are projected from one English source to Claude Code and Codex.
- There is no general-purpose Skill installer, Skill marketplace, or third-party Skill manager.

## Requirements

- Node.js 20 or newer
- Git
- Claude Code, Codex, or both
- Optional: [CodeGraph](https://colbymchenry.github.io/codegraph/)

## Install

```bash
npm install --global specpilot-ai@beta
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
  --dry-run --yes --json

specpilot init knowledge [path] [--dry-run] [--json]
specpilot status [path] [--json]
specpilot doctor [path] [--json]

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
final evidence require zero. A code change makes prior evidence stale.

Verified knowledge requires `domain`, `summary`, `source_refs`, `evidence_refs`,
`invalidation_condition`, and `verified_at` frontmatter. Raw sessions and unconfirmed graph
results must not enter `specs/knowledge/`.

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
