import {markSdkError} from '@sanity/sdk/_internal'

/**
 * Errors React throws from inside a hook call that are not SDK bugs: production invariant errors,
 * the development messages for breaking the rules of hooks (an app that calls an SDK hook
 * conditionally gets these from inside the SDK hook), and the shared exception `use()` throws to
 * suspend.
 */
const REACT_INTERNAL_ERROR_PATTERN =
  /^(?:Minified React error #\d+|Suspense Exception|Rendered (?:more|fewer) hooks|Invalid hook call|Too many re-renders|Should have a queue)/

/**
 * Wraps a hook so an error thrown while it runs is marked as coming from the SDK, then rethrown
 * unchanged. Suspense promises pass through untouched because `markSdkError` ignores anything
 * that is not an `Error`, and errors React raises itself are not marked.
 *
 * Every hook factory in this folder returns its hook through this wrapper, and a guard test in
 * `withSdkOrigin.test.tsx` checks it. A new factory must do the same, or errors from the hooks
 * it builds are not attributed to the SDK in apps that bundle it.
 */
export function withSdkOrigin<TParams extends unknown[], TReturn>(
  useHook: (...params: TParams) => TReturn,
): (...params: TParams) => TReturn {
  return function useWithSdkOrigin(...params: TParams): TReturn {
    try {
      // eslint-disable-next-line react-hooks/rules-of-hooks -- `try` does not make the call conditional; it runs on every render
      return useHook(...params)
    } catch (error) {
      if (!(error instanceof Error && REACT_INTERNAL_ERROR_PATTERN.test(error.message))) {
        markSdkError(error)
      }
      throw error
    }
  }
}
