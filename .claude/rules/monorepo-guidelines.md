---
paths:
  - 'packages/**/src/**/*.ts'
  - 'packages/**/src/**/*.tsx'
---

# Monorepo guidelines

- Shared base configurations live under `packages/@repo/`. Each package extends them instead of redefining rules. Look at `packages/@repo/config-eslint/`, `packages/@repo/tsconfig/`, and `packages/@repo/config-test/` before adding new tooling.
- For TypeScript path aliases and compiler options, check the package's `tsconfig.settings.json` and the base `tsconfig.json` it extends.
