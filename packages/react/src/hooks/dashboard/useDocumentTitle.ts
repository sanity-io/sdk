import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {useEffect, useState} from 'react'

import {useWindowConnection} from '../comlink/useWindowConnection'

interface ContextResource {
  type: string
  title?: string
  manifest?: {
    title?: string
  } | null
  activeDeployment?: {
    manifest?: {
      title?: string
    } | null
  } | null
}

interface ContextResponse {
  context: {
    resource: ContextResource
  }
}

function resolveAppTitle(resource: ContextResource): string | undefined {
  return resource.manifest?.title ?? resource.activeDeployment?.manifest?.title ?? resource.title
}

/**
 * Sets the browser's document title, automatically including the app's name
 * from the manifest.
 *
 * This follows the same convention as Sanity Studio workspaces, where the
 * workspace name is always present in the title:
 *
 * - With a view title: `<viewTitle> | <appTitle>`
 * - Without a view title: `<appTitle>`
 *
 * The Sanity dashboard appends `| Sanity` to produce the final browser tab title.
 *
 * @param viewTitle - An optional view-specific title to prepend to the app title.
 *
 * @example
 * ```tsx
 * import {useDocumentTitle} from '@sanity/sdk-react'
 *
 * function MoviesList() {
 *   useDocumentTitle('Movies')
 *   return <div>...</div>
 * }
 *
 * // Browser tab: "Movies | My App | Sanity"
 * ```
 *
 * @example
 * ```tsx
 * // Call without arguments to show just the app title
 * function AppRoot() {
 *   useDocumentTitle()
 *   return <Outlet />
 * }
 *
 * // Browser tab: "My App | Sanity"
 * ```
 *
 * @public
 */
export function useDocumentTitle(viewTitle?: string): void {
  const [appTitle, setAppTitle] = useState<string | null>(null)

  const {fetch} = useWindowConnection({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
  })

  useEffect(() => {
    if (!fetch) return

    const controller = new AbortController()

    async function fetchAppTitle(signal: AbortSignal) {
      try {
        const data = await fetch<ContextResponse>('dashboard/v1/context', undefined, {signal})
        const title = resolveAppTitle(data.context.resource)
        if (title) {
          setAppTitle(title)
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return
      }
    }

    fetchAppTitle(controller.signal)

    return () => {
      controller.abort()
    }
  }, [fetch])

  useEffect(() => {
    if (!appTitle) return

    document.title = viewTitle ? `${viewTitle} | ${appTitle}` : appTitle
  }, [viewTitle, appTitle])
}
