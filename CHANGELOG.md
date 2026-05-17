# Changelog

All notable changes to @rpamis/comet will be documented in this file.

## What's Changed [0.1.8] - 2026-05-17

### Added

- **`comet-state.sh` script**: Unified state management with 5 subcommands — `init` (create .comet.yaml), `set` (update with enum validation), `get` (read field), `check` (entry verification), `scale` (verification mode assessment)
- **`check` subcommand**: Scripted entry verification replacing text checklists in all 8 skills
- **`scale` subcommand**: Scripted scale assessment replacing prose decision rules in comet-verify

### Changed

- **All `.comet.yaml` writes go through `comet-state.sh`**: No more raw `sed -i` — enum validation on every field write
- **All skill Step 0 checklists replaced with `check` subcommand**: Single command replaces text-based entry verification
- **`comet-guard.sh` and `comet-archive.sh` use state.sh internally**: All state mutations through unified interface
- **Removed write-verification blocks**: hotfix and tweak presets no longer have manual verification loops

## What's Changed [0.1.7] - 2026-05-16

### Added

- **`comet-archive.sh` script**: One-command archive automation — validates entry state, syncs delta specs to main specs (overwrite), annotates design doc and plan frontmatter, moves change to archive directory, updates `archived: true`. Supports `--dry-run` for preview
- **`--apply` mode for `comet-guard.sh`**: Opt-in flag that auto-updates `.comet.yaml` state fields after all guard checks pass. No manual state editing required during phase transitions
- **Idempotent frontmatter annotation**: `annotate_frontmatter()` skips existing `archived-with:` lines, safe to re-run

### Changed

- **Removed manual state editing**: All phase transitions (design → build → verify → archive) now use `guard --apply` instead of manual `.comet.yaml` field updates and write-verification loops
- **Removed write-verification blocks**: Eliminated all `【写入验证】` / `【Write verification】` patterns from comet-open, comet-design, comet-build, comet-verify, and comet-archive skills
- **Removed `## ADDED`/`## MODIFIED`/`## REMOVED` delta format**: Delta specs are now complete specs; archive overwrites main spec instead of merging fragments
- **Removed step 2b from comet-open**: Incremental modification of existing capabilities is just a new `/comet-open` — brainstorming reads existing specs as context naturally
- **Simplified archive skill**: Steps 1b–5 replaced with single `comet-archive.sh` call
- **Updated `comet/SKILL.md`**: Script location section now documents both `--apply` mode and archive script

### Removed

- Few-shot YAML examples for `isolation`, `build_mode`, `verify_mode` fields (redundant with agent judgment)
- `openspec-archive-change` skill dependency from comet-archive (archive script handles all steps)

## What's Changed [0.1.6] - 2026-05-16

### Added

- **Workspace Isolation Selection**: `comet-build` now prompts users to choose between creating a branch or a worktree before execution begins (Step 3: Workspace Isolation)
- **`isolation` field in `.comet.yaml`**: New required field (`branch` or `worktree`) to record the user's workspace isolation choice
- **`isolation` enum validation**: `comet-yaml-validate.sh` now validates `isolation` as a required field with allowed values `branch`/`worktree`

### Changed

- `comet-build` step numbering: Step 3 (Select Execution Method) → Step 4, Step 4 (Spec Incremental Updates) → Step 5
- Hotfix and tweak presets default to `isolation: branch` without prompting
- `comet-yaml-validate.sh` `REQUIRED_FIELDS` and `KNOWN_KEYS` updated to include `isolation`

## What's Changed [0.1.5] - 2026-05-15

### Added

- **Bilingual Comet skills**: `comet init` now prompts for language selection (English / 中文) and deploys the corresponding SKILL.md files
- **Language-aware asset structure**: English skills in `assets/skills/`, Chinese skills in `assets/skills-zh/`
- **`languages` field in manifest.json**: Maps language IDs to asset directories for future extensibility

### Changed

- All 8 Comet SKILL.md files in `assets/skills/` are now English (Chinese originals preserved in `assets/skills-zh/`)
- `copyCometSkillsForPlatform` accepts `languageSkillsDir` parameter; script files always sourced from default `skills/` directory
- `--yes` mode defaults to English language selection

## What's Changed [0.1.4] - 2026-05-15

### Fixed

- **Superpowers redundant project-level install**: `comet init` now checks the global directories (`~/{platform}/skills/`) of all user-selected platforms before installing Superpowers. If Superpowers is already installed globally for any selected platform, the project-level install is skipped
- **Unwanted `.agents/` directory creation**: `comet init` now passes `--agent` flag to `skills add`, targeting only the platforms the user selected. This prevents the skills CLI from auto-detecting and installing to all platforms, which previously created an unnecessary `.agents/` directory
- **OpenSpec global detection**: Same global-directory fallback logic applied to OpenSpec detection, avoiding redundant OpenSpec installs when already present globally for selected platforms

### Changed

- `hasSkills()` accepts `selectedPlatforms` parameter to scope global detection to user-chosen platforms only
- `installSuperpowersForPlatform()` replaced with `installSuperpowersForPlatforms()` that accepts platform IDs and maps them to skills CLI agent names via `SKILLS_AGENT_MAP`

## What's Changed [0.1.3] - 2026-05-15

### Added

- **State File Separation**: Comet workflow state now stored in independent `.comet.yaml` file instead of `.openspec.yaml` subtree
- **Three-Layer Reliability Defense**:
  - Entry verification for all phases with `[HARD STOP]` diagnostics
  - Write-then-verify pattern for all state mutations
  - Schema validator script (`comet-yaml-validate.sh`) with field, enum, and path validation
- **Path Traversal Protection**: Input validation for change names to prevent directory traversal attacks
- **Guard Script Integration**: Automatic schema validation during phase transitions

### Changed

- Updated all 9 Comet skills to use `.comet.yaml` instead of `.openspec.yaml` comet: subtree
- Improved error messages with specific field values instead of generic placeholders
- Enhanced project structure documentation

### Security

- Fixed path traversal vulnerability through unvalidated change name inputs
- Schema validation now catches typos and invalid enum values at entry point
