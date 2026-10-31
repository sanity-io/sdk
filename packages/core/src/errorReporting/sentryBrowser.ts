// Loaded with `import()` by the error reporter. Importing `@sentry/browser` directly would pull the
// whole package into every bundle that reaches the reporter, since a bundler cannot tree-shake the
// namespace of a dynamic import. Named re-exports keep only what the reporter uses.
export {
  BrowserClient,
  defaultStackParser,
  linkedErrorsIntegration,
  makeFetchTransport,
  Scope,
} from '@sentry/browser'
