# Bilingual Comet Skills Design

## Problem

All 8 Comet SKILL.md files are currently written in Chinese only. Users who prefer English have no option. The init command should let users choose a language and receive the corresponding skill files.

## Scope

- Only Comet skill files (8 SKILL.md) are bilingual
- CLI prompts, logs, error messages remain in English
- Script files (comet-guard.sh, comet-yaml-validate.sh) are language-agnostic, always copied from `skills/`

## File Structure

```
assets/
├── manifest.json                ← add "languages" field
├── skills/                      ← English (default)
│   ├── comet/SKILL.md
│   ├── comet/scripts/comet-guard.sh
│   ├── comet/scripts/comet-yaml-validate.sh
│   ├── comet-open/SKILL.md
│   ├── comet-design/SKILL.md
│   ├── comet-build/SKILL.md
│   ├── comet-verify/SKILL.md
│   ├── comet-archive/SKILL.md
│   ├── comet-hotfix/SKILL.md
│   └── comet-tweak/SKILL.md
└── skills-zh/                   ← Chinese
    ├── comet/SKILL.md
    ├── comet-open/SKILL.md
    ├── comet-design/SKILL.md
    ├── comet-build/SKILL.md
    ├── comet-verify/SKILL.md
    ├── comet-archive/SKILL.md
    ├── comet-hotfix/SKILL.md
    └── comet-tweak/SKILL.md
```

## Manifest Changes

```json
{
  "version": "0.1.0",
  "skills": [
    "comet/SKILL.md",
    "comet/scripts/comet-guard.sh",
    "comet/scripts/comet-yaml-validate.sh",
    "comet-open/SKILL.md",
    "comet-design/SKILL.md",
    "comet-build/SKILL.md",
    "comet-verify/SKILL.md",
    "comet-archive/SKILL.md",
    "comet-hotfix/SKILL.md",
    "comet-tweak/SKILL.md"
  ],
  "languages": [
    { "id": "en", "name": "English", "skillsDir": "skills" },
    { "id": "zh", "name": "中文", "skillsDir": "skills-zh" }
  ]
}
```

- `skills` array: English skill list (default, backward-compatible)
- `languages`: each entry maps a language id to a skills directory under `assets/`
- Script files (paths containing `scripts/`) are always sourced from `skills/`, not from language-specific directories

## Init Flow Changes

### New Step: Language Selection

Inserted between scope selection (Step 2) and platform selection (Step 3).

```
? Language:
❯ English
  中文
```

- Default selection: English
- `--yes` mode: auto-selects English without prompting

### Updated Step Order

1. Detect platforms
2. Select scope (global/project)
3. **Select language (new)**
4. Select platforms
5. Detect existing installations
6. Install OpenSpec
7. Install Superpowers
8. Copy Comet skills (language-aware)
9. Create working directories
10. Summary

## Distribution Logic

`copyCometSkillsForPlatform(baseDir, platform, overwrite, languageSkillsDir)`:

1. Read manifest to get skills list
2. For each skill path in the list:
   - If path contains `scripts/`: copy from `assets/skills/` (language-agnostic)
   - Otherwise: copy from `assets/{languageSkillsDir}/` (language-specific)
3. Report copied/skipped counts

## Files to Modify

| File | Change |
|------|--------|
| `assets/manifest.json` | Add `languages` field |
| `src/core/init.ts` | Add `selectLanguage()`, pass language to copy function |
| `assets/skills/` | Translate existing Chinese SKILL.md to English (replace) |
| `assets/skills-zh/` | Create with current Chinese SKILL.md files |

## Migration

1. Copy all current SKILL.md files from `assets/skills/*/` to `assets/skills-zh/*/`
2. Translate each SKILL.md to English and replace the originals in `assets/skills/`
3. Script files stay in `assets/skills/` only

## Not in Scope

- CLI prompt localization
- Error message translation
- OpenSpec or Superpowers skill translation
- Build-time i18n generation
