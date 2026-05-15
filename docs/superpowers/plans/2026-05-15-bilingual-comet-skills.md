# Bilingual Comet Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add language selection to `comet init` so users receive English or Chinese Comet skill files based on their choice.

**Architecture:** Assets directory gains a `skills-zh/` mirror for Chinese SKILL.md files. Manifest gains a `languages` field. Init flow adds a language selection step and passes the chosen language's `skillsDir` to the copy function, which sources SKILL.md from the language-specific directory but always copies scripts from the default `skills/` directory.

**Tech Stack:** TypeScript, Node.js fs, @inquirer/prompts

---

### Task 1: Migrate Chinese SKILL.md files to skills-zh/

**Files:**
- Create: `assets/skills-zh/comet/SKILL.md`
- Create: `assets/skills-zh/comet-open/SKILL.md`
- Create: `assets/skills-zh/comet-design/SKILL.md`
- Create: `assets/skills-zh/comet-build/SKILL.md`
- Create: `assets/skills-zh/comet-verify/SKILL.md`
- Create: `assets/skills-zh/comet-archive/SKILL.md`
- Create: `assets/skills-zh/comet-hotfix/SKILL.md`
- Create: `assets/skills-zh/comet-tweak/SKILL.md`

- [ ] **Step 1: Copy all current Chinese SKILL.md to skills-zh/**

Run:
```bash
cd D:/Project/Comet
for skill in comet comet-open comet-design comet-build comet-verify comet-archive comet-hotfix comet-tweak; do
  mkdir -p assets/skills-zh/$skill
  cp assets/skills/$skill/SKILL.md assets/skills-zh/$skill/SKILL.md
done
```

- [ ] **Step 2: Verify all files copied**

Run: `ls assets/skills-zh/*/SKILL.md`
Expected: 8 files listed, one per skill

- [ ] **Step 3: Commit**

```bash
git add assets/skills-zh/
git commit -m "chore: copy Chinese SKILL.md files to skills-zh/ for bilingual support"
```

---

### Task 2: Update manifest.json with languages field

**Files:**
- Modify: `assets/manifest.json`
- Modify: `src/core/init.ts` (Manifest type)

- [ ] **Step 1: Update manifest.json**

Replace `assets/manifest.json` with:

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

- [ ] **Step 2: Update Manifest type in init.ts**

In `src/core/init.ts`, update the `Manifest` type at line 27:

```typescript
type LanguageConfig = {
  id: string;
  name: string;
  skillsDir: string;
};

type Manifest = {
  version: string;
  skills: string[];
  languages?: LanguageConfig[];
};
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Build completed successfully

- [ ] **Step 4: Commit**

```bash
git add assets/manifest.json src/core/init.ts
git commit -m "feat: add languages field to manifest and Manifest type"
```

---

### Task 3: Add selectLanguage() function

**Files:**
- Modify: `src/core/init.ts`

- [ ] **Step 1: Add selectLanguage function**

Add this function in `src/core/init.ts` after the `selectScope` function (after line 307 in current file):

```typescript
/**
 * Available languages for Comet skills.
 */
const LANGUAGES: LanguageConfig[] = [
  { id: 'en', name: 'English', skillsDir: 'skills' },
  { id: 'zh', name: '中文', skillsDir: 'skills-zh' },
];

/**
 * Interactive language selection for Comet skills.
 */
async function selectLanguage(options: InitOptions): Promise<LanguageConfig> {
  if (options.yes) {
    return LANGUAGES[0];
  }

  const langId = await select({
    message: 'Language for Comet skills:',
    choices: LANGUAGES.map((lang) => ({
      name: lang.name,
      value: lang.id,
    })),
  });

  return LANGUAGES.find((l) => l.id === langId) ?? LANGUAGES[0];
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build completed successfully

- [ ] **Step 3: Commit**

```bash
git add src/core/init.ts
git commit -m "feat: add selectLanguage() for Comet skills language selection"
```

---

### Task 4: Make copyCometSkillsForPlatform language-aware

**Files:**
- Modify: `src/core/init.ts`

- [ ] **Step 1: Update copyCometSkillsForPlatform signature and logic**

Replace the `copyCometSkillsForPlatform` function with:

```typescript
async function copyCometSkillsForPlatform(
  baseDir: string,
  platform: Platform,
  overwrite: boolean,
  languageSkillsDir: string = 'skills'
): Promise<{ copied: number; skipped: number }> {
  const assetsDir = getAssetsDir();
  const manifestPath = path.join(assetsDir, 'manifest.json');

  if (!(await fileExists(manifestPath))) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }

  const manifest = await readJson<Manifest>(manifestPath);
  let copied = 0;
  let skippedCount = 0;

  for (const skillRelPath of manifest.skills) {
    // Script files are language-agnostic, always from default skills/
    const isScript = skillRelPath.includes('scripts/');
    const sourceDir = isScript ? 'skills' : languageSkillsDir;

    const src = path.join(assetsDir, sourceDir, skillRelPath);
    const dest = path.join(baseDir, platform.skillsDir, 'skills', skillRelPath);

    if (!overwrite && (await fileExists(dest))) {
      skippedCount++;
      continue;
    }

    await copyFile(src, dest);
    copied++;
  }

  return { copied, skipped: skippedCount };
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build completed successfully

- [ ] **Step 3: Commit**

```bash
git add src/core/init.ts
git commit -m "feat: make copyCometSkillsForPlatform language-aware"
```

---

### Task 5: Wire language selection into initCommand

**Files:**
- Modify: `src/core/init.ts`

- [ ] **Step 1: Add language selection step after scope selection**

In `initCommand`, after the scope selection line (`const scope = await selectScope(options);`) and before the platform selection comment (`// Step 3: Platform selection`), insert:

```typescript
  // Step 2.5: Select language for Comet skills
  const language = await selectLanguage(options);
  console.log(`  Language: ${language.name}`);
```

- [ ] **Step 2: Pass language to copyCometSkillsForPlatform**

In the Step 7 loop where `copyCometSkillsForPlatform` is called, add the language parameter:

Change:
```typescript
      const { copied } = await copyCometSkillsForPlatform(baseDir, platform, cmAction === 'overwrite');
```

To:
```typescript
      const { copied } = await copyCometSkillsForPlatform(baseDir, platform, cmAction === 'overwrite', language.skillsDir);
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Build completed successfully

- [ ] **Step 4: Commit**

```bash
git add src/core/init.ts
git commit -m "feat: wire language selection into init command flow"
```

---

### Task 6: Translate comet/SKILL.md to English

**Files:**
- Modify: `assets/skills/comet/SKILL.md`

- [ ] **Step 1: Translate the main comet SKILL.md to English**

Read the current `assets/skills/comet/SKILL.md` (204 lines) and replace with English translation. The Chinese version is preserved in `assets/skills-zh/comet/SKILL.md`.

Key translation notes:
- Keep all structured sections (`<IMPORTANT>`, code blocks, phase flow)
- Keep frontmatter `name: comet` unchanged
- Translate `description` field to English
- Translate all Chinese prose to English
- Keep technical terms as-is (OpenSpec, Superpowers, brainstorming, etc.)

- [ ] **Step 2: Verify the file structure is valid**

Run: `head -5 assets/skills/comet/SKILL.md`
Expected: frontmatter with English description

- [ ] **Step 3: Commit**

```bash
git add assets/skills/comet/SKILL.md
git commit -m "feat: translate comet/SKILL.md to English"
```

---

### Task 7: Translate remaining 7 SKILL.md files to English

**Files:**
- Modify: `assets/skills/comet-open/SKILL.md`
- Modify: `assets/skills/comet-design/SKILL.md`
- Modify: `assets/skills/comet-build/SKILL.md`
- Modify: `assets/skills/comet-verify/SKILL.md`
- Modify: `assets/skills/comet-archive/SKILL.md`
- Modify: `assets/skills/comet-hotfix/SKILL.md`
- Modify: `assets/skills/comet-tweak/SKILL.md`

- [ ] **Step 1: Translate comet-open/SKILL.md to English**

Read current file, translate to English, replace. Chinese preserved in `assets/skills-zh/`.

- [ ] **Step 2: Translate comet-design/SKILL.md to English**

- [ ] **Step 3: Translate comet-build/SKILL.md to English**

- [ ] **Step 4: Translate comet-verify/SKILL.md to English**

- [ ] **Step 5: Translate comet-archive/SKILL.md to English**

- [ ] **Step 6: Translate comet-hotfix/SKILL.md to English**

- [ ] **Step 7: Translate comet-tweak/SKILL.md to English**

- [ ] **Step 8: Verify all files have English content**

Run: `head -3 assets/skills/*/SKILL.md`
Expected: all frontmatter descriptions in English

- [ ] **Step 9: Commit**

```bash
git add assets/skills/comet-open/SKILL.md assets/skills/comet-design/SKILL.md assets/skills/comet-build/SKILL.md assets/skills/comet-verify/SKILL.md assets/skills/comet-archive/SKILL.md assets/skills/comet-hotfix/SKILL.md assets/skills/comet-tweak/SKILL.md
git commit -m "feat: translate remaining 7 Comet SKILL.md files to English"
```

---

### Task 8: End-to-end verification

**Files:**
- No file changes

- [ ] **Step 1: Build the project**

Run: `npm run build`
Expected: Build completed successfully

- [ ] **Step 2: Test init with English (--yes)**

Run in a clean test directory:
```bash
mkdir -p D:/Project/comet-test-en && cd D:/Project/comet-test-en && node D:/Project/Comet/bin/comet.js init . --yes
```
Expected: English SKILL.md files deployed to `.claude/skills/comet/`

- [ ] **Step 3: Verify English content**

Run: `head -5 D:/Project/comet-test-en/.claude/skills/comet/SKILL.md`
Expected: English description in frontmatter

- [ ] **Step 4: Clean up test directory**

Run: `rm -rf D:/Project/comet-test-en`
