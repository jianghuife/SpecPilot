---
name: specpilot-review
description: Review a change against project standards and its originating specification.
---

# Review a SpecPilot change

Read the approved spec, relevant standards, task evidence, and the current diff. Review on two
independent axes:

1. Standards: does the change follow the documented project standards?
2. Spec: does it implement the approved behavior without missing requirements or scope creep?

Use parallel internal reviewers when the host can schedule them; otherwise perform the same two
contracts sequentially. Graph output is advisory. Every blocking finding must cite source, test,
log, or missing acceptance evidence.

Write `review.md`:

```yaml
---
schema_version: 1
status: pass # pass, pass_with_warnings, or blocked
standards: pass
spec: pass
reviewed_at: 2026-01-01T00:00:00.000Z
---
```

Include separate Standards findings and Spec findings with file references. A warning does not
block finish; any `blocked` axis does.
