import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {type DocumentHandle, type FrameMessage} from '@sanity/sdk'
import {useCallback} from 'react'

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
  sendIntent: () => void
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
export function useSendIntent(params: UseSendIntentParams): SendIntent {
  const {intentName, documentHandle, params: intentParams} = params
  const {sendMessage} = useWindowConnection<IntentMessage, FrameMessage>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
  })

  const sendIntent = useCallback(() => {
    try {
      const {projectId, dataset} = documentHandle

      const message: IntentMessage = {
        type: 'dashboard/v1/events/intents/send-intent',
        data: {
          ...(intentName ? {intentName} : {}),
          ...{
            document: {
              id: documentHandle.documentId,
              type: documentHandle.documentType,
            },
            resource: {
              id: `${projectId}.${dataset}`,
            },
          },
          ...(intentParams && Object.keys(intentParams).length > 0 ? {params: intentParams} : {}),
        },
      }

      sendMessage(message.type, message.data)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to send intent:', error)
      throw error
    }
  }, [intentName, documentHandle, intentParams, sendMessage])

  return {
    sendIntent,
  }
}
