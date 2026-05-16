---
name: comet-archive
description: "Comet 阶段 5：归档。用 /comet-archive 调用。同步 delta spec 到主 spec，归档 change。"
---

# Comet 阶段 5：归档（Archive）

## 前置条件

- 验证已通过（阶段 4 完成）
- 分支已处理
- `openspec/changes/<name>/.comet.yaml` 中 `verify_result: pass`

## 步骤

### 0. 入口状态验证（Entry Check）

在执行任何操作之前，读取并验证当前状态：

**检查清单：**
1. `openspec/changes/<name>/.comet.yaml` 存在
2. `phase` 字段的值为 `"archive"`
3. `verify_result` 字段的值为 `"pass"`
4. `archived` 字段为 `"false"` 或 null（尚未归档）

**验证方式：**
- `cat openspec/changes/<name>/.comet.yaml` 读取全部字段
- 如 `verify_result` 不是 `"pass"`，必须先完成验证

**失败输出：**
```
[HARD STOP] Entry check failed for comet-archive
  Expected: phase=archive, verify_result=pass, archived=false|null
  Actual:   phase=<实际值>, verify_result=<实际值>, archived=<实际值>
  Suggestion: Run comet-verify first, or this change was already archived.
```

验证通过后才进入步骤 1。

### 1. 执行归档

运行归档脚本，自动完成以下全部步骤：

```bash
COMET_ARCHIVE=$(find . -path '*/comet/scripts/comet-archive.sh' -type f -print -quit)
bash "$COMET_ARCHIVE" "<change-name>"
```

脚本自动执行：
1. 入口状态验证（phase=archive, verify_result=pass, archived=false）
2. Delta spec 同步到主 spec
3. Design doc 前置元数据标注（archived-with, status）
4. Plan 前置元数据标注（archived-with）
5. 移动 change 到归档目录
6. 更新 archived: true

如脚本返回非零退出码，报告错误并停止。
如脚本返回零退出码，归档完成。

如需预览而不实际执行，使用 `--dry-run` 参数。

### 2. 生命周期闭环

Spec 生命周期在此完成：
```
brainstorming → delta spec → 实施 → 验证 → 主 spec 覆盖 → design doc 标注 → 归档
```

## 退出条件

- 归档脚本执行成功（退出码 0）
- **阶段守卫**：运行 `bash $COMET_GUARD <change-name> archive`，全部 PASS 后确认归档完整

## 完成

Comet 流程全部完成。如需开始新工作，调用 `/comet` 或 `/comet-open`。
