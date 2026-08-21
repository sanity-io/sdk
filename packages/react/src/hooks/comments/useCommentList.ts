import {type CommentsOptions, type SanityInstance, type StateSource} from '@sanity/sdk'
import {getCommentsOptionsKey, parseCommentsOptionsKey} from '@sanity/sdk/_internal'
import {useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'
import {
  useNormalizedResourceOptions,
  type WithResourceNameSupport,
} from '../helpers/useNormalizedResourceOptions'
import {trackHookUsage} from '../helpers/useTrackHookUsage'

/** The pair of core functions backing one read hook. */
export interface CommentListSource<T> {
  getState: (instance: SanityInstance, options: CommentsOptions) => StateSource<T | undefined>
  resolve: (
    instance: SanityInstance,
    options: CommentsOptions & {signal?: AbortSignal},
  ) => Promise<T>
}

/**
 * Shared body of {@link useComments} and {@link useCommentThreads}.
 *
 * Suspends until the first snapshot arrives. Changing documents or filters
 * happens in a transition, so the list already on screen stays put and
 * `isPending` reports the swap instead of the component suspending again. The
 * previous read is aborted, which drops its listener when nothing else is
 * reading it.
 *
 * @internal
 */
export function useCommentList<T>(
  hookName: string,
  options: WithResourceNameSupport<CommentsOptions>,
  {getState, resolve}: CommentListSource<T>,
): {value: T; isPending: boolean} {
  const instance = useSanityInstance()
  trackHookUsage(instance, hookName)

  const normalized = useNormalizedResourceOptions(options)
  const [isPending, startTransition] = useTransition()

  const key = getCommentsOptionsKey(normalized)
  // Held one render behind `key`, so the swap can happen inside a transition.
  const [deferredKey, setDeferredKey] = useState(key)
  const abortRef = useRef<AbortController>(new AbortController())

  useEffect(() => {
    if (key === deferredKey) return

    startTransition(() => {
      if (!abortRef.current.signal.aborted) {
        abortRef.current.abort()
        abortRef.current = new AbortController()
      }
      setDeferredKey(key)
    })
  }, [deferredKey, key])

  const deferred = useMemo(() => parseCommentsOptionsKey(deferredKey), [deferredKey])
  const {getCurrent, subscribe} = useMemo(
    () => getState(instance, deferred),
    [deferred, getState, instance],
  )

  if (getCurrent() === undefined) {
    // Reading the ref mid-render is safe here: React runs no effects for a
    // render that suspends, so the signal captured now cannot be swapped
    // underneath this pass.
    const currentSignal = abortRef.current.signal

    // eslint-disable-next-line react-hooks/refs -- intentional during a suspended render; see above
    throw resolve(instance, {...deferred, signal: currentSignal})
  }

  // Not memoised: both callers destructure this immediately and memoise their
  // own result object, so a stable identity here would never be observed.
  return {value: useSyncExternalStore(subscribe, getCurrent) as T, isPending}
}
