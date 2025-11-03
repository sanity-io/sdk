import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {type DocumentHandle, type DocumentTypeHandle, type FrameMessage} from '@sanity/sdk'
import {useCallback, useEffect, useMemo, useState} from 'react'

import {useWindowConnection} from '../comlink/useWindowConnection'

interface AssetHandle {
  documentId: string
  type: 'asset'
}

// Figure out what fields are actually necessary
interface CanvasHandle<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DocumentTypeHandle<TDocumentType, TDataset, TProjectId> {
  documentId: string
  type: 'canvas'
}

export type ResourceHandle = (DocumentHandle & {type: 'document'}) | AssetHandle | CanvasHandle

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
      type?: string
    }
    resource: {
      id?: string
      type: 'document' | 'asset' | 'canvas'
    }
    params?: Record<string, string>
  }
}

/**
 * Parameters for the useIntentLink hook
 * @public
 */
interface UseIntentLinkParams {
  intentName?: string
  intentAction?: string
  resourceHandle: ResourceHandle
  params?: Record<string, string>
}

/**
 * Return type for the useIntentLink hook
 * @public
 */
interface IntentLink {
  href?: string
  onClick: () => void
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
 * function IntentLink({documentHandle}) {
 *   const intentLink = useIntentLink({
 *     intentName: 'edit-document',
 *     documentHandle,
 *     params: {view: 'editor'}
 *   })
 *
 *   return (
 *     <a {...intentLink}>Open Intent</a>
 *   )
 * }
 *
 * // Wrap the component with Suspense since the hook may suspend
 * function MyComponent({documentHandle}) {
 *   return (
 *     <Suspense fallback={<Button text="Loading..." disabled />}>
 *       <IntentLink documentHandle={documentHandle} />
 *     </Suspense>
 *   )
 * }
 * ```
 */
export function useIntentLink({
  intentName,
  intentAction,
  resourceHandle,
  params,
}: UseIntentLinkParams): IntentLink {
  const [href, setHref] = useState<string | undefined>()
  const {fetch, sendMessage} = useWindowConnection<IntentMessage, FrameMessage>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
  })

  const data = useMemo(
    () => ({
      ...(intentName && {intentName}),
      ...(intentAction && {intentAction}),
      document: {
        id: resourceHandle.documentId,
        ...('documentType' in resourceHandle && {type: resourceHandle.documentType}),
      },
      resource: {
        ...('projectId' in resourceHandle &&
          'dataset' in resourceHandle && {
            id: `${resourceHandle.projectId}.${resourceHandle.dataset}`,
          }),
        type: resourceHandle.type,
      },
      ...(params && !!Object.keys(params).length && {params}),
    }),
    [intentName, intentAction, resourceHandle, params],
  )

  useEffect(() => {
    if (!fetch || !data.intentName) return

    async function fetchHref() {
      try {
        const res = await fetch<{success: boolean; href?: string}>(
          'dashboard/v1/events/intents/href',
          data,
        )

        if (res.success) {
          setHref(res.href)
        }
      } catch {
        setHref(undefined)
      }
    }

    fetchHref()
  }, [data, fetch])

  const onClick = useCallback(() => {
    try {
      const message: IntentMessage = {
        type: 'dashboard/v1/events/intents/send-intent',
        data,
      }

      sendMessage(message.type, message.data)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to send intent:', error)
      throw error
    }
  }, [data, sendMessage])

  return {
    href,
    onClick,
  }
}
