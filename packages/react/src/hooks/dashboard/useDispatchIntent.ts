import {type Events, SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {type DocumentHandle} from '@sanity/sdk'
import {useCallback} from 'react'

import {useWindowConnection} from '../comlink/useWindowConnection'

// TODO: Figure out if all document handle properties should be required

/**
 * @public
 * @category Types
 */
export interface DispatchIntent {
  dispatchIntent: () => void
}

/**
 * @public
 *
 * Hook that provides a function to open a list of intents in the Dashboard.
 *
 * @category Intents
 * @param documentHandle - The document handle to filter available intents by
 * @param intentName - Optional intent name for direct linking
 * @returns An object containing:
 * - `dispatchIntent` - Function that when called will open the list of intents
 *
 * @example
 * ```tsx
 * import {useDispatchIntent, type DocumentHandle} from '@sanity/sdk-react'
 * import {Button} from '@sanity/ui'
 *
 * function NavigateButton({documentHandle}: {documentHandle: DocumentHandle}) {
 *   const {dispatchIntent} = useDispatchIntent(documentHandle, 'editDocument')
 *   return (
 *     <Button
 *       onClick={dispatchIntent}
 *       text="Open document"
 *     />
 *   )
 * }
 * ```
 */
export function useDispatchIntent(
  documentHandle: DocumentHandle,
  intentName?: string | null,
): DispatchIntent {
  const {sendMessage} = useWindowConnection<Events.IntentMessage, never>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
  })

  const dispatchIntent = useCallback(() => {
    const {documentId, documentType, projectId, dataset} = documentHandle

    const message: Events.IntentMessage = {
      type: 'dashboard/v1/events/intents/open',
      data: {
        document: {
          id: documentId,
          type: documentType,
        },
        resource: {
          projectId,
          dataset,
        },
        intentName,
      },
    }

    sendMessage(message.type, message.data)
  }, [documentHandle, intentName, sendMessage])

  return {
    dispatchIntent,
  }
}
