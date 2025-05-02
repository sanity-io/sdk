/**
 * Error class for configuration-related errors. Wraps errors thrown during the
 * configuration flow.
 *
 * @alpha
 */
export class ConfigurationError extends Error {
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
