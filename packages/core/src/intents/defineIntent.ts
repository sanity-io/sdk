/**
 * Defines the structure for an intent parameter configuration.
 */
export interface IntentParameterConfig {
  id: string
  type: string
  required?: boolean
  description?: string
}

/**
 * Defines the configuration for an intent.
 * TPayload: The expected type for the payload object that the handler function will receive.
 * _TContext: The expected type for the context object (if any) that the handler function will receive (currently a placeholder).
 */
export interface IntentConfig<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
  _TContext extends Record<string, unknown> = Record<string, unknown>, // Context placeholder, note the underscore
> {
  /** (Required) The general verb for the intent (e.g., `view`, `edit`, `execute`, `create`). */
  action: string
  /** (Required) A short, human-readable name for the intent displayed in UIs. */
  name: string
  /** (Optional) A longer description of the intent's purpose. */
  description?: string
  /**
   * (Optional) Conditions that must be met for the intent to be considered applicable.
   * Used by the Dashboard/Studio to narrow down choices.
   */
  filters?: Array<Record<string, unknown>>
  /** (Optional) Describes the data payload the intent's `handler` expects. */
  parameters?: IntentParameterConfig[]
  /**
   * (Required) The function that executes the intent's logic.
   * Receives a payload object and an optional context object.
   */
  handler: (payload: TPayload /*, context?: _TContext */) => void | Promise<void>
}

/**
 * Helper function to define an intent with strong typing.
 * Provides a structured way to declare an intent's metadata and its handler.
 *
 * The `id` of the intent is not defined here; it will be derived from the filename
 * of the intent definition file (e.g., `viewProduct.ts` becomes intent with id `viewProduct`).
 *
 * TPayload: The expected type for the payload object that the handler function will receive.
 * TContext: The expected type for the context object (if any) that the handler function will receive.
 * @param config - The intent configuration object.
 * @returns The configuration object, allowing for type inference and validation.
 *
 * @example
 * ```typescript
 * // In src/_intents/myCustomIntent.ts
 * // Assuming this defineIntent is exported from @sanity/core or a similar non-React package
 * import { defineIntent } from '@sanity/core';
 *
 * interface MyPayload {
 *   documentId: string;
 *   mode?: 'preview' | 'edit';
 * }
 *
 * export default defineIntent<MyPayload>({
 *   action: 'customAction',
 *   name: 'My Custom Intent',
 *   description: 'Performs a custom operation on a document.',
 *   parameters: [
 *     { id: 'documentId', type: 'string', required: true },
 *     { id: 'mode', type: 'string' }
 *   ],
 *   async handler(payload) {
 *     console.log('Executing myCustomIntent with payload:', payload);
 *     // payload.documentId is strongly typed
 *     // ... your logic here
 *   }
 * });
 * ```
 */
export function defineIntent<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
  // The TContext here is for the function's generic signature, which might be used by advanced users
  // even if the handler in IntentConfig doesn't immediately use it.

  TContext extends Record<string, unknown> = Record<string, unknown>,
>(
  config: IntentConfig<TPayload, TContext>, // IntentConfig now uses _TContext internally for its definition
): IntentConfig<TPayload, TContext> {
  // but the function signature can maintain TContext for its own generics
  // Basic runtime validation (optional, as TypeScript handles this at compile time for users)
  if (!config || typeof config !== 'object') {
    throw new Error('Intent configuration must be an object.')
  }
  if (typeof config.action !== 'string' || !config.action.trim()) {
    throw new Error("Intent configuration must include a valid 'action' string.")
  }
  if (typeof config.name !== 'string' || !config.name.trim()) {
    throw new Error("Intent configuration must include a valid 'name' string.")
  }
  if (typeof config.handler !== 'function') {
    throw new Error("Intent configuration must include a 'handler' function.")
  }

  // Potentially, in the future, this function could do more, like registering
  // the intent with a global registry if not using file-based discovery for all cases,
  // or adding default an `id` if not derived from filename in some contexts.
  // For now, it primarily serves as a type-safe constructor/validator.
  return config
}
