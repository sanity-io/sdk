import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {type DocumentHandle, type FrameMessage} from '@sanity/sdk'
import {useCallback} from 'react'

import {useWindowConnection} from '../comlink/useWindowConnection'
import {useResourceIdFromDocumentHandle} from './utils/useResourceIdFromDocumentHandle'

/**
 * Message type for sending intents to the dashboard
 * @beta
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
      type?: 'media-library' | 'canvas'
    }
    parameters?: Record<string, unknown>
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
interface UseDispatchIntentParams {
  action?: 'edit'
  intentId?: string
  documentHandle: DocumentHandle
  parameters?: Record<string, unknown>
}

/**
 * @beta
 *
 * A hook for dispatching intent messages to the Dashboard with a document handle.
 * This allows applications to signal their intent to pass the referenced document to other applications that have registered the ability to perform specific actions on that document.
 *
 * @param params - Object containing:
 *   - `action` - Action to perform (currently only 'edit' is supported). Will prompt a picker if multiple handlers are available.
 *   - `intentId` - Specific ID of the intent to dispatch. Either `action` or `intentId` is required.
 *   - `documentHandle` - The document handle containing document ID, type, and either:
 *     - `projectId` and `dataset` for traditional dataset sources, like `{documentId: '123', documentType: 'book', projectId: 'abc123', dataset: 'production'}`
 *     - `source` for media library, canvas, or dataset sources, like `{documentId: '123', documentType: 'sanity.asset', source: mediaLibrarySource('ml123')}` or `{documentId: '123', documentType: 'sanity.canvas.document', source: canvasSource('canvas123')}`
 *   - `paremeters` - Optional parameters to include in the dispatch; will be passed to the resolved intent handler
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
  const {action, intentId, documentHandle, parameters} = params
  const {sendMessage} = useWindowConnection<IntentMessage, FrameMessage>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
  })

  const resource = useResourceIdFromDocumentHandle(documentHandle)

  const dispatchIntent = useCallback(() => {
    try {
      if (!action && !intentId) {
        throw new Error('useDispatchIntent: Either `action` or `intentId` must be provided.')
      }

      const {projectId, dataset, sourceName} = documentHandle

      if (action && intentId) {
        // eslint-disable-next-line no-console -- warn if both action and intentId are provided
        console.warn(
          'useDispatchIntent: Both `action` and `intentId` were provided. Using `intentId` and ignoring `action`.',
        )
      }

      if (!sourceName && (!projectId || !dataset)) {
        throw new Error(
          'useDispatchIntent: Either `source` or both `projectId` and `dataset` must be provided in documentHandle.',
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
            id: resource.id,
            ...(resource.type ? {type: resource.type} : {}),
          },
          ...(parameters && Object.keys(parameters).length > 0 ? {parameters} : {}),
        },
      }

      sendMessage(message.type, message.data)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to dispatch intent:', error)
      throw error
    }
  }, [action, intentId, documentHandle, parameters, sendMessage, resource.id, resource.type])

  return {
    dispatchIntent,
  }
}
