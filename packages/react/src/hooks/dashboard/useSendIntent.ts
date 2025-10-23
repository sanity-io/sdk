import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {type DocumentHandle, type FrameMessage} from '@sanity/sdk'
import {useCallback, useMemo} from 'react'

import {getIframeParentUrl, isInIframe} from '../../components/utils'
import {useDashboardOrganizationId} from '../auth/useDashboardOrganizationId'
import {useWindowConnection} from '../comlink/useWindowConnection'

/**
 * Message type for sending intents to the dashboard
 * @internal
 */
export interface IntentMessage {
  type: 'dashboard/v1/events/intents/send-intent'
  data: {
    intentName?: string
    document: {
      id: string
      type: string
    }
    resource?: {
      id: string
    }
    params?: Record<string, string>
  }
}

/**
 * Return type for the useSendIntent hook
 * @public
 */
interface SendIntent {
  sendIntent: (e: React.MouseEvent<HTMLElement>) => void
  href?: string
}

/**
 * Parameters for the useSendIntent hook
 * @public
 */
interface UseSendIntentParams {
  intentName?: string
  documentHandle: DocumentHandle
  params?: Record<string, string>
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
 * import {useSendIntent} from '@sanity/sdk-react'
 * import {Button} from '@sanity/ui'
 * import {Suspense} from 'react'
 *
 * function SendIntentButton({documentId, documentType, projectId, dataset}) {
 *   const {sendIntent} = useSendIntent({
 *     intentName: 'edit-document',
 *     documentHandle: {documentId, documentType, projectId, dataset},
 *     params: {view: 'editor'}
 *   })
 *
 *   return (
 *     <Button
 *       onClick={() => sendIntent()}
 *       text="Send Intent"
 *     />
 *   )
 * }
 *
 * // Wrap the component with Suspense since the hook may suspend
 * function MyComponent({documentId, documentType, projectId, dataset}) {
 *   return (
 *     <Suspense fallback={<Button text="Loading..." disabled />}>
 *       <SendIntentButton
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
export function useSendIntent({
  intentName,
  documentHandle,
  params,
}: UseSendIntentParams): SendIntent {
  const orgId = useDashboardOrganizationId()

  const {sendMessage} = useWindowConnection<IntentMessage, FrameMessage>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
  })

  const href = useMemo(() => {
    const {documentId, documentType, projectId, dataset} = documentHandle

    if (!orgId || !documentId || !documentType) {
      return undefined
    }

    const base = isInIframe() ? getIframeParentUrl() : ''
    const queryParams = new URLSearchParams(params).toString()
    return `${base}@${orgId}/intents/${projectId}/${dataset}/${documentId}/${documentType}${intentName ? `/${intentName}` : ''}${queryParams ? `?${queryParams}` : ''}`
  }, [orgId, documentHandle, intentName, params])

  const sendIntent = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault()

      try {
        const {documentId, documentType, projectId, dataset} = documentHandle

        const message: IntentMessage = {
          type: 'dashboard/v1/events/intents/send-intent',
          data: {
            document: {
              id: documentId,
              type: documentType,
            },
            resource: {
              id: `${projectId}.${dataset}`,
            },
            ...(intentName && {intentName}),
            ...(params && !!Object.keys(params).length && {params}),
          },
        }

        sendMessage(message.type, message.data)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to send intent:', error)
        throw error
      }
    },
    [intentName, documentHandle, params, sendMessage],
  )

  return {
    sendIntent,
    href,
  }
}
