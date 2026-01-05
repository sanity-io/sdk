import {type Events, SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {type FrameMessage} from '@sanity/sdk'
import {useCallback, useEffect, useRef} from 'react'

import {useWindowConnection} from '../comlink/useWindowConnection'

/**
 * @public
 */
export interface AgentResourceContextOptions {
  /**
   * The project ID of the current context
   */
  projectId: string
  /**
   * The dataset of the current context
   */
  dataset: string
  /**
   * Optional document ID if the user is viewing/editing a specific document
   */
  documentId?: string
}

/**
 * @public
 * Hook for emitting agent resource context updates to the Dashboard.
 * This allows the Agent to understand what resource the user is currently
 * interacting with (e.g., which document they're editing).
 *
 * The hook will automatically emit the context when it changes, and also
 * emit the initial context when the hook is first mounted.
 *
 * @category Agent
 * @param options - The resource context options containing projectId, dataset, and optional documentId
 *
 * @example
 * ```tsx
 * import {useAgentResourceContext} from '@sanity/sdk-react'
 *
 * function MyComponent() {
 *   const documentId = 'my-document-id'
 *
 *   // Automatically updates the Agent's context whenever the document changes
 *   useAgentResourceContext({
 *     projectId: 'my-project',
 *     dataset: 'production',
 *     documentId,
 *   })
 *
 *   return <div>Editing document: {documentId}</div>
 * }
 * ```
 */
export function useAgentResourceContext(options: AgentResourceContextOptions): void {
  const {projectId, dataset, documentId} = options
  const {sendMessage} = useWindowConnection<Events.AgentResourceUpdateMessage, FrameMessage>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
  })

  // Track the last sent context to avoid duplicate updates
  const lastContextRef = useRef<string | null>(null)

  const updateContext = useCallback(() => {
    // Validate required fields
    if (!projectId || !dataset) {
      // eslint-disable-next-line no-console
      console.warn('[useAgentResourceContext] projectId and dataset are required', {
        projectId,
        dataset,
      })
      return
    }

    // Create a stable key for the current context
    const contextKey = `${projectId}:${dataset}:${documentId || ''}`

    // Skip if context hasn't changed
    if (lastContextRef.current === contextKey) {
      return
    }

    try {
      const message: Events.AgentResourceUpdateMessage = {
        type: 'dashboard/v1/events/agent/resource/update',
        data: {
          projectId,
          dataset,
          documentId,
        },
      }

      sendMessage(message.type, message.data)
      lastContextRef.current = contextKey
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[useAgentResourceContext] Failed to update context:', error)
    }
  }, [projectId, dataset, documentId, sendMessage])

  // Update context whenever it changes
  useEffect(() => {
    updateContext()
  }, [updateContext])
}
