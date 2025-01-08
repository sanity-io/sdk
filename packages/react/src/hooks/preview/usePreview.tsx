import {type DocumentHandle, getPreviewState, type PreviewValue, resolvePreview} from '@sanity/sdk'
import {useCallback, useMemo, useSyncExternalStore} from 'react'
import {distinctUntilChanged, EMPTY, Observable, startWith, switchMap} from 'rxjs'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @alpha
 */
export interface UsePreviewOptions {
  document: DocumentHandle
  ref: HTMLElement | null
}

/**
 * @alpha
 */
export function usePreview({
  document: {_id, _type},
  ref,
}: UsePreviewOptions): [PreviewValue, boolean] {
  const instance = useSanityInstance()

  const stateSource = useMemo(
    () => getPreviewState(instance, {document: {_id, _type}}),
    [instance, _id, _type],
  )

  // Create subscribe function for useSyncExternalStore
  const subscribe = useCallback(
    (onStoreChanged: () => void) => {
      const subscription = new Observable<boolean>((observer) => {
        // for environments that don't have an intersection observer
        if (typeof IntersectionObserver === 'undefined') return

        const intersectionObserver = new IntersectionObserver(
          ([entry]) => observer.next(entry.isIntersecting),
          {rootMargin: '0px', threshold: 0},
        )
        if (ref) intersectionObserver.observe(ref)
        return () => intersectionObserver.disconnect()
      })
        .pipe(
          startWith(false),
          distinctUntilChanged(),
          switchMap((isVisible) =>
            isVisible
              ? new Observable<void>((obs) => {
                  return stateSource.subscribe(() => obs.next())
                })
              : EMPTY,
          ),
        )
        .subscribe({next: onStoreChanged})

      return () => subscription.unsubscribe()
    },
    [stateSource, ref],
  )

  // Create getSnapshot function to return current state
  const getSnapshot = useCallback(() => {
    const previewTuple = stateSource.getCurrent()
    if (!previewTuple[0]) throw resolvePreview(instance, {document: {_id, _type}})
    return previewTuple as [PreviewValue, boolean]
  }, [_id, _type, instance, stateSource])

  return useSyncExternalStore(subscribe, getSnapshot)
}
