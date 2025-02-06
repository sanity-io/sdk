import {type DocumentEvent, subscribeDocumentEvents} from '@sanity/sdk'
import {useCallback, useEffect, useInsertionEffect, useRef} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/** @beta */
export function useDocumentEvent(handler: (documentEvent: DocumentEvent) => void): void {
  const ref = useRef(handler)

  useInsertionEffect(() => {
    ref.current = handler
  })

  const stableHandler = useCallback((documentEvent: DocumentEvent) => {
    return ref.current(documentEvent)
  }, [])

  const instance = useSanityInstance()
  useEffect(() => {
    return subscribeDocumentEvents(instance, stableHandler)
  }, [instance, stableHandler])
}
