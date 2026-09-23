/* eslint-disable react-compiler/react-compiler -- the transport branch in `useAgentResourceContext` is a deliberate rules-of-hooks exception; the compiler refuses files that disable it */
import {type Events, SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {isDashboardEnvironment} from '@sanity/sdk/_internal'
import {type FrameMessage} from '@sanity/sdk/comlink'
import {type ApplicationContext} from '@sanity/sdk/dashboard'
import {useCallback, useEffect, useMemo, useRef} from 'react'

import {useWindowConnection} from '../comlink/useWindowConnection'
import {useApplicationContext} from './useApplicationContext'

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
 * Hook for reporting the resource the user is currently interacting with (for example, which
 * document they're editing) so the Agent can understand their context. The hook reports on mount
 * and again whenever the context changes.
 *
 * The two Dashboard runtimes differ in transport, but the signature is the same:
 * - In an iframe (Comlink), it emits the `dashboard/v1/events/agent/resource/update` event.
 * - In a federated app (message bus), it publishes {@link useApplicationContext}'s
 *   `applications.context.update` topic. Reach for `useApplicationContext` directly in new code.
 *
 * @category Agent
 * @param options - The resource context options containing projectId, dataset, and optional documentId
 *
 * @example
 * ```tsx
 * import {useAgentResourceContext} from '@sanity/sdk-react/dashboard'
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
  // The branch is stable: the transport is fixed for the page lifetime, so one set of hooks
  // always runs and the other never does.
  // eslint-disable-next-line react-hooks/rules-of-hooks -- transport is fixed for the page lifetime
  if (isDashboardEnvironment()) return useBusAgentResourceContext(options)
  // eslint-disable-next-line react-hooks/rules-of-hooks -- transport is fixed for the page lifetime
  return useComlinkAgentResourceContext(options)
}

function useBusAgentResourceContext({projectId, dataset, documentId}: AgentResourceContextOptions) {
  const context = useMemo<ApplicationContext | null>(
    () =>
      projectId && dataset
        ? {
            resource: {id: `${projectId}.${dataset}`, type: 'dataset'},
            document: documentId ? {id: documentId} : null,
          }
        : null,
    [projectId, dataset, documentId],
  )
  useApplicationContext(context)
}

function useComlinkAgentResourceContext(options: AgentResourceContextOptions): void {
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
