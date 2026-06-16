---
title: Use Activity Component for Show/Hide
impact: MEDIUM
impactDescription: preserves state/DOM
tags: rendering, activity, visibility, state-preservation
---

## Use Activity Component for Show/Hide

Use React's `<Activity>` to preserve state/DOM for expensive components that frequently toggle visibility.

**Usage:**

```tsx
import { Activity } from "react";

function Dropdown({ isOpen }: Props) {
  return (
    <Activity mode={isOpen ? "visible" : "hidden"}>
      <ExpensiveMenu />
    </Activity>
  );
}
```

This avoids remounting and state loss; hidden Activity subtrees still receive lower-priority updates when their props change, so do not rely on Activity to
freeze rendering work completely. Effects inside a hidden Activity are cleaned up
and recreated when it becomes visible again, so avoid it for UI that must keep an
active subscription while hidden.
