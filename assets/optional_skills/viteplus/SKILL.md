---
name: viteplus
description: Use when creating, migrating, reviewing, or maintaining Vite+ projects, vp workflows, vite-plus configuration, package manager commands, Node runtime management, Vite Task, monorepos, CI, checks, tests, builds, or existing Vite projects moving to Vite+.
---

# VitePlus

Use this skill for Vite+ workflow and configuration work. Treat the official Vite+ guide as the source of truth, then follow the consuming codebase's framework, package manager, CI, and repository conventions.

## Default Stance

- Vite+ ships in two parts: `vp` and `vite-plus`. `vp` is the global command-line tool; `vite-plus` is the local package installed in each project.
- Prefer Vite+ commands for frontend workflow operations once a project uses Vite+: `vp install`, `vp dev`, `vp check`, `vp test`, `vp build`, and `vp run`.
- Keep standard Vite configuration in `vite.config.ts`; add Vite+ blocks there for `create`, `run`, `fmt`, `lint`, `test`, `pack`, and `staged`.
- Do not invent separate config files when Vite+ provides a `vite.config.ts` block for the concern.
- Use package scripts through `vp run` when an existing script should run as-is.

## Project Creation And Migration

- Use `vp create` for new apps, libraries, monorepos, and generators.
- Use built-in templates such as `vite:monorepo`, `vite:application`, `vite:library`, and `vite:generator` when those fit the requested output.
- Pass template-specific flags after `--`, for example `vp create vite -- --template react-ts`.
- Use `--no-interactive` for automation and CI-friendly scaffolding.
- Use `vp migrate` for existing projects that should consolidate separate Vite, Vitest, Oxlint, Oxfmt, ESLint, or Prettier setup into Vite+ defaults.
- Preserve deliberate existing scripts and behavior during migration; replace commands only when Vite+ has an equivalent built-in or task-based path.

## Dependencies And Runtime

- Use `vp install`, `vp add`, `vp remove`, and `vp update` for dependency changes.
- Let Vite+ detect the package manager from project metadata and lockfiles. Do not switch package managers manually unless the user asks for that change.
- Use `vp pm <command>` only when raw package-manager-specific behavior is needed.
- Use `vp env pin` to pin project Node.js. Prefer `devEngines.runtime` for development runtime requirements when a package manifest exists.
- Use `vp env doctor`, `vp env current`, and `vp env which <tool>` when runtime or package-manager resolution is unclear.
- If managed runtime behavior is not desired, use `vp env off` rather than removing Vite+ files by hand.

## Development Commands

- Use `vp dev` for the Vite dev server. Standard Vite server, plugin, alias, and mode configuration still belongs in `vite.config.ts`.
- Use `vp check` as the default static verification command because it combines formatting, linting, and type checks.
- Enable `lint.options.typeAware` and `lint.options.typeCheck` when the project should make `vp check` the single static-check command.
- Use `vp test` for Vitest-based tests. Unlike standalone Vitest, `vp test` does not stay in watch mode by default; use `vp test watch` when watch mode is wanted.
- Put test configuration in the `test` block in `vite.config.ts`; do not add `vitest.config.ts` unless the local project already requires that split.
- Use `vp build` for Vite production builds, and `vp preview` to serve the production build locally.
- Use `vp run <script>` when a package.json script should run instead of a Vite+ built-in command such as `vp build`.

## Vite Task And Workspaces

- Use `vp run` for package scripts and tasks defined in `vite.config.ts`.
- Tasks defined in `vite.config.ts` are cached by default. `package.json` scripts are not cached unless run with `vp run --cache`.
- Define tasks in `vite.config.ts` when they need caching, dependencies, explicit environment inputs, or workspace orchestration.
- Use `dependsOn` for task ordering. In workspaces, target package tasks with `package#task`.
- Use `vp run -r <task>` for recursive workspace runs, `vp run -t <package#task>` for a package and its dependencies, and `vp run --filter <pattern> <task>` for pnpm-style selection.
- Use `--fail-if-no-match` when a missing filter match should fail automation instead of exiting successfully with a warning.
- Use `--parallel` only for independent tasks where dependency ordering is intentionally ignored.

```typescript
import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
  run: {
    tasks: {
      verify: {
        command: 'vp check && vp test && vp build',
        env: ['NODE_ENV'],
      },
    },
  },
});
```

## Monorepos

- Put shared Vite+ defaults in the root `vite.config.ts`.
- Use `lint.overrides` and `fmt.overrides` for package-specific lint and format behavior.
- Remember that override globs are resolved from the root config, so use workspace paths such as `apps/web/**` or `packages/ui/**`.
- Keep package-specific Vite, Vitest, framework, or runtime behavior in the package's own config when that package genuinely differs.
- Use `vp dev apps/web` or `vp build apps/web` when targeting a specific app with built-in Vite commands.

## CI And Maintenance

- Use `voidzero-dev/setup-vp` in GitHub Actions to install Vite+, set up Node.js and the package manager, and enable dependency caching.
- Typical CI order is `vp install`, `vp check`, `vp test`, then `vp build`.
- Use `vp upgrade` for the global `vp` binary and `vp update vite-plus` for the local project package.
- After upgrading `vite-plus`, verify aliased Vite+ packages and any Vitest pin if the project was migrated with `vp migrate`.
- Use `vp outdated` to confirm no Vite+ packages remain stale.

## Review Checklist

- Is the task creating a new project, migrating an existing one, or maintaining an already migrated project?
- Are commands routed through `vp` instead of mixing raw package manager, Vite, Vitest, and formatter commands unnecessarily?
- Is shared configuration centralized in `vite.config.ts`?
- Are existing scripts preserved and invoked with `vp run <script>` when they represent custom behavior?
- Are Node.js and package-manager versions resolved through `vp env` and Vite+ package-manager detection?
- Are `vp check`, `vp test`, and `vp build` used for verification unless local scripts intentionally replace them?
- In a monorepo, are workspace filters, recursive runs, task dependencies, and root overrides used deliberately?
- In CI, is `voidzero-dev/setup-vp` used instead of duplicating setup-node, package-manager install, and cache steps?

## Official References

- Getting Started: https://viteplus.dev/guide/
- Creating a Project: https://viteplus.dev/guide/create
- Migrate to Vite+: https://viteplus.dev/guide/migrate
- Installing Dependencies: https://viteplus.dev/guide/install
- Environment: https://viteplus.dev/guide/env
- Check: https://viteplus.dev/guide/check
- Test: https://viteplus.dev/guide/test
- Build: https://viteplus.dev/guide/build
- Run: https://viteplus.dev/guide/run
- Configuration: https://viteplus.dev/config/
- Monorepo Guide: https://viteplus.dev/guide/monorepo
- CI: https://viteplus.dev/guide/ci
- Upgrading Vite+: https://viteplus.dev/guide/upgrade
