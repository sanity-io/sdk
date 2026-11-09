---
paths:
  - 'packages/react/src/**/*.ts'
  - 'packages/react/src/**/*.tsx'
---

# `packages/react` conventions

- Functional components and Hooks only. The codebase does not use class components.
- Build hooks with the factories in `src/hooks/helpers/` rather than hand-rolling subscription or suspense. A read hook over a fetcher uses `createFetcherHook` and returns `{data, isFetching, error, refetch}`; a mutation hook uses `createMutationHook` over a core `defineMutation` and returns `{mutate, isPending, error, data, reset}`.
- Every hook factory or primitive in `src/hooks/helpers/` returns its hook through `withSdkOrigin`. The wrapper marks errors thrown while the hook runs, which is how error reporting tells SDK errors from app errors in apps that bundle the SDK. A new factory, for example a `createInfiniteFetcherHook`, follows the same pattern: `return withSdkOrigin(useHook)`. The guard test in `withSdkOrigin.test.tsx` fails for a `create*Hook` file that does not. A hook written without a factory is not marked unless it is wrapped the same way.
- Keep app-provided functions out of the wrapped render path where you can. An error an app callback throws while the wrapped hook runs is marked as an SDK error. Callbacks a hook returns, and handlers it calls from effects or subscriptions, run outside the wrapper and are not affected.
- React linting comes from `@repo/config-oxlint/react`, which enables oxlint's built-in React and React Hooks rules and runs `eslint-plugin-react-compiler` as a JS plugin. Treat their warnings as errors during development.
- Tests use `@testing-library/react` with `@testing-library/jest-dom/vitest` matchers. Setup and automatic cleanup are wired up in `packages/react/test/setup.ts`.
