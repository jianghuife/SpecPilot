# Comet User Decision Point Templates

This file provides standard question structures for common blocking points. Execution must still follow `comet/reference/decision-point.md`: pause, wait for an explicit user choice, then write state or continue.

## General Format

```text
Decision point: <name>
Current state: <phase / change / completed artifacts>
Recommendation: <recommended option and reason>

Options:
A. <option name> — <action and state writes>
B. <option name> — <action and state writes>
C. <option name> — <action and state writes>

Please choose one option.
```

## Design Proposal Confirmation

- Question: confirm the current technical approach?
- Options:
  - A. Confirm approach — create Design Doc and write back delta spec if needed
  - B. Adjust approach — continue brainstorming

## Plan-Ready Pause

- Question: the plan is generated and passed plan lint; continue execution?
- Options:
  - A. Continue execution — clear `build_pause`, enter workflow configuration selection
  - B. Pause to switch model — write `build_pause: plan-ready`, stop this invocation

## Build Workflow Configuration

- Question: choose isolation method, execution method, and TDD mode.
- Options must cover:
  - branch or worktree
  - `subagent-driven-development` or `executing-plans`
  - `tdd` or `direct`
- State writes: `isolation`, `build_mode`, `subagent_dispatch`, `tdd_mode`

## Verify Failure Handling

- Question: verification failed; fix or accept deviation?
- Options:
  - A. Fix all — run `comet-state transition <change> verify-fail`, then return to `/comet-build`
  - B. Accept deviation — record reason and impact in verification report and design doc

## Branch Handling

- Question: after verification passes, how should the development branch be handled?
- Options:
  - A. Merge locally
  - B. Push and create PR
  - C. Keep branch
  - D. Discard work (requires secondary confirmation)
- After completion, write `branch_status: handled`

## Archive Confirmation

- Question: execute irreversible archive?
- Options:
  - A. Confirm archive — run `comet-archive.sh`
  - B. Needs adjustment or re-verification — run `archive-reopen` back to verify
  - C. Do not archive yet — keep `phase: archive`

## Preset Upgrade

- Question: hotfix/tweak triggered upgrade conditions; upgrade to full workflow?
- Options:
  - A. Upgrade to full — write corresponding state and enter `/comet-design`
  - B. Split new change — create independent change through `/comet-open`
  - C. Continue current preset — record user-accepted scope risk

## Build Scope Expansion

- Question: new tasks exceed 50% of the original plan or medium/large spec changes appeared; split?
- Options:
  - A. Split into new change — create independent change through `/comet-open`
  - B. Continue in current change — record scope expansion decision, update tasks and delta spec

## PRD Split

- Question: split this large PRD into multiple changes?
- Options:
  - A. Create multiple OpenSpec changes
  - B. Keep everything as one change
  - C. Adjust the split plan before continuing
