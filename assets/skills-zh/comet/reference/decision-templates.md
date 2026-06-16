# Comet 用户决策点模板

本文件提供常见阻塞点的标准提问结构。执行时仍必须遵守 `comet/reference/decision-point.md`：暂停、等待用户明确选择、再写入状态或继续动作。

## 通用格式

```text
决策点：<名称>
当前状态：<phase / change / 已完成产物>
推荐：<推荐选项及理由>

选项：
A. <选项名称> — <执行动作和状态写入>
B. <选项名称> — <执行动作和状态写入>
C. <选项名称> — <执行动作和状态写入>

请选择一个选项。
```

## 设计方案确认

- 问题：是否确认采用当前技术方案？
- 选项：
  - A. 确认方案 — 创建 Design Doc，必要时回写 delta spec
  - B. 调整方案 — 继续 brainstorming

## Plan-Ready 暂停

- 问题：计划已生成并通过 plan lint，是否继续执行？
- 选项：
  - A. 继续执行 — 清空 `build_pause`，进入工作方式选择
  - B. 暂停切换模型 — 写入 `build_pause: plan-ready`，停止当前调用

## Build 工作方式

- 问题：选择隔离方式、执行方式和 TDD 模式。
- 选项必须覆盖：
  - branch 或 worktree
  - `subagent-driven-development` 或 `executing-plans`
  - `tdd` 或 `direct`
- 写入字段：`isolation`、`build_mode`、`subagent_dispatch`、`tdd_mode`

## Verify 失败处理

- 问题：验证未通过，选择修复还是接受偏差。
- 选项：
  - A. 修复全部 — 运行 `comet-state transition <change> verify-fail` 后回到 `/comet-build`
  - B. 接受偏差 — 在验证报告和设计文档中记录原因与影响

## 分支处理

- 问题：验证通过后如何处理开发分支？
- 选项：
  - A. 本地合并
  - B. 推送并创建 PR
  - C. 保留分支
  - D. 丢弃工作（必须二次确认）
- 完成后写入 `branch_status: handled`

## 归档确认

- 问题：是否执行不可逆归档？
- 选项：
  - A. 确认归档 — 运行 `comet-archive.sh`
  - B. 需要调整或重新验证 — 运行 `archive-reopen` 回到 verify
  - C. 暂不归档 — 保持 `phase: archive`

## Preset 升级

- 问题：hotfix/tweak 已触发升级条件，是否升级为完整流程？
- 选项：
  - A. 升级为 full — 写入对应状态并进入 `/comet-design`
  - B. 拆分新 change — 通过 `/comet-open` 创建独立 change
  - C. 继续当前 preset — 记录用户接受的范围风险

## Build 范围扩张

- 问题：新增任务超过原计划 50% 或出现中/大规模 spec 变更，是否拆分？
- 选项：
  - A. 拆分为新 change — 通过 `/comet-open` 创建独立 change
  - B. 继续当前 change — 记录范围扩张决策，更新 tasks 和 delta spec

## PRD 拆分

- 问题：大型 PRD 是否拆成多个 changes？
- 选项：
  - A. 创建多个 OpenSpec changes
  - B. 保持为一个 change
  - C. 调整拆分方案后继续
