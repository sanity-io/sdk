import {CorsOriginError} from '@sanity/client'
import {isImportError} from '@sanity/sdk'
import {reportError} from '@sanity/sdk/_internal'
import {type ErrorInfo} from 'react'

import {AuthError} from '../auth/AuthError'
import {ConfigurationError} from '../auth/ConfigurationError'

/**
 * Creates an `onError` handler for an `ErrorBoundary` that reports unexpected errors to Sentry.
 * The boundaries also catch errors thrown by the app rendered beneath them, so the reporter
 * keeps only errors whose throwing frame is in the SDK. Auth, configuration, CORS, and chunk
 * load errors are expected states and are never reported.
 */
export function reportBoundaryError(errorBoundary: string) {
  return (error: unknown, info: ErrorInfo): void => {
    if (
      error instanceof AuthError ||
      error instanceof ConfigurationError ||
      // The module bundle can hold a second copy of `@sanity/client`, so `instanceof` alone can
      // miss an error thrown by the other copy
      error instanceof CorsOriginError ||
      (error instanceof Error && error.name === 'CorsOriginError') ||
      isImportError(error)
    ) {
      return
    }
    reportError(error, {errorBoundary, componentStack: info.componentStack})
  }
}
