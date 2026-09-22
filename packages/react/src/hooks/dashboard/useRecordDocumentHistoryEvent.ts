/* eslint-disable react-compiler/react-compiler -- the transport branch in `useRecordDocumentHistoryEvent` is a deliberate rules-of-hooks exception; the compiler refuses files that disable it */
import {
  type CanvasResource,
  type Events,
  type MediaResource,
  SDK_CHANNEL_NAME,
  SDK_NODE_NAME,
  type StudioResource,
} from '@sanity/message-protocol'
import {type DocumentHandle} from '@sanity/sdk'
import {isDashboardEnvironment} from '@sanity/sdk/_internal'
import {type FrameMessage} from '@sanity/sdk/comlink'
import {useCallback} from 'react'

import {useWindowConnection} from '../comlink/useWindowConnection'
import {useEmit} from './useEmit'
import {useTopic} from './useTopic'

interface DocumentInteractionHistory {
  recordEvent: (eventType: 'viewed' | 'edited' | 'created' | 'deleted') => void
}

/**
 * @internal
 */
interface UseRecordDocumentHistoryEventProps extends DocumentHandle {
  resourceType: StudioResource['type'] | MediaResource['type'] | CanvasResource['type']
  /**
   * The resource the document lives in. Optional for studios over Comlink, where the iframe
   * host fills it from context; always required under the message bus, which has no such
   * context and throws when it is missing.
   */
  resourceId?: string
  /**
   * The name of the schema collection this document belongs to.
   * Typically is the name of the workspace when used in the context of a studio.
   */
  schemaName?: string
}

/**
 * @internal
 * Hook for recording document interaction history in a Dashboard application.
 * This hook provides functionality to record document interactions.
 *
 * It works in both Dashboard runtimes and picks the transport for the current one:
 *
 * | Runtime | Transport | `resourceId` | Suspends until |
 * | --- | --- | --- | --- |
 * | iframe | Comlink | optional for studios | the node connects |
 * | federated | message bus | required | capabilities publish |
 *
 * Under the message bus the hook always suspends until the host publishes its capabilities;
 * only once they resolve does `recordEvent` run, and it then no-ops on every call when the
 * host does not provide the `history` capability. There is no synchronous no-op path.
 *
 * @category History
 * @param documentHandle - The document handle containing document ID and type, like `{_id: '123', _type: 'book'}`
 * @returns An object containing:
 * - `recordEvent` - Function to record document interactions
 *
 * @example
 * ```tsx
 * import {useRecordDocumentHistoryEvent} from '@sanity/sdk-react'
 * import {Button} from '@sanity/ui'
 * import {Suspense} from 'react'
 *
 * function RecordEventButton(props: DocumentActionProps) {
 *   const {documentId, documentType, resourceType, resourceId} = props
 *   const {recordEvent} = useRecordDocumentHistoryEvent({
 *     documentId,
 *     documentType,
 *     resourceType,
 *     resourceId,
 *   })
 *   return (
 *     <Button
 *       onClick={() => recordEvent('viewed')}
 *       text="Viewed"
 *     />
 *   )
 * }
 *
 * // Wrap the component with Suspense since the hook may suspend
 * function MyDocumentAction(props: DocumentActionProps) {
 *   return (
 *     <Suspense fallback={<Button text="Loading..." disabled />}>
 *       <RecordEventButton {...props} />
 *     </Suspense>
 *   )
 * }
 * ```
 */
export function useRecordDocumentHistoryEvent(
  props: UseRecordDocumentHistoryEventProps,
): DocumentInteractionHistory {
  // The branch is stable: the transport is fixed for the page lifetime, so one set of hooks
  // always runs and the other never does.
  // eslint-disable-next-line react-hooks/rules-of-hooks -- transport is fixed for the page lifetime
  if (isDashboardEnvironment()) return useBusRecordDocumentHistoryEvent(props)
  // eslint-disable-next-line react-hooks/rules-of-hooks -- transport is fixed for the page lifetime
  return useComlinkRecordDocumentHistoryEvent(props)
}

function useComlinkRecordDocumentHistoryEvent({
  documentId,
  documentType,
  resourceType,
  resourceId,
  schemaName,
}: UseRecordDocumentHistoryEventProps): DocumentInteractionHistory {
  const {sendMessage} = useWindowConnection<Events.HistoryMessage, FrameMessage>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
  })

  if (resourceType !== 'studio' && !resourceId) {
    throw new Error('resourceId is required for media-library and canvas resources')
  }

  const recordEvent = useCallback(
    (eventType: 'viewed' | 'edited' | 'created' | 'deleted') => {
      try {
        const message: Events.HistoryMessage = {
          type: 'dashboard/v1/events/history',
          data: {
            eventType,
            document: {
              id: documentId,
              type: documentType,
              resource: {
                id: resourceId!,
                type: resourceType,
                schemaName,
              },
            },
          },
        }

        sendMessage(message.type, message.data)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to record history event:', error)
        throw error
      }
    },
    [documentId, documentType, resourceId, resourceType, sendMessage, schemaName],
  )

  return {
    recordEvent,
  }
}

function useBusRecordDocumentHistoryEvent({
  documentId,
  documentType,
  resourceType,
  resourceId,
  schemaName,
}: UseRecordDocumentHistoryEventProps): DocumentInteractionHistory {
  const emitActivity = useEmit('applications.activity')
  const capabilities = useTopic('applications.capabilities')

  // The bus host has no iframe context to fill `projectId.dataset` from, so the resource must
  // be addressed explicitly.
  if (!resourceId) {
    throw new Error('resourceId is required to record document history under the message bus')
  }

  // A studio is addressed by its dataset resource over the bus; the workspace name rides along
  // in `schemaName`.
  const type = resourceType === 'studio' ? 'dataset' : resourceType

  const recordEvent = useCallback(
    (eventType: 'viewed' | 'edited' | 'created' | 'deleted') => {
      if (!capabilities.history) return
      emitActivity({
        kind: 'document',
        eventType,
        document: {
          id: documentId,
          type: documentType,
          resource: {id: resourceId, type, schemaName},
        },
      })
    },
    [capabilities.history, documentId, documentType, emitActivity, resourceId, schemaName, type],
  )

  return {recordEvent}
}
