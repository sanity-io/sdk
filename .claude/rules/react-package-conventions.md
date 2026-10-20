---
paths:
  - 'packages/react/src/**/*.ts'
  - 'packages/react/src/**/*.tsx'
---

# `packages/react` conventions

- Functional components and Hooks only. The codebase does not use class components.
- React linting comes from `@repo/config-oxlint/react`, which enables oxlint's built-in React and React Hooks rules and runs `eslint-plugin-react-compiler` as a JS plugin. Treat their warnings as errors during development.
- Tests use `@testing-library/react` with `@testing-library/jest-dom/vitest` matchers. Setup and automatic cleanup are wired up in `packages/react/test/setup.ts`.
