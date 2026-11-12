import {resetFetchErrors} from '@sanity/sdk/_internal'

import {createCallbackHook} from './createCallbackHook'

/**
 * Returns a function that clears failed reads, so hooks like `useProject` fetch again on their
 * next render instead of throwing the cached error.
 *
 * @remarks
 * Call it from an error boundary's reset handler. Without it, retrying the boundary throws the
 * same error until the cache drops it.
 *
 * @example
 * ```tsx
 * function Project() {
 *   const resetFetchErrors = useResetFetchErrors()
 *   return (
 *     <ErrorBoundary
 *       onReset={resetFetchErrors}
 *       fallbackRender={({resetErrorBoundary}) => (
 *         <button onClick={resetErrorBoundary}>Try again</button>
 *       )}
 *     >
 *       <Suspense fallback="Loading…">
 *         <ProjectName />
 *       </Suspense>
 *     </ErrorBoundary>
 *   )
 * }
 * ```
 *
 * @public
 * @category Platform
 */
export const useResetFetchErrors = createCallbackHook(resetFetchErrors)
