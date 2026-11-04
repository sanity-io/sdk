# Bugbot

Review rules for `@sanity/sdk`, a pnpm + Turbo monorepo publishing two packages:

- `packages/core` publishes as `@sanity/sdk`. Framework-agnostic TypeScript, no React.
- `packages/react` publishes as `@sanity/sdk-react`. React hooks and components on top of core.

Both are published under semver, so public API surface and release plumbing matter as much as the code itself.

## Do not report

`pnpm lint` (oxlint), `pnpm ts:check` and `pnpm fallow audit` already run on every PR and fail CI. Do not raise:

- `any` usage, missing TSDoc on exported members, unused imports, import ordering
- Formatting: semicolons, quote style, bracket spacing, print width, indentation (oxfmt owns these via `.oxfmtrc.json`)
- Type errors
- Dead code, duplication, or complexity that the Fallow audit reports

Do not post compliments, summaries of what the code does, or a comment saying nothing is wrong.

## Report

### 1. Missing Renovate changeset coverage for catalog runtime deps

A new runtime dependency of `packages/core` or `packages/react` must be matched by a changeset-writing rule in `.github/renovate.json`, or Renovate bumps it with no changeset and the fix silently misses its patch release. **There is no CI guard for this.**

Two rules write changesets:

- The rule matching `packages/core/package.json` and `packages/react/package.json` with `matchDepTypes: ["dependencies"]` covers **inline** runtime deps automatically. Nothing to do.
- A **catalog** runtime dep (`"catalog:"` in the package's `dependencies`) is invisible to that file-scoped rule, because its depType is resolved from the catalog rather than the file. It matches only the explicit `matchPackageNames` list on the rule described as "Catalog runtime deps of the published packages".

So: if a PR adds a `catalog:` entry to `dependencies` in `packages/core/package.json` or `packages/react/package.json`, and the package name is not added to that rule's `matchPackageNames` array, flag it.

Not an issue for `devDependencies` or `peerDependencies`, and not an issue for packages outside `packages/core` and `packages/react`.

### 2. React leaking into `packages/core`

`packages/core` must stay framework-agnostic. Flag any React import, React hook, JSX, or React-specific type introduced under `packages/core/src/`. Flag React packages added to its `package.json`.

### 3. Breaking changes to exported APIs

These packages are published. For anything reachable from a package's public entry points, flag:

- A removed or renamed export
- A changed function signature: new required parameter, removed parameter, narrowed parameter type, widened or changed return type
- A changed exported type or interface that existing consumers would fail to satisfy
- A changed default that alters runtime behaviour for current callers

Say whether the change is breaking under semver and whether the changeset accompanying the PR reflects that.

### 4. Cross-package impact

A change in `packages/core` can break `packages/react` consumers. When core behaviour, types or exports change, check whether `packages/react` needs a corresponding update, and flag it if the PR changes one without the other.

### 5. Major dependency upgrades

On a PR whose branch starts with `renovate/` and which raises a dependency by a major version, the diff is only `package.json` and `pnpm-lock.yaml`. The risk is in code the diff does not touch, so review the codebase rather than the diff:

1. Identify which packages moved, and from which major version to which.
2. Read the upgraded package's changelog or release notes for breaking changes, removed APIs, renamed exports and behavioural changes.
3. Search the repo for every usage of each upgraded package — imports, calls, type references, config.
4. Flag any usage that relies on something removed or changed in the new major.
5. Check whether peer dependencies, config files or build tooling need matching updates.

Report file paths and line numbers for each incompatibility. If every usage is compatible, say so in one line rather than listing them.

## Also worth flagging

- Bugs and logic errors
- Security vulnerabilities
- Performance problems
- Missing error handling
- Inadequate test coverage. Tests use Vitest and live next to the source file they cover, not in a separate `tests/` tree.
- A new dependency that is not clearly necessary, or that duplicates something already in the dependency tree
- Code that does not match surrounding conventions in the same package

## Conventions reference

Per-path conventions live in `.claude/rules/`, each with a `paths:` frontmatter pattern:

- `.claude/rules/monorepo-guidelines.md` — `packages/**/src/`
- `.claude/rules/core-package-conventions.md` — `packages/core/src/**/*.ts`
- `.claude/rules/request-tag-conventions.md` — `packages/core/src/**/*.ts`
- `.claude/rules/react-package-conventions.md` — `packages/react/src/**/*.{ts,tsx}`

Read the ones matching the changed files and treat violations as review issues. Repo-wide standards are in `AGENTS.md` at the root.

## Output

Keep reviews short, direct and actionable. For each issue: state the problem in one or two sentences, give the fix, include line numbers. If there is no actionable feedback, post nothing, except on a major dependency upgrade (section 5), where a one-line confirmation that usages were checked is itself useful.
