import {CORE_SDK_VERSION} from '../version'
import {hasDebugFlag, isErrorReportingEnabled} from './isErrorReportingEnabled'
import {isKnownSdkError} from './isKnownSdkError'
import {beforeSend, sdkSentryDataCollection} from './privacy'
import {type BrowserOptions, type ErrorEvent, type Event, type Scope} from './sentryTypes'

/**
 * The DSN of the SDK project in Sentry. It is a public ingest key, not a secret.
 */
const SDK_DSN = 'https://08e08ab0cbf33a49f7f5066597d5e374@sentry.sanity.io/4512347487666176'

/**
 * Events go through the Sanity intake tunnel, which forwards them to Sentry. This avoids ad
 * blockers and customer CSP `connect-src` rules that block the Sentry ingest host.
 */
const SDK_TUNNEL = 'https://api.sanity.io/vX/intake/tracing'

/** Most events a single page load may send. A render loop can throw thousands of errors. */
const MAX_EVENTS_PER_SESSION = 10

/** Events with the same message inside this window are reported once. */
const DUPLICATE_WINDOW_MS = 5 * 60 * 1000

/** Failed loads of the Sentry chunk allowed before the reporter gives up for the page load. */
const MAX_LOAD_FAILURES = 3

/** @internal */
export interface ReportErrorInfo {
  /** The component stack React gives an error boundary. */
  componentStack?: string | null
  /** The name of the error boundary that caught the error. */
  errorBoundary?: string
}

/** @internal */
export interface ErrorReporterOptions {
  /** Replaces the fetch transport, for tests. */
  transport?: BrowserOptions['transport']
}

/**
 * The value of the error that was thrown. When `linkedErrors` adds the causes, they come first
 * and the thrown error is last.
 */
function getThrownValue(event: Event): string | undefined {
  return event.exception?.values?.at(-1)?.value ?? event.message
}

/**
 * Caps the events per session and drops repeats of the same message inside a time window.
 */
function limitEventsIntegration() {
  const seen = new Map<string, number>()
  let sent = 0

  return {
    name: 'SdkLimitEvents',
    processEvent(event: Event): Event | null {
      if (sent >= MAX_EVENTS_PER_SESSION) return null

      const message = getThrownValue(event) ?? ''
      const now = Date.now()
      const previous = seen.get(message)
      if (previous !== undefined && now - previous < DUPLICATE_WINDOW_MS) return null

      seen.set(message, now)
      sent++
      return event
    },
  }
}

/**
 * Matches the SDK bundle served by the module server (`@sanity__sdk`, `@sanity__sdk-react`) and
 * the same packages under `node_modules` (`@sanity/sdk`, or `@sanity_sdk-react` in a Vite
 * dependency cache). The package name must end at a path separator or a file extension, so
 * `@sanity/sdk-other` does not match.
 */
const SDK_MODULE_PATTERN = /(?:@|%40)sanity(?:__|_|\/|%2F)sdk(?:-react)?(?=[/.]|$)/

/** This repo's own sources, which only show up in local development with the debug flag set. */
const SDK_SOURCE_PATTERN = /\/packages\/(?:core|react)\/(?:src|dist)\//

/** Frame names the engine uses for code without a URL, such as `JSON.parse (<anonymous>)`. */
const BUILTIN_FRAME_PATTERN = /^(?:<.*>|native)$/

function isSdkFilename(filename: string): boolean {
  return SDK_MODULE_PATTERN.test(filename) || (hasDebugFlag() && SDK_SOURCE_PATTERN.test(filename))
}

/**
 * The file of the innermost frame that has a URL. Builtins such as `JSON.parse` and `new URL`
 * sit on top of the stack when they throw, and the code that called them decides the owner.
 */
function getThrowingFilename(event: Event): string | undefined {
  const frames = event.exception?.values?.at(-1)?.stacktrace?.frames ?? []
  for (let index = frames.length - 1; index >= 0; index--) {
    const filename = frames[index]?.filename
    if (filename && !BUILTIN_FRAME_PATTERN.test(filename)) return filename
  }
  return undefined
}

/**
 * Keeps only events thrown by SDK code. Error boundaries also catch errors thrown by the app
 * rendered beneath them, so the frame that threw decides who owns the error. Events with no
 * usable frame cannot be attributed and are dropped.
 */
function sdkOriginIntegration() {
  return {
    name: 'SdkOrigin',
    processEvent(event: Event): Event | null {
      const filename = getThrowingFilename(event)
      return filename && isSdkFilename(filename) ? event : null
    },
  }
}

/**
 * Sentry marks every error it is given as already captured, and skips marked errors in every
 * Sentry client on the page. Capturing a copy keeps that mark off the app's own error objects.
 */
function toCapturable(error: Error): Error {
  const copy = new Error(
    error.message,
    error.cause === undefined ? undefined : {cause: error.cause},
  )
  copy.name = error.name
  copy.stack = error.stack
  return copy
}

function getEnvironment(): string {
  const hostname = typeof window === 'undefined' ? '' : window.location?.hostname
  return hostname === 'localhost' || hostname === '127.0.0.1' ? 'development' : 'production'
}

/**
 * Creates a reporter that sends unexpected SDK errors to Sentry. It owns its own Sentry client
 * and scope, and installs no global error handlers. Nothing is sent unless `reportError` is
 * called.
 *
 * @internal
 */
export function createErrorReporter(options: ErrorReporterOptions = {}): {
  reportError: (error: unknown, info?: ReportErrorInfo) => void
} {
  let scopePromise: Promise<Scope> | undefined
  let loadFailures = 0

  function getScope(): Promise<Scope> {
    scopePromise ??= import('@sentry/browser')
      .then((sentry) => {
        const client = new sentry.BrowserClient({
          dsn: SDK_DSN,
          tunnel: SDK_TUNNEL,
          release: String(CORE_SDK_VERSION),
          environment: getEnvironment(),
          dataCollection: sdkSentryDataCollection,
          stackParser: sentry.defaultStackParser,
          transport: options.transport ?? sentry.makeFetchTransport,
          integrations: [
            sentry.linkedErrorsIntegration(),
            sdkOriginIntegration(),
            limitEventsIntegration(),
          ],
          beforeSend: (event: ErrorEvent) => beforeSend(event),
        })

        const scope = new sentry.Scope()
        scope.setClient(client)
        client.init()
        return scope
      })
      .catch((error: unknown) => {
        // Let the next report try again, for a chunk that failed to load while offline
        scopePromise = undefined
        loadFailures++
        throw error
      })
    return scopePromise
  }

  function reportError(error: unknown, info: ReportErrorInfo = {}): void {
    // This runs inside `componentDidCatch`, where a throw would reach the parent boundary
    try {
      // Sentry builds a synthetic stack for non-Error values, and that stack points into this
      // module, so such values would be attributed to the SDK
      if (
        !(error instanceof Error) ||
        loadFailures >= MAX_LOAD_FAILURES ||
        !isErrorReportingEnabled() ||
        isKnownSdkError(error)
      ) {
        return
      }

      const capturable = toCapturable(error)
      const {componentStack, errorBoundary} = info
      const tags = errorBoundary ? {handled: 'no', errorBoundary} : {handled: 'no'}

      getScope()
        .then((scope) => {
          scope.captureException(capturable, {
            mechanism: {handled: false, type: 'generic'},
            captureContext: {
              tags,
              contexts: componentStack ? {react: {componentStack}} : undefined,
            },
          })
        })
        .catch(() => {
          // Nothing to do. The reporter must not add errors to the app it reports for.
        })
    } catch {
      // Same: never throw into the caller
    }
  }

  return {reportError}
}

/**
 * Reports an unexpected error from the SDK to Sentry, when error reporting is enabled.
 *
 * @internal
 */
export const {reportError} = createErrorReporter()
