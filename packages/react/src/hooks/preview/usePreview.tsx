import {
  type DocumentHandle,
  getPreviewStore,
  type PreviewValue,
  type ValuePending,
} from '@sanity/sdk'
import {type RefObject, useCallback, useSyncExternalStore} from 'react'
import {distinctUntilChanged, EMPTY, Observable, startWith, switchMap} from 'rxjs'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @alpha
 */
export interface UsePreviewOptions {
  document: DocumentHandle
  ref?: RefObject<HTMLElement>
}

/**
 * @alpha
 */
export function usePreview({document, ref}: UsePreviewOptions): [PreviewValue, boolean] {
  const instance = useSanityInstance()
  const previewStore = getPreviewStore(instance)

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
        if (ref?.current) intersectionObserver.observe(ref.current)
        return () => intersectionObserver.disconnect()
      })
        .pipe(
          startWith(false),
          distinctUntilChanged(),
          switchMap((isVisible) =>
            isVisible
              ? new Observable<ValuePending<PreviewValue>>((obs) => {
                  const sub = previewStore.events({document}).subscribe(obs)
                  return () => sub.unsubscribe()
                })
              : EMPTY,
          ),
        )
        .subscribe({next: onStoreChanged})

      return () => subscription.unsubscribe()
    },
    [document, previewStore, ref],
  )

  // Create getSnapshot function to return current state
  const getSnapshot = useCallback(() => {
    const previewTuple = previewStore.getPreview({document})
    if (!previewTuple[0]) throw previewStore.resolvePreview({document})
    return previewTuple as [PreviewValue, boolean]
  }, [document, previewStore])

  return useSyncExternalStore(subscribe, getSnapshot)
}
