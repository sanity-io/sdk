import {type DocumentHandle, getProjectionState, resolveProjection} from '@sanity/sdk'
import {useCallback, useMemo, useSyncExternalStore} from 'react'
import {distinctUntilChanged, Observable, startWith} from 'rxjs'

import {useSanityInstance} from '../context/useSanityInstance'

interface UseProjectionOptions {
  document: DocumentHandle
  projection: string
  ref?: React.RefObject<unknown>
}

interface UseProjectionResults<TResult extends Record<string, unknown>> {
  results: TResult[] | null
  isPending: boolean
}

/**
 * @beta
 */
export function useProjection<TResult extends Record<string, unknown>>({
  document: {_id, _type},
  projection,
  ref,
}: UseProjectionOptions): UseProjectionResults<TResult> {
  const instance = useSanityInstance()

  const stateSource = useMemo(
    () => getProjectionState(instance, {document: {_id, _type}, projection}),
    [instance, _id, _type, projection],
  )

  // Create subscribe function for useSyncExternalStore
  const subscribe = useCallback(
    (onStoreChanged: () => void) => {
      let stateSubscription: (() => void) | null = null

      const subscription = new Observable<boolean>((observer) => {
        stateSubscription = stateSource.subscribe(() => onStoreChanged()) // not correct: ensure there's not too many subscriptions

        // Handle intersection observer if ref is provided
        if (
          ref &&
          typeof IntersectionObserver !== 'undefined' &&
          typeof HTMLElement !== 'undefined'
        ) {
          const intersectionObserver = new IntersectionObserver(
            ([entry]) => observer.next(entry.isIntersecting),
            {rootMargin: '0px', threshold: 0},
          )
          if (ref.current && ref.current instanceof HTMLElement) {
            intersectionObserver.observe(ref.current)
          }
          return () => intersectionObserver.disconnect()
        }
        return () => {}
      })
        .pipe(startWith(true), distinctUntilChanged())
        .subscribe({
          next: (isVisible) => {
            if (isVisible) {
              onStoreChanged()
            }
          },
        })

      return () => {
        subscription.unsubscribe()
        if (stateSubscription) stateSubscription()
      }
    },
    [stateSource, ref],
  )

  // Create getSnapshot function to return current state
  const getSnapshot = useCallback(() => {
    const currentState = stateSource.getCurrent()
    if (currentState.results === null)
      throw resolveProjection(instance, {document: {_id, _type}, projection})
    return currentState as UseProjectionResults<TResult>
  }, [_id, _type, projection, instance, stateSource])

  return useSyncExternalStore(subscribe, getSnapshot)
}
