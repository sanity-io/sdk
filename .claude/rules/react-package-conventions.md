---
paths:
  - 'packages/react/src/**/*.ts'
  - 'packages/react/src/**/*.tsx'
---

# `packages/react` conventions

- Functional components and Hooks only. The codebase does not use class components.
- React linting comes from `@repo/config-eslint/react`, which includes `eslint-plugin-react`, `eslint-plugin-react-hooks`, and `eslint-plugin-react-compiler`. Treat their warnings as errors during development.
- Tests use `@testing-library/react` with `@testing-library/jest-dom/vitest` matchers. Setup and automatic cleanup are wired up in `packages/react/test/setup.ts`.
