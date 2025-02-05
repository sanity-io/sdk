import {
  type DocumentHandle,
  getDocumentState,
  type JsonMatch,
  type JsonMatchPath,
  resolveDocument,
} from '@sanity/sdk'
import {type SanityDocument} from '@sanity/types'
import {useCallback, useMemo, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

export function useDocument<
  TDocument extends SanityDocument,
  TPath extends JsonMatchPath<TDocument>,
>(doc: string | DocumentHandle<TDocument>, path: TPath): JsonMatch<TDocument, TPath> | undefined
export function useDocument<TDocument extends SanityDocument>(
  doc: string | DocumentHandle<TDocument>,
): TDocument | null
export function useDocument(doc: string | DocumentHandle, path?: string): unknown {
  const documentId = typeof doc === 'string' ? doc : doc._id
  const instance = useSanityInstance()
  const isDocumentReady = useCallback(
    () => getDocumentState(instance, documentId).getCurrent() !== undefined,
    [instance, documentId],
  )
  if (!isDocumentReady()) throw resolveDocument(instance, documentId)

  const {subscribe, getCurrent} = useMemo(
    () => getDocumentState(instance, documentId, path),
    [documentId, instance, path],
  )

  return useSyncExternalStore(subscribe, getCurrent)
}
