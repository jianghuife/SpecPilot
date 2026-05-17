# Comet State Unification Design

> Unify all `.comet.yaml` state operations into a single script, eliminating manual YAML editing by agents.

## Problem

Agents currently edit `.comet.yaml` through raw `sed -i` commands and manual YAML file creation. This creates multiple failure modes:

1. **Field typos** — `sed -i 's|^build_mode:.*|build_mode: subagent-dev|'` silently writes an invalid enum value
2. **Missing fields** — agent forgets a field during initial `.comet.yaml` creation
3. **Format errors** — inconsistent quoting, spacing, or line endings
4. **Entry verification drift** — each skill's Step 0 checklist is a text description that agents must interpret and implement independently; implementations diverge from the spec over time
5. **Scale assessment ambiguity** — comet-verify's light/full decision rules are prose that agents interpret inconsistently

## Solution

Introduce `comet-state.sh` — a single script that serves as the **exclusive interface** for all `.comet.yaml` state interactions. Agents never directly `sed`, `echo >`, or `cat | grep` the YAML file.

## Script Design

### Location

`assets/skills/comet/scripts/comet-state.sh`

### Subcommands

#### `init <change-name> <workflow>`

Creates `.comet.yaml` with workflow-appropriate defaults.

**Workflow defaults:**

| Field | `full` | `hotfix` | `tweak` |
|-------|--------|----------|---------|
| `workflow` | full | hotfix | tweak |
| `phase` | design | build | build |
| `design_doc` | null | null | null |
| `plan` | null | null | null |
| `build_mode` | null | direct | direct |
| `isolation` | null | branch | branch |
| `verify_mode` | null | light | light |
| `verify_result` | pending | pending | pending |
| `verified_at` | null | null | null |
| `archived` | false | false | false |

**Behavior:**
- Validates change name (alphanumeric + hyphens + underscores, no path traversal)
- Fails if `.comet.yaml` already exists
- Outputs creation confirmation with field summary

#### `set <change-name> <field> <value>`

Updates a single field with built-in validation.

**Enum validation table:**

| Field | Allowed Values |
|-------|---------------|
| `workflow` | `full`, `hotfix`, `tweak` |
| `phase` | `design`, `build`, `verify`, `archive` |
| `build_mode` | `subagent-driven-development`, `executing-plans`, `direct` |
| `isolation` | `branch`, `worktree` |
| `verify_mode` | `light`, `full` |
| `verify_result` | `pending`, `pass`, `fail` |
| `archived` | `true`, `false` |

**Path fields** (`design_doc`, `plan`):
- Accept any non-empty string
- Optionally validate file existence (flag: `--check-exists`)

**Behavior:**
- Fails if `.comet.yaml` doesn't exist
- Fails if field name is unknown
- Fails if value violates enum constraint
- On success: writes value, outputs `[SET] field=value` confirmation

#### `get <change-name> <field>`

Reads a single field value to stdout.

**Behavior:**
- Outputs empty string for null/missing fields
- Fails (stderr + exit 1) if file doesn't exist
- No validation on read — raw value output

#### `check <change-name> <phase>`

Validates entry conditions for a phase. Replaces each skill's Step 0 text checklist.

**Phase-specific rules (extracted from current skill checklists):**

| Phase | Checks |
|-------|--------|
| `open` | `.comet.yaml` does NOT exist, change directory may or may not exist |
| `design` | `.comet.yaml` exists, `phase=design`, `workflow=full`, `design_doc` is null/empty, `proposal.md` exists and non-empty, `design.md` exists and non-empty |
| `build` | `.comet.yaml` exists, `phase=build`, `design_doc` is non-null and file exists, `proposal.md` exists and non-empty, `tasks.md` exists and non-empty |
| `verify` | `.comet.yaml` exists, `phase=verify`, `verify_result` is pending or null |
| `archive` | `.comet.yaml` exists, `phase=archive`, `verify_result=pass`, `archived` is not true |

**Output format:**
```
=== Entry Check: comet-<phase> ===
  [PASS] .comet.yaml exists
  [PASS] phase=build (expected: build)
  [FAIL] design_doc file does not exist: docs/superpowers/specs/xxx.md
  [PASS] proposal.md exists and non-empty

BLOCKED — fix failing checks before proceeding
```

Exit 0 = all pass, exit 1 = any fail.

#### `scale <change-name>`

Assesses change scale for verification mode. Replaces comet-verify's prose decision rules.

**Metrics read:**
- Task count from `tasks.md` (count `- [ ]` + `- [x]` lines)
- Delta spec count from `openspec/changes/<name>/specs/*/spec.md`
- Changed file count from git diff (if in git repo)

**Decision rules (same logic as current, just scripted):**

| Metric | Threshold | Result |
|--------|-----------|--------|
| Tasks | > 3 | `full` |
| Delta specs | > 1 capability | `full` |
| Changed files | > 5 | `full` |
| All below thresholds | — | `light` |

Any single metric hitting "large" → full. All "small" → light.

**Output:**
```
=== Scale Assessment: <name> ===
  Tasks: 5 (threshold: 3)
  Delta specs: 2 capabilities (threshold: 1)
  → Result: full
```

**Side effect:** Automatically sets `verify_mode` field in `.comet.yaml`.

## Skill Transformations

### comet-open

```bash
# Before: manual YAML creation (~15 lines of content)
# After:
bash $COMET_STATE init <name> full
```

### comet-design

```bash
# Before: sed -i 's|^design_doc:.*|design_doc: ...|' .comet.yaml
# After:
bash $COMET_STATE set <name> design_doc docs/superpowers/specs/YYYY-MM-DD-topic-design.md
```

### comet-build

```bash
# Record plan path
bash $COMET_STATE set <name> plan docs/superpowers/plans/YYYY-MM-DD-feature.md

# User selects isolation → record choice
bash $COMET_STATE set <name> isolation branch

# User selects build_mode → record choice
bash $COMET_STATE set <name> build_mode subagent-driven-development
```

Note: isolation and build_mode remain **user-selectable** choices. The script only handles recording the selection with validation.

### comet-verify

```bash
# Entry check
bash $COMET_STATE check <name> verify

# Scale assessment (auto-sets verify_mode)
bash $COMET_STATE scale <name>

# After verification passes
bash $COMET_STATE set <name> verify_result pass
```

### comet-archive

Internal `comet-archive.sh` refactored to use `comet-state.sh get/set` instead of direct `grep`/`sed` on YAML.

### comet-hotfix / comet-tweak

```bash
# Before: manual YAML creation with preset values
# After:
bash $COMET_STATE init <name> hotfix  # or tweak
```

### comet (main entry)

Self-healing logic uses `set` instead of raw `sed`:
```bash
bash $COMET_STATE set <name> phase <correct-phase>
```

## Architecture

Three-layer script hierarchy:

```
comet-state.sh          ← agent's exclusive state interface (CRUD + check + scale)
  ├── calls internally → comet-yaml-validate.sh  ← schema validation
  └── called by        → comet-guard.sh          ← phase transition (uses state.sh set internally)
                         comet-archive.sh         ← archive flow (uses state.sh get/set internally)
```

- **comet-state.sh** is the public API for agents
- **comet-guard.sh** and **comet-archive.sh** use state.sh internally for their own state operations
- **comet-yaml-validate.sh** remains the low-level schema checker, called by state.sh after writes

## Impact on SKILL.md Files

All 8 skill files updated:

1. **Step 0 (entry verification)** — text checklist replaced with single `bash $COMET_STATE check <name> <phase>` command
2. **State creation** — YAML template blocks replaced with `bash $COMET_STATE init <name> <workflow>`
3. **Field updates** — `sed -i` commands replaced with `bash $COMET_STATE set <name> <field> <value>`
4. **Field reads** — `grep`/`sed` parsing replaced with `bash $COMET_STATE get <name> <field>`
5. **Scale assessment** — prose rules replaced with `bash $COMET_STATE scale <name>`

Both English (`assets/skills/`) and Chinese (`assets/skills-zh/`) versions updated.

## Out of Scope

- Changing guard `--apply` behavior — it continues to handle phase transitions, now using state.sh internally
- Adding new phases or fields to `.comet.yaml`
- Changing the archive flow logic — only internal implementation uses state.sh
- Auto-selecting isolation/build_mode — these remain user choices
