# Project glossary format

Use `specs/project/glossary.md` as the single canonical glossary.

```md
# Project Glossary

## Ordering

**Order**

A customer's confirmed request for specified goods.

_Avoid_: Purchase, transaction

**Cancellation**

The transition that ends an Order before fulfillment completes.

_Avoid_: Deletion, removal
```

## Rules

- Choose one canonical term and list misleading synonyms under `_Avoid_`.
- Define what the concept is in one or two sentences.
- Include only project-specific domain concepts, not general programming terminology.
- Exclude implementation details, requirements, task notes, and speculative concepts.
- Group terms under domain headings when the repository contains multiple contexts; do not create
  separate glossary systems.
- In the proposed diff, cite the product artifact, source, test, or user clarification supporting
  each addition or correction. Keep those working citations out of the glossary unless the
  repository already records them there.
