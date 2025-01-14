/**
 * Error class for authentication-related errors. Wraps errors thrown during the
 * authentication flow.
 *
 * @remarks
 * This class provides a consistent error type for authentication failures while
 * preserving the original error as the cause. If the original error has a
 * message property, it will be used as the error message.
 *
 * @alpha
 */
export class AuthError extends Error {
  constructor(error: unknown) {
    if (
      typeof error === 'object' &&
      !!error &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      super(error.message)
    } else {
      super()
    }

    this.cause = error
  }
}
