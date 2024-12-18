import {type DocumentHandle, getPreviewSource, type PreviewValue, resolvePreview} from '@sanity/sdk'
import {type RefObject, useCallback, useMemo, useSyncExternalStore} from 'react'
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
export function usePreview({
  document: {_id, _type},
  ref,
}: UsePreviewOptions): [PreviewValue, boolean] {
  const instance = useSanityInstance()

  const previewSource = useMemo(
    () => getPreviewSource(instance, {document: {_id, _type}}),
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
        if (ref?.current) intersectionObserver.observe(ref.current)
        return () => intersectionObserver.disconnect()
      })
        .pipe(
          startWith(false),
          distinctUntilChanged(),
          switchMap((isVisible) =>
            isVisible
              ? new Observable<void>((obs) => {
                  return previewSource.subscribe(() => obs.next())
                })
              : EMPTY,
          ),
        )
        .subscribe({next: onStoreChanged})

      return () => subscription.unsubscribe()
    },
    [previewSource, ref],
  )

  // Create getSnapshot function to return current state
  const getSnapshot = useCallback(() => {
    const previewTuple = previewSource.getCurrent()
    if (!previewTuple[0]) throw resolvePreview(instance, {document: {_id, _type}})
    return previewTuple as [PreviewValue, boolean]
  }, [_id, _type, instance, previewSource])

  return useSyncExternalStore(subscribe, getSnapshot)
}
