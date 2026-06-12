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

Use `pnpm --filter @sanity/sdk-core ...` (or `--filter @sanity/sdk-react`) to scope a command to a single package.

## Coding standards

You are working in a TypeScript codebase with React 19, Vitest, and Sanity.io as the primary technologies.

- Formatting is controlled by Prettier with `@sanity/prettier-config`: no semicolons, single quotes, no bracket spacing (`{foo}` not `{ foo }`), 100-character print width, 2-space indentation.
- Never use `any`. ESLint enforces this and the build will fail.
- Tests use Vitest and live next to the source file they cover, not in a separate `tests/` tree.
- All exported members need TSDoc comments. ESLint's TSDoc plugin enforces this.
- Do not edit files under `dist/` or `node_modules/`.
- Do not introduce React-specific dependencies into `packages/core`. Keep it framework-agnostic.
