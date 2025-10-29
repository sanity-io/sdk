import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {type DocumentHandle, type FrameMessage} from '@sanity/sdk'
import {useCallback} from 'react'

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
    document?: {
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
 * Parameters for the useIntentTrigger hook
 * @public
 */
interface IntentTriggerParams {
  documentHandle?: DocumentHandle
  params?: Record<string, string>
}

interface IntentLinkParams extends IntentTriggerParams {
  intentName: string
}

/**
 * Return type for the useIntentTrigger hook
 * @public
 */
interface IntentTrigger {
  intentLink: (props: IntentLinkParams) => {
    href: string
    onClick: (e: React.MouseEvent<HTMLElement>) => void
  }
  intentButton: (props: IntentTriggerParams) => {
    onClick: () => void
  }
}

function getIntentHref(
  base: string,
  {intentName, documentHandle, params}: IntentLinkParams,
): string {
  const queryParams = documentHandle
    ? Object.keys(documentHandle)
        .map((key) => `${key}=${documentHandle[key as keyof DocumentHandle]}`)
        .join('&')
    : null
  const payload = params ? encodeURIComponent(JSON.stringify({params})) : null

  return `${base}/intent/${intentName}${queryParams ? `?${queryParams}` : ''}${payload ? `&payload=${payload}` : ''}`
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
export function useIntentTrigger(): IntentTrigger {
  const orgId = useDashboardOrganizationId()

  const {sendMessage} = useWindowConnection<IntentMessage, FrameMessage>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
  })

  const onClick = useCallback(
    ({documentHandle, intentName, params}: IntentTriggerParams & {intentName?: string}) => {
      try {
        const message: IntentMessage = {
          type: 'dashboard/v1/events/intents/send-intent',
          data: {
            ...(documentHandle && {
              document: {
                id: documentHandle.documentId,
                type: documentHandle.documentType,
              },
              resource: {
                id: `${documentHandle.projectId}.${documentHandle.dataset}`,
              },
            }),
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
    [sendMessage],
  )

  const intentLink = useCallback(
    (params: IntentLinkParams) => {
      // const href = getHref(params)
      const hrefBase = `${isInIframe() ? getIframeParentUrl() : ''}@${orgId}`

      return {
        href: getIntentHref(hrefBase, params),
        onClick: (e: React.MouseEvent<HTMLElement>) => {
          if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) {
            return
          }

          e.preventDefault()
          onClick(params)
        },
      }
    },
    [orgId, onClick],
  )

  return {
    intentLink,
    intentButton: (params) => ({
      onClick: () => onClick(params),
    }),
  }
}
