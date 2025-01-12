import {getDocumentState, type SanityDocumentLike} from '@sanity/sdk'
import {useState, useSyncExternalStore} from 'react'
import {filter, firstValueFrom} from 'rxjs'

import {useSanityInstance} from '../context/useSanityInstance'

const docIsNotUndefined = (doc: SanityDocumentLike | null | undefined) => doc !== undefined

/**
 * Returns the current state of the given document ID considering
 * locally/optimistically applied mutations. Optionally accepts a selector
 * function for more granular updates from the document.
 *
 * Suspends when the document value is initially being populated.
 *
 * @beta
 */
export function useDocument<TDocument extends SanityDocumentLike, TSelection = unknown>(
  documentId: string,
  selector: (doc: TDocument | null) => TSelection,
): TSelection
/** @beta */
export function useDocument<TDocument extends SanityDocumentLike>(
  documentId: string,
): TDocument | null
/** @beta */
export function useDocument<TDocument extends SanityDocumentLike>(
  documentId: string,
  selector?: (doc: TDocument | null | undefined) => unknown,
): unknown {
  const instance = useSanityInstance()
  // initializer is used here to ensure the resource is stable across re-renders
  const [loaded] = useState(() => getDocumentState(instance, documentId, docIsNotUndefined))
  const [value] = useState(() => getDocumentState(instance, documentId, selector))

  // if the doc is `undefined` then it hasn't loaded yet, suspend until then
  if (!loaded.getCurrent()) {
    throw firstValueFrom(loaded.observable.pipe(filter(Boolean)))
  }

  return useSyncExternalStore(value.subscribe, value.getCurrent)
}
