import type {ReactNode} from 'react'

import {
  type PreviewHookOptions,
  useDocumentPreviewValuesSDK,
} from '../../../hooks/preview/useDocumentPreviewValues'
import {DefaultPreview} from '../DefaultPreview/DefaultPreview'

/**
 * @public
 * This preview is intended for to be used alone -- likely if we're previewing a number of documents,
 * we should make a different component to make querying, etc. more efficient
 */
export function StandalonePreview(props: PreviewHookOptions): ReactNode {
  const {value, isLoading} = useDocumentPreviewValuesSDK(props)
  return <DefaultPreview {...value} isPlaceholder={isLoading} />
}
