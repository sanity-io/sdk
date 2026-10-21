import {type SanityClient} from '@sanity/client'

/**
 * Augmented by the CLI-generated sanity.functions.d.ts in each app project.
 * @beta
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging target
export interface AppFunctionRegistry {}

/** Options for a synchronous app function call. @beta */
export interface FunctionCallOptions {
  /** Maximum request duration in milliseconds. */
  timeout?: number
  /** Cancel an in-flight invocation. */
  signal?: AbortSignal
}

/** A client's callable functions, inferred from the app's generated registry. @beta */
export type AppFunctions = {
  [Name in keyof AppFunctionRegistry]: AppFunctionRegistry[Name] extends {
    input: infer Input
    output: infer Output
  }
    ? [Input] extends [void]
      ? (options?: FunctionCallOptions) => Promise<Output>
      : (input: Input, options?: FunctionCallOptions) => Promise<Output>
    : never
}

/** Validation emitted by the CLI for one function. @internal */
export interface AppFunctionContract {
  hasInput: boolean
  validateInput: (value: unknown) => boolean
  validateOutput: (value: unknown) => boolean
}

/** Bind generated function contracts to an authenticated client. @internal */
export function createAppFunctions(
  client: SanityClient,
  contracts: Record<string, AppFunctionContract>,
): AppFunctions {
  const entries = Object.entries(contracts).map(([name, contract]) => [
    name,
    async (...args: unknown[]): Promise<unknown> => {
      const input = contract.hasInput ? args[0] : undefined
      const options = (contract.hasInput ? args[1] : args[0]) as FunctionCallOptions | undefined
      if (!contract.validateInput(input)) {
        throw new TypeError(`Invalid input for function "${name}". Match its declared input type.`)
      }
      const result = await client.functions.invoke<unknown>(
        name,
        {
          event: {data: contract.hasInput ? input : {}},
          timeout: options?.timeout,
          signal: options?.signal,
        },
        {sync: true},
      )
      if (!contract.validateOutput(result)) {
        throw new TypeError(
          `Unexpected response from function "${name}". Rebuild and redeploy the app and its functions together.`,
        )
      }
      return result
    },
  ])
  return Object.fromEntries(entries) as AppFunctions
}
