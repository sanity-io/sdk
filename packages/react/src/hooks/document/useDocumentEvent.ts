import {type DocumentEvent, subscribeDocumentEvents} from '@sanity/sdk'
import {useEffect, useInsertionEffect, useRef} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

export function useDocumentEvent(handler: (documentEvent: DocumentEvent) => void): void {
  const ref = useRef(handler)

  useInsertionEffect(() => {
    ref.current = handler
  })

  const instance = useSanityInstance()
  useEffect(() => {
    return subscribeDocumentEvents(instance, ref.current)
  }, [instance])
}
