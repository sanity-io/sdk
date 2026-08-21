# Sanity App SDK

This is the `@sanity/sdk` monorepo, the SDK for building Sanity-powered apps.

- `packages/core` publishes as `@sanity/sdk-core`. Framework-agnostic TypeScript core, no React.
- `packages/react` publishes as `@sanity/sdk-react`. React hooks and components on top of core.
- `packages/@repo/*` are workspace-internal shared configs (ESLint, TypeScript, test config).
- `packages/e2e` is the end-to-end test package.
- `apps/kitchensink-react` is an internal testing and examples app. It is not published.
- `apps/standalone-react` is a smaller standalone example app.

Per-path conventions live in `.claude/rules/` and load automatically when Claude reads files matching their `paths:` frontmatter. Read the file under `.claude/rules/` that matches the package you are editing before making changes there.

## Workspace commands

This repo uses pnpm with Turbo. Common commands run from the root:

- `pnpm install` installs dependencies.
- `pnpm test` runs Vitest across the workspace.
- `pnpm ts:check` runs the TypeScript type check.
- `pnpm lint` runs ESLint with `--fix`.
- `pnpm dev` runs the kitchensink dev server.
- `pnpm build` builds packages and apps.
- `pnpm fallow audit` checks changed files for dead code, complexity, and duplication.

Use `pnpm --filter @sanity/sdk-core ...` (or `--filter @sanity/sdk-react`) to scope a command to a single package.

## Before you report work as complete

Passing `pnpm test`, `pnpm ts:check`, and `pnpm lint` is not enough. Pull requests also run a Fallow audit that fails on dead code, complexity, and duplication your change introduced. None of the other checks catch those, so a change can look finished locally and still fail CI.

Run the audit as the last step of any task that adds or edits source files:

```bash
pnpm fallow audit
```

It reads the working tree, so there is no need to commit first, and it finishes in about a second. Exit code 1 means CI will fail. See `.claude/rules/fallow.md` for how to read the output and fix each kind of finding.

## Coding standards

You are working in a TypeScript codebase with React 19, Vitest, and Sanity.io as the primary technologies.

- Formatting is controlled by oxfmt via `.oxfmtrc.json`: no semicolons, single quotes, no bracket spacing (`{foo}` not `{ foo }`), 100-character print width, 2-space indentation.
- Never use `any`. ESLint enforces this and the build will fail.
- Tests use Vitest and live next to the source file they cover, not in a separate `tests/` tree.
- All exported members need TSDoc comments. ESLint's TSDoc plugin enforces this.
- Do not edit files under `dist/` or `node_modules/`.
- Do not introduce React-specific dependencies into `packages/core`. Keep it framework-agnostic.
