import {useContext} from 'react'
import {type DocumentPreviewStore} from 'sanity'

import {SDKContext} from '../../context/ExampleContext'

export function useDocumentPreviewStore(): DocumentPreviewStore {
  const context = useContext(SDKContext)
  if (context === undefined) {
    throw new Error('useDocumentPreviewStore must be used within a SDKPreviewProvider')
  }
  return context.documentPreviewStore
}
