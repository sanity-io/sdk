import {ClientError, ConnectionFailedError, isTimeoutError, ServerError} from '@sanity/client'

import {MessageBusError} from '../dashboard/messageBus/bus'
import {TopicError} from '../dashboard/messageBus/topicStore'
import {DocumentInaccessibleError} from '../document/documentInaccessibleError'
import {ActionError} from '../document/processActions/shared'

const MAX_CAUSE_DEPTH = 5

/** Browsers word a failed `fetch` differently, and all of them throw a plain `TypeError`. */
const NETWORK_FAILURE_MESSAGE = /failed to fetch|networkerror|load failed|network request failed/i

/**
 * Aborting a request on teardown is routine. Matched by name because `DOMException` and abort
 * errors from other libraries do not share a class.
 */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError && NETWORK_FAILURE_MESSAGE.test(error.message)
}

/** Known errors that cannot be matched by class. */
const KNOWN_ERROR_CHECKS: ((error: unknown) => boolean)[] = [
  isTimeoutError,
  isAbortError,
  isNetworkFailure,
]

function isKnownErrorInstance(error: unknown): boolean {
  // Built per call so the classes are read after every module has finished loading
  const knownClasses = [
    ActionError,
    DocumentInaccessibleError,
    MessageBusError,
    TopicError,
    // 4xx and 5xx responses from the Sanity API reflect the app's permissions, queries, or API
    // availability, not a defect in the SDK
    ClientError,
    ServerError,
    // The user is offline
    ConnectionFailedError,
  ]
  return (
    knownClasses.some((knownClass) => error instanceof knownClass) ||
    KNOWN_ERROR_CHECKS.some((check) => check(error))
  )
}

/**
 * Whether an error is an expected state caused by the app's configuration, the user's
 * permissions, the user's network, or the Sanity API, and so is not worth reporting as an SDK
 * bug. Wrapped errors are checked through their `cause` chain.
 *
 * @internal
 */
export function isKnownSdkError(error: unknown): boolean {
  let current = error
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (isKnownErrorInstance(current)) return true
    if (!(current instanceof Error) || current.cause === undefined) return false
    current = current.cause
  }
  return false
}
