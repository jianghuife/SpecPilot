# Changelog

All notable changes to @rpamis/comet will be documented in this file.

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
