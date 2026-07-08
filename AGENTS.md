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

- Formatting is controlled by oxfmt via `.oxfmtrc.json`: no semicolons, single quotes, no bracket spacing (`{foo}` not `{ foo }`), 100-character print width, 2-space indentation.
- Never use `any`. ESLint enforces this and the build will fail.
- Tests use Vitest and live next to the source file they cover, not in a separate `tests/` tree.
- All exported members need TSDoc comments. ESLint's TSDoc plugin enforces this.
- Do not edit files under `dist/` or `node_modules/`.
- Do not introduce React-specific dependencies into `packages/core`. Keep it framework-agnostic.

## Cursor Cloud specific instructions

- Runtime: the VM ships Node 22.14.0 (`/exec-daemon/node`) and pnpm 10.33.4 by default in the agent's normal shell. `.nvmrc` pins 24.17.0, but Node 22 is fully supported (the CI test matrix runs both 22 and 24), so the default Node is fine for install/lint/test/build/dev.
- `pnpm install` runs a kitchensink `postinstall` that calls `sanity schema extract` + typegen; it needs network access to Sanity but requires no secrets and completes in the standard install.
- No env vars/secrets are needed to install, lint, test, build, or start either dev app. Sanity project IDs are hardcoded and point at public dev projects. `.env.local` (copy from `.env.example`) is only needed for the Playwright e2e suite (`pnpm test:e2e`), which targets Sanity staging.
- Dev servers (see root `package.json` scripts): `pnpm dev` → kitchensink via `sanity dev` on port 3333 (meant to be opened embedded in the Sanity Dashboard for auth); `pnpm dev:standalone` → Vite on port 3334 (uses the `www.sanity.io/login` redirect flow). Both start and serve without login; showing authenticated content requires an interactive Sanity login in the browser.
- tmux gotcha: a tmux `bash -l` login shell does NOT inherit Node/pnpm on PATH (you'll get `pnpm: command not found`). The agent's default Shell tool environment does. When starting long-running dev servers in tmux, first `export PATH="/exec-daemon:/home/ubuntu/.nvm/versions/node/v22.22.2/bin:$PATH"` (or run them from the normal Shell environment).
