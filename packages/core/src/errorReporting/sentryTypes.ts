// These are `import()` type aliases on purpose. A type-only `import {type X} from '@sentry/browser'`
// still leaves a static import of the package in the bundle, and that stops the lazy
// `import('@sentry/browser')` in `errorReporter.ts` from becoming its own chunk.
export type BrowserOptions = import('@sentry/browser').BrowserOptions
export type ErrorEvent = import('@sentry/browser').ErrorEvent
export type Event = import('@sentry/browser').Event
export type Scope = import('@sentry/browser').Scope
