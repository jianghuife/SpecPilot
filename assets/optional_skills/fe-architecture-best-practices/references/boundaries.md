# Frontend Boundaries

Boundaries must be explicit. Frontend code becomes hard for AI to change when UI, state, API calls, validation, analytics, storage, and business rules are all mixed in the same component.

## Boundary Styles

- Ports and Adapters: keep browser APIs, API clients, storage, analytics, feature flags, and third-party SDKs behind adapters.
- Layered Architecture: separate UI, application orchestration, domain logic, and infrastructure adapters.
- Feature Slice: group UI, hooks, state, selectors, tests, and adapters by user-facing capability.
- Simplified Clean Architecture: use dependency direction as the rule, not ceremony.

Prefer clear layers such as `ui / features / domain / application / adapters` when the codebase is large enough to benefit from them.

## Clean Architecture For Frontend

- Dependency direction is the rule: outer frontend details may depend on inner rules, but inner rules must not depend on outer details.
- Inner frontend layers do not import outer details. Domain and application logic should not import UI components, routing objects, concrete HTTP clients, browser storage, analytics SDKs, or framework-specific state stores.
- Domain stays pure. Keep validation, calculations, state transitions, permissions visible to the client, and view-independent business rules in plain TypeScript where possible.
- Application/use-case code orchestrates. It turns UI commands into domain operations, calls ports, maps results, and returns typed outcomes the UI can render.
- Ports describe what the frontend needs, such as `loadUser`, `saveDraft`, `trackEvent`, `readSession`, or `navigateTo`.
- Adapters implement those ports with fetch clients, generated SDKs, router APIs, storage APIs, analytics, feature flags, or state library integration.
- React, router, fetch, storage, analytics, and state libraries stay outside domain code. Bring them in at the UI, hook, adapter, or composition boundary.

## Practical Rules

- UI components render state and emit events; they should not know transport, persistence, or analytics details.
- Feature modules own user workflows and compose hooks, reducers, services, and components.
- Domain modules hold pure frontend business rules, validation helpers, state transitions, and calculation logic.
- Application modules orchestrate use cases such as submit, save draft, apply filters, or complete onboarding.
- Adapters isolate external dependencies such as HTTP clients, generated API clients, browser storage, URL state, analytics, and feature flags.

## Feature Public API

Each feature should expose a small public surface:

- Components intended for other features.
- Hooks intended for other features.
- Types and DTOs that are stable enough to share.
- Commands or application functions that represent supported workflows.

Avoid cross-feature deep imports into `internal`, `domain`, `adapters`, or private component files. If another feature needs something, promote it to the feature public API or move it into a shared module with clear ownership.
