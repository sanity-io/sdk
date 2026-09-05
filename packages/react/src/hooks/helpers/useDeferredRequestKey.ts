import {useEffect, useRef, useState, useTransition} from 'react'

/**
 * @internal
 */
export interface DeferredRequestKey {
  /**
   * The key to read and resolve against. Lags `key` by one transition.
   */
  deferredKey: string
  /**
   * Aborts as soon as `key` moves on, so a suspending read for options the
   * caller has already replaced doesn't stay in flight.
   */
  signal: AbortSignal
  /**
   * Whether the transition to a newer key is still running.
   */
  isPending: boolean
}

/**
 * Holds a request key one transition behind the caller's own, so a component
 * whose options change keeps rendering its previous data instead of falling
 * back to a Suspense boundary.
 *
 * The controller lives in a ref rather than in state because the effect below
 * both reads and replaces it. As state it would be an effect dependency, so
 * replacing it would re-run the effect against a controller a suspended render
 * may already have captured, and a rapid run of key changes could abort the
 * signal a resolve is about to be started with.
 *
 * @internal
 */
export function useDeferredRequestKey(key: string): DeferredRequestKey {
  const [isPending, startTransition] = useTransition()
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

  // Reading the ref during render is safe here: React runs no effects for a
  // render that suspends, so the signal handed out now cannot be swapped
  // underneath the read that uses it.
  // eslint-disable-next-line react-hooks/refs -- intentional; see above
  return {deferredKey, signal: abortRef.current.signal, isPending}
}
