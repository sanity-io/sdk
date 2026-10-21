import {type GenericContext} from '@sanity/functions'

/** Arguments supplied to an app's PubSub function handler. @beta */
export interface FunctionArgs<Input> {
  /** Sanity's function execution context. */
  context: GenericContext
  /** The invocation payload. */
  event: {data: Input}
}

/**
 * Define a callable app function while preserving its exact input and return types.
 * The CLI generates input and output validation when it builds the function.
 * @beta
 */
export function functionHandler<Handler extends (...args: never[]) => unknown>(
  handler: Handler,
): Handler {
  if (typeof handler !== 'function') throw new TypeError('A function handler is required.')
  return handler
}
