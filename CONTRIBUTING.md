# Contributing to Sanity App SDK

## Table of Contents

- [Getting Started](#getting-started)
- [Setup](#setup)
- [Testing](#testing)
- [Contributing](#contributing)

## Getting Started

Before contributing, please read our [code of conduct](https://github.com/sanity-io/.github/blob/main/CODE_OF_CONDUCT.md).

### Prerequisites

- Node.js: Version 20.x or higher (we recommend using the LTS version)
- pnpm: Version 8.x or higher

Check your versions:

```bash
node --version
pnpm --version
```

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

## Contributing

### Branch Guidelines

We follow the [Conventional Branch](https://conventional-branch.github.io/) specification.

### Commit Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Pull Request Process

Please follow the [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md) when submitting code for review.
