import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {type DocumentHandle, type FrameMessage} from '@sanity/sdk'
import {useCallback} from 'react'

import {useWindowConnection} from '../comlink/useWindowConnection'

/**
 * Message type for sending intents to the dashboard
 */
interface IntentMessage {
  type: 'dashboard/v1/events/intents/dispatch-intent'
  data: {
    action?: 'edit'
    intentId?: string
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
 * Return type for the useDispatchIntent hook
 * @beta
 */
interface DispatchIntent {
  dispatchIntent: () => void
}

/**
 * Parameters for the useDispatchIntent hook
 * @beta
 */
type UseDispatchIntentParams =
  | {
      action: 'edit'
      intentId?: never
      documentHandle: DocumentHandle
      params?: Record<string, string>
    }
  | {
      action?: never
      intentId: string
      documentHandle: DocumentHandle
      params?: Record<string, string>
    }

/**
 * @beta
 *
 * A hook for dispatching intent messages to the Dashboard with a document handle.
 * This allows applications to signal intent to navigate to applications that can perform specific actions on a document.
 *
 * @param params - Object containing:
 *   - `action` - Action to perform (currently only 'edit' is supported). Will prompt a picker if multiple handlers are available.
 *   - `intentId` - Specific ID of the intent to dispatch. Either `action` or `intentId` is required.
 *   - `documentHandle` - The document handle containing document ID, type, project ID and dataset, like `{documentId: '123', documentType: 'book', projectId: 'abc123', dataset: 'production'}`
 *   - `params` - Optional parameters to include in the dispatch and passed to the intent handler
 * @returns An object containing:
 * - `dispatchIntent` - Function to dispatch the intent message
 *
 * @example
 * ```tsx
 * import {useDispatchIntent} from '@sanity/sdk-react'
 * import {Button} from '@sanity/ui'
 * import {Suspense} from 'react'
 *
 * function DispatchIntentButton({documentId, documentType, projectId, dataset}) {
 *   const {dispatchIntent} = useDispatchIntent({
 *     action: 'edit',
 *     documentHandle: {documentId, documentType, projectId, dataset},
 *   })
 *
 *   return (
 *     <Button
 *       onClick={() => dispatchIntent()}
 *       text="Dispatch Intent"
 *     />
 *   )
 * }
 *
 * // Wrap the component with Suspense since the hook may suspend
 * function MyDocumentAction({documentId, documentType, projectId, dataset}) {
 *   return (
 *     <Suspense fallback={<Button text="Loading..." disabled />}>
 *       <DispatchIntentButton
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
export function useDispatchIntent(params: UseDispatchIntentParams): DispatchIntent {
  const {action, intentId, documentHandle, params: intentParams} = params
  const {sendMessage} = useWindowConnection<IntentMessage, FrameMessage>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
  })

  const dispatchIntent = useCallback(() => {
    try {
      // Validate that either action or intentId is provided
      if (!action && !intentId) {
        throw new Error('useDispatchIntent: Either `action` or `intentId` must be provided.')
      }

      const {projectId, dataset} = documentHandle

      // Warn if both action and intentId are provided (shouldn't happen with TypeScript, but handle runtime case)
      if (action && intentId) {
        // eslint-disable-next-line no-console -- warn if both action and intentId are provided
        console.warn(
          'useDispatchIntent: Both `action` and `intentId` were provided. Using `intentId` and ignoring `action`.',
        )
      }

      const message: IntentMessage = {
        type: 'dashboard/v1/events/intents/dispatch-intent',
        data: {
          ...(action && !intentId ? {action} : {}),
          ...(intentId ? {intentId} : {}),
          document: {
            id: documentHandle.documentId,
            type: documentHandle.documentType,
          },
          resource: {
            id: `${projectId}.${dataset}`,
          },
          ...(intentParams && Object.keys(intentParams).length > 0 ? {params: intentParams} : {}),
        },
      }

      sendMessage(message.type, message.data)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to dispatch intent:', error)
      throw error
    }
  }, [action, intentId, documentHandle, intentParams, sendMessage])

  return {
    dispatchIntent,
  }
}
