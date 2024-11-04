import {type PreviewValue} from '@sanity/types'
import {type ElementType, type ReactNode, useEffect, useMemo, useState} from 'react'
import {getPreviewStateObservable} from 'sanity' // this should NOT be installed from the sanity package -- we should make our own affordances in SDK

import {useSchema} from '../schema/useSchema'
import type {PreviewState} from './types'
import {useDocumentPreviewStore} from './useDocumentPreviewStore'

export interface PreviewHookOptions {
  documentId: string
  documentType: string
}

interface PreviewHookValue {
  isLoading: boolean | undefined
  value: Partial<PreviewValue> | null
}

/** @internal */
export function useDocumentPreviewValuesSDK(options: PreviewHookOptions): PreviewHookValue {
  const {documentId, documentType} = options
  const schemaType = useSchema().get(documentType)
  const documentPreviewStore = useDocumentPreviewStore()
  const [state, setState] = useState<PreviewState>({
    draft: null,
    published: null,
    isLoading: true,
  })

  const previewStateObservable = useMemo(() => {
    if (!schemaType) {
      throw new Error(`Schema type not found: ${documentType}`)
    }
    return getPreviewStateObservable(documentPreviewStore, schemaType, documentId, '')
  }, [documentPreviewStore, schemaType, documentId])

  // Set up subscription to preview state changes
  useEffect(() => {
    const subscription = previewStateObservable.subscribe((newState) => {
      setState(newState)
    })

    return () => subscription.unsubscribe()
  }, [previewStateObservable])

  const {draft, published, isLoading} = state

  const value = useMemo(
    () => ({
      title: (draft?.title || published?.title) as string | undefined,
      subtitle: (draft?.subtitle || published?.subtitle) as string | undefined,
      description: (draft?.description || published?.description) as string | undefined,
      media: (draft?.media || published?.media) as ReactNode | ElementType | undefined,
    }),
    [draft, published],
  )

  return {
    isLoading,
    value,
  }
}
