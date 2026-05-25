---
name: comet-tweak
description: "Comet preset path: Non-bug small changes (tweak). Skip brainstorming and full plan, directly open → lightweight build → light verify → archive. Applicable for copy, configuration, documentation or prompt local optimization."
---

# Comet Preset Path: Tweak

Tweak is a preset workflow of Comet's five-phase capabilities, not a separate parallel process. It reuses open, build, verify, archive capabilities, only skipping brainstorming and full plan.

Applicable for small-scale non-bug changes, such as copy adjustments, configuration adjustments, documentation or prompt local optimization.

**Applicable conditions** (all must be met):
1. No new capability
2. No architecture changes
3. No interface changes involved
4. Usually not exceeding 3 tasks, 4 files

**Not applicable**: If change process discovers need for capability, architecture, or interface adjustments, should upgrade to full `/comet` workflow.

---

## Process (preset workflow, 4 phases)

Execution chain: open → lightweight build → light verify → archive. Tweak provides default decisions for each phase: streamlined open, lightweight build, lightweight verification, archive after verification passes.

Locate Comet scripts before starting:

```bash
COMET_SEARCH_ROOTS=("." "$HOME/.claude/skills" "$HOME/.codex/skills" "$HOME/.cursor/skills")
COMET_STATE="${COMET_STATE:-$(find "${COMET_SEARCH_ROOTS[@]}" -path '*/comet/scripts/comet-state.sh' -type f -print -quit 2>/dev/null)}"
COMET_GUARD="${COMET_GUARD:-$(find "${COMET_SEARCH_ROOTS[@]}" -path '*/comet/scripts/comet-guard.sh' -type f -print -quit 2>/dev/null)}"
COMET_ARCHIVE="${COMET_ARCHIVE:-$(find "${COMET_SEARCH_ROOTS[@]}" -path '*/comet/scripts/comet-archive.sh' -type f -print -quit 2>/dev/null)}"
```

### 1. Quick Open (preset open)

Reuse Comet open capability to create change, but use tweak defaults: do not execute `openspec-explore` long exploration, directly enter streamlined change creation.

**Immediately execute:** Use the Skill tool to load the `openspec-new-change` skill. Skipping this step is prohibited.

After the skill loads, follow its guidance to create streamlined artifacts:
  - `proposal.md` — change motivation + goals + scope
  - `design.md` — brief implementation description (no solution comparison needed)
  - `tasks.md` — not exceeding 3 tasks
- **No delta spec needed** (unless change changes existing spec acceptance scenarios; once delta spec needed, upgrade to full `/comet`)

Initialize Comet state file:

```bash
bash "$COMET_STATE" init <name> tweak
```

Verify initialized state:

```bash
bash "$COMET_STATE" check <name> open
```

Run phase guard to transition open → build:

```bash
bash "$COMET_GUARD" <change-name> open --apply
```

### 2. Lightweight Build (preset build)

Use tweak defaults: `build_mode: direct`. Skip `superpowers:brainstorming` and `superpowers:writing-plans`.

Before continuing or starting changes, handle uncommitted changes through `comet/reference/dirty-worktree.md`. If attribution shows the scope exceeds tweak, handle it through this file's "Upgrade Conditions".

**Immediately execute:** Execute tasks one by one according to tasks.md:

1. Read `openspec/changes/<name>/tasks.md`, get incomplete task list
2. For each incomplete task:
   - Modify target file according to task description
   - Run project formatter (e.g., `mvn spotless:apply`, `npm run format`)
   - Run related tests to confirm pass
   - Check corresponding `- [ ]` to `- [x]` in tasks.md
   - Commit code, commit message format: `tweak: <brief change description>`
3. After all tasks complete, explicitly run relevant project tests and build commands
4. Run phase guard to transition build → verify:

```bash
bash "$COMET_GUARD" <change-name> build --apply
```

State automatically updates to `phase: verify`, `verify_result: pending`, then enter verification.

### 3. Lightweight Verification (preset verify)

Reuse `/comet-verify`. Tweak must maintain lightweight verification conditions: ≤ 3 tasks, ≤ 4 files, no delta spec, no new capability.

**Immediately execute:** Use the Skill tool to load the `comet-verify` skill. Skipping this step is prohibited.

If scale assessment enters full verification path, stop tweak, upgrade to full `/comet`.

After verification passes, record `.comet.yaml` `verify_result` as `pass` according to `/comet-verify` rules, must not skip this status before archiving.

### 4. Archive (preset archive)

Reuse `/comet-archive`. Must satisfy `verify_result: pass` in `.comet.yaml` before archiving.

**Immediately execute:** Use the Skill tool to load the `comet-archive` skill to archive. Skipping this step is prohibited.

---

## Continuous Execution Mode

<IMPORTANT>
Tweak workflow is **one-time continuous execution**. After invoking `/comet-tweak`, agent must automatically complete all 4 phases, without pausing to wait for user input mid-way (unless encountering upgrade conditions requiring user confirmation).

Execution order: quick open → lightweight build → lightweight verification → archive → complete

After each phase completes, immediately enter next phase, no need for user input again. Within each phase, must still call corresponding Comet/OpenSpec/Superpowers skill according to above requirements.
</IMPORTANT>

---

## Upgrade Conditions

Upgrade to full `/comet` when **any** of the following conditions are met:

| Condition | Explanation |
|-----------|-------------|
| Change involves **5+ files** | Exceeds small change scope |
| Cross-module coordination required | Needs coordination across components |
| **5+** new test cases needed | Change complexity increasing |
| Config item additions or deletions | Non-value config changes |
| New capability needed | Exceeds local optimization |
| Delta spec needed | Affects existing specifications |

Upgrade method: On current change basis, supplement Design Doc (execute `/comet-design`), then proceed normally with full workflow.

---

## Exit Conditions

- Small change completed, tests pass
- Change archived
- No new capability, architecture adjustments, or interface changes
- **Phase guard**: Before build → verify run `bash "$COMET_GUARD" <change-name> build --apply`; before verify → archive follow `/comet-verify` and run `bash "$COMET_GUARD" <change-name> verify --apply`
