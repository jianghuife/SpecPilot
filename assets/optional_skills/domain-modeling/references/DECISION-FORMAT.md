# Project decision format

Store decisions under `specs/project/decisions/`. Follow an established repository naming
convention; otherwise use a descriptive kebab-case filename such as
`orders-own-cancellation.md`.

Offer a decision record only when all three conditions hold:

1. Reversing the choice later would be meaningfully expensive.
2. A future reader would find the choice surprising without its context.
3. Real alternatives existed and the choice reflects a trade-off.

Use the smallest useful form:

```md
# Orders own cancellation

## Context

What forced the decision, supported by current evidence.

## Decision

What the project chose.

## Trade-offs

What this gains, gives up, and deliberately rules out.

## Evidence

- `path/to/product-artifact.md`
- `path/to/source-or-test.ts`
```

Omit sections that add no information, but retain enough context and trade-offs to prevent the
same decision from being relitigated. Never reconstruct historical reasons from code alone. If
the reason is unknown, say so or keep the record proposed until a maintainer confirms it.
