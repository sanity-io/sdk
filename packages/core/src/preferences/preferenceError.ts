import {ClientError, ConnectionFailedError, isTimeoutError, ServerError} from '@sanity/client'

import {getClientErrorApiBody} from '../auth/utils'
import {isNetworkFailure} from '../errorReporting/isNetworkFailure'

const API_ERROR_CODES = [
  'requestInvalid',
  'levelNotAllowed',
  'valueInvalid',
  'unauthorized',
  'accessDenied',
  'sessionScopeDenied',
  'keyNotDeclared',
  'versionNotDeclared',
  'quotaExceeded',
  'backwardsNotAllowed',
  'preconditionFailed',
  'valueTooLarge',
  'accessCheckFailed',
] as const

/**
 * The preferences API's error codes, plus `networkError` when the API couldn't be reached and
 * `requestFailed` when it answered with an error but no code, like a gateway timeout.
 * @internal
 */
export type PreferenceErrorCode =
  | (typeof API_ERROR_CODES)[number]
  | 'networkError'
  | 'requestFailed'

/**
 * Every failed preference read or write is one of these. Branch on `code`: `message` is for
 * people and can change.
 * @internal
 */
export class PreferenceError extends Error {
  /** What went wrong, for code to branch on. */
  readonly code: PreferenceErrorCode
  /** The API's HTTP status, when it answered. */
  readonly statusCode: number | undefined

  /** Creates an error with a code, a message for people, and optionally the API's status. */
  constructor(
    code: PreferenceErrorCode,
    message: string,
    details: {statusCode?: number; cause?: unknown} = {},
  ) {
    super(message, {cause: details.cause})
    this.name = 'PreferenceError'
    this.code = code
    this.statusCode = details.statusCode
  }
}

function isApiErrorCode(code: unknown): code is (typeof API_ERROR_CODES)[number] {
  return API_ERROR_CODES.some((known) => known === code)
}

/**
 * Turns a failed preferences request into a {@link PreferenceError}. Anything else, like a bug,
 * is returned as it is, so error reporting still sees it.
 * @internal
 */
export function toPreferenceError(error: unknown): unknown {
  if (isNetworkFailure(error) || isTimeoutError(error) || error instanceof ConnectionFailedError) {
    return new PreferenceError(
      'networkError',
      "Couldn't reach the preferences API. Check your connection and try again.",
      {cause: error},
    )
  }
  if (!(error instanceof ClientError || error instanceof ServerError)) return error

  const {statusCode} = error
  // A `ServerError` carries its response the same way
  const {code, message} = getClientErrorApiBody(error as ClientError) ?? {}
  if (!isApiErrorCode(code)) {
    return new PreferenceError(
      'requestFailed',
      `The preferences API answered with status ${statusCode}. Try again later.`,
      {statusCode, cause: error},
    )
  }
  return new PreferenceError(code, String(message), {statusCode, cause: error})
}
