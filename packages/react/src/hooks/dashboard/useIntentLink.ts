import {type DocumentHandle} from '@sanity/sdk'
import {useCallback, useMemo} from 'react'

import {getIframeParentUrl, isInIframe} from '../../components/utils'
import {useDashboardOrganizationId} from '../auth/useDashboardOrganizationId'
import {useIntentButton} from './useIntentButton'

/**
 * Parameters for the useIntentLink hook
 * @public
 */
interface UseIntentLinkParams {
  intentName: string
  documentHandle?: DocumentHandle
  params?: Record<string, string>
}

/**
 * Return type for the useIntentLink hook
 * @public
 */
interface IntentLink {
  href: string
  onClick: (e: React.MouseEvent<HTMLElement>) => void
}

/**
 * @public
 *
 * A hook for sending intent messages to the Dashboard with a document handle.
 * This allows applications to signal intent for specific documents to the Dashboard.
 *
 * @param params - Object containing:
 *   - `intentName` - Optional specific name of the intent to send
 *   - `documentHandle` - The document handle containing document ID, type, project ID and dataset, like `{documentId: '123', documentType: 'book', projectId: 'abc123', dataset: 'production'}`
 *   - `params` - Optional parameters to include in the intent
 * @returns An object containing:
 * - `sendIntent` - Function to send the intent message
 *
 * @example
 * ```tsx
 * import {useIntentLink} from '@sanity/sdk-react'
 * import {Suspense} from 'react'
 *
 * function IntentLink({documentId, documentType, projectId, dataset}) {
 *   const {href, onClick} = useIntentLink({
 *     intentName: 'edit-document',
 *     documentHandle: {documentId, documentType, projectId, dataset},
 *     params: {view: 'editor'}
 *   })
 *
 *   return (
 *     <a href={href} onClick={onClick}>Open Intent</a>
 *   )
 * }
 *
 * // Wrap the component with Suspense since the hook may suspend
 * function MyComponent({documentId, documentType, projectId, dataset}) {
 *   return (
 *     <Suspense fallback={<Button text="Loading..." disabled />}>
 *       <IntentLink
 *         documentId={documentId}
 *         documentType={documentType}
 *         projectId={projectId}
 *         dataset={dataset}
 *       />
 *     </Suspense>
 *   )
 * }
 * ```
 */
export function useIntentLink({
  intentName,
  documentHandle,
  params,
}: UseIntentLinkParams): IntentLink {
  const orgId = useDashboardOrganizationId()
  const {onClick: intentButtonClick} = useIntentButton({intentName, documentHandle, params})

  const href = useMemo(() => {
    if (!orgId) {
      return ''
    }

    const base = isInIframe() ? getIframeParentUrl() : ''
    const documentParams = documentHandle
      ? Object.keys(documentHandle)
          .map((key) => `${key}=${documentHandle[key as keyof DocumentHandle]}`)
          .join('&')
      : null
    const payloadParams = params ? `payload=${encodeURIComponent(JSON.stringify({params}))}` : null
    const searchParams = [
      ...(documentParams ? [documentParams] : []),
      ...(payloadParams ? [payloadParams] : []),
    ].join('&')

    return `${base}@${orgId}/intent/${intentName}${searchParams ? `?${searchParams}` : ''}`
  }, [orgId, documentHandle, intentName, params])

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) {
        return
      }

      e.preventDefault()
      intentButtonClick()
    },
    [intentButtonClick],
  )

  return {
    href,
    onClick,
  }
}
