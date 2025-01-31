import {getDocumentState, resolveDocument} from '@sanity/sdk'
import {type SanityDocument} from '@sanity/types'
import {useCallback, useMemo, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

export function useDocument(documentId: string, path?: string): SanityDocument | null {
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

  return useSyncExternalStore(subscribe, getCurrent) as SanityDocument | null
}
