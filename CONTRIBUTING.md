# Contributing to Sanity App SDK

## Table of Contents

- [Getting Started](#getting-started)
- [Setup](#setup)
- [Testing](#testing)
- [Contributing](#contributing)

## Getting Started

Before contributing, please read our [code of conduct](https://github.com/sanity-io/.github/blob/main/CODE_OF_CONDUCT.md).

### Prerequisites

- **Node.js and npm**: install Node.js 22.13 or newer to bootstrap the tools. The development runtime is pinned in `devEngines.runtime` in [`package.json`](package.json). `pnpm install` downloads that version, and `pnpm run` and `pnpm exec` use it automatically.
- **pnpm**: pinned via the `packageManager` field in `package.json`. Run `corepack enable` once and pnpm will resolve to the correct version automatically.

After installing dependencies, check your versions:

```bash
pnpm exec node --version
pnpm --version
```

Bare `node` commands may still use your shell's Node version. To make them follow the project pin too, use pnpm's [project-aware global bins](https://pnpm.io/blog/whats-different-in-pnpm-12#project-aware-global-bins). You can also keep your existing version manager and use `pnpm exec node` when you need the pinned runtime.

CI installs dependencies with `--no-runtime` so the Node version selected by `actions/setup-node` takes precedence. The test and build matrices continue to cover Node 22 and 24.

## Setup

1. Clone the repository

```bash
git clone git@github.com:sanity-io/sdk.git
```

2. Install dependencies

```bash
pnpm install
```

3. Run locally

```bash
pnpm run dev
```

## Testing

Run tests locally before submitting:

```bash
pnpm test
```

## Testing with Preview Packages

We use [pkg.pr.new](https://pkg.pr.new) to generate preview packages for pull requests. This allows you to test your built package in local environments before they're merged and published to npm.

### Requesting Preview Packages

To publish preview packages for your PR:

1. Add the `trigger: preview` label to your pull request
2. Wait for the "Publish Preview Packages" workflow to complete
3. A comment will be automatically posted with installation instructions

### Installing Preview Packages

Once preview packages are published, you can install them using npm or pnpm:

```bash
# Install a specific preview package
npm install https://pkg.pr.new/@sanity/sdk-react@<commit-sha>

# Install all preview packages
npm install \
  https://pkg.pr.new/@sanity/sdk@<commit-sha> \
  https://pkg.pr.new/@sanity/sdk-react@<commit-sha>
```

Or use pnpm:

```bash
pnpm add https://pkg.pr.new/@sanity/sdk-react@<commit-sha>
```

You can also add the package at the specific SHA to a package.json file:

```json
{
  "dependencies": {
    "@sanity/sdk": "https://pkg.pr.new/@sanity/sdk@<commit-sha>",
    "@sanity/sdk-react": "https://pkg.pr.new/@sanity/sdk-react@<commit-sha>"
  }
}
```

### Preview Package Lifecycle

- Preview packages are generated for each commit on labeled PRs
- The PR comment updates with new URLs on subsequent commits
- Preview packages remain available as long as the PR is open
- Preview packages are automatically cleaned up after the PR is closed

## Releasing

Releases are managed with [Changesets](https://github.com/changesets/changesets). Both published packages — `@sanity/sdk` and `@sanity/sdk-react` — always ship the same version.

### Adding a changeset

A change that users should receive needs a changeset. From the repo root:

```bash
pnpm changeset
```

Pick the bump for the change:

- `feat` → **minor**
- `fix` / `perf` / `revert` → **patch**
- a breaking change → **major**

`chore` / `docs` / `test` / `ci` changes, and changes that only touch `apps/*`, carry no changeset and do not release. You can pick either published package when prompted — they are version-fixed, so both bump together. Commit the generated file under `.changeset/`.

To preview the version bump and changelog entries locally, run `GITHUB_TOKEN=$(gh auth token) pnpm changeset version` — the `GITHUB_TOKEN` is required because `@changesets/changelog-github` calls the GitHub API to enrich each entry. Discard the result afterwards; the Version PR does this in CI.

### The Version PR

When your PR merges to `main`, Changesets opens (or updates) a `chore: release` "Version PR" that collects the pending bumps and updates each `CHANGELOG.md`. Merging that Version PR bumps the versions, publishes both packages to npm, and cuts a single `sdk-vX.Y.Z` tag and GitHub release.

### Release candidates

To publish an rc from your branch, dispatch the **Release - Release Candidate** workflow on it. The branch needs at least one changeset — the rc version comes from the pending changesets, not from an input (a minor changeset yields `3.3.0-rc.0`, a major `4.0.0-rc.0`). The workflow enters pre-release mode, publishes to the `rc` dist-tag, then commits `.changeset/pre.json` and the version bumps back to your branch.

To cut the next rc (`rc.N+1`), push a follow-up fix with its own changeset and dispatch the workflow again. Versioning consumes each changeset into `.changeset/pre/`, so a re-dispatch with no new top-level changeset is rejected by the "Require a changeset" guard rather than advancing the rc number.

Before opening the PR to `main`, leave pre-release mode:

```bash
pnpm changeset pre exit
git commit -am "chore: exit rc pre-release mode"
git push
```

`pnpm changeset pre exit` does not delete `.changeset/pre.json`; it sets its `"mode"` to `"exit"` and moves the consumed changesets back to the top-level `.changeset/`. Commit that. Never merge a branch whose `pre.json` still has `"mode": "pre"` — it would put `main` into pre-release mode. The Version PR on `main` removes `pre.json` when it runs `changeset version`, turns `3.3.0-rc.N` into `3.3.0`, and collapses the rc changelog entries into the final release.

## Contributing

### Branch Guidelines

We follow the [Conventional Branch](https://conventional-branch.github.io/) specification.

### Commit Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Pull Request Process

Please follow the [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md) when submitting code for review.
