import {
  type Bridge,
  SDK_CHANNEL_NAME,
  SDK_NODE_NAME,
  type StudioResource,
} from '@sanity/message-protocol'
import {type DocumentHandle} from '@sanity/sdk'
import {useCallback, useMemo} from 'react'

import {useWindowConnection} from '../comlink/useWindowConnection'
import {useStudioWorkspacesByProjectIdDataset} from './useStudioWorkspacesByProjectIdDataset'

/**
 * Deployment and manifest information for a resolved studio workspace.
 *
 * @public
 * @category Types
 */
export interface WorkspaceInfo {
  /** Unique workspace identifier */
  id: string
  /** Workspace name */
  name: string
  /** Human-readable workspace title */
  title: string
  /** Workspace URL */
  url: string
  /** Base path within the studio */
  basePath: string
  /** Whether this workspace is deployed and reachable */
  isDeployed: boolean
  /** Whether the studio manifest has been loaded (projectId/dataset resolved) */
  hasManifest: boolean
  /** Whether schema information is available */
  hasSchema: boolean
  /** Hosting type: 'internal' (Sanity-hosted) or 'external' (self-hosted) */
  urlType: 'internal' | 'external'
}

/**
 * Status of the workspace resolution for navigation.
 *
 * - `'ready'` — A deployed workspace with a loaded manifest was found
 * - `'no-workspace'` — No workspace matches the given projectId:dataset
 * - `'no-manifest'` — Workspace found but manifest not loaded (can't match to documents)
 * - `'not-deployed'` — Internal workspace exists but has no active deployment
 * - `'multiple-workspaces'` — Multiple workspaces match and no preferred URL was given
 *
 * @public
 * @category Types
 */
export type NavigateToStudioDocumentStatus =
  | 'ready'
  | 'no-workspace'
  | 'no-manifest'
  | 'not-deployed'
  | 'multiple-workspaces'

/**
 * @public
 * @category Types
 */
export interface NavigateToStudioResult {
  /** Function that when called will navigate to the studio document via the Dashboard bridge (smoother in-dashboard UX) */
  navigateToStudioDocument: () => void
  /**
   * Full absolute URL to the document in the studio.
   * Use for `<a href>`, copy-to-clipboard, or open-in-new-tab.
   * `null` when no workspace is resolved.
   */
  href: string | null
  /**
   * Whether a navigation target was resolved. Use this to disable buttons/links.
   * `true` when status is `'ready'` or `'multiple-workspaces'` (first workspace is used).
   */
  hasTarget: boolean
  /** The resolved workspace that will be navigated to, or null if none found */
  workspace: WorkspaceInfo | null
  /** All workspaces matching the projectId:dataset */
  workspaces: WorkspaceInfo[]
  /** Detailed status of the workspace resolution */
  status: NavigateToStudioDocumentStatus
}

/**
 * Determines whether a studio workspace is deployed based on its hosting type
 * and active deployment status.
 *
 * - Internal studios (Sanity-hosted): deployed if `activeDeployment` is present
 * - External studios (self-hosted): always considered deployed (registered = deployed)
 */
function isWorkspaceDeployed(resource: StudioResource): boolean {
  if (resource.urlType === 'internal') {
    return resource.activeDeployment !== null
  }
  // External studios: the fact that they appear in availableResources
  // means they were registered. hasManifest is a reachability signal,
  // but not a deployment signal.
  return true
}

/**
 * Maps a StudioResource from the bridge protocol to the public WorkspaceInfo shape.
 */
function toWorkspaceInfo(resource: StudioResource): WorkspaceInfo {
  return {
    id: resource.id,
    name: resource.name,
    title: resource.title,
    url: resource.url,
    basePath: resource.basePath,
    isDeployed: isWorkspaceDeployed(resource),
    hasManifest: resource.hasManifest,
    hasSchema: resource.hasSchema,
    urlType: resource.urlType,
  }
}

/**
 * Derives the navigation status from the resolved workspace and all matching workspaces.
 */
function deriveStatus(
  workspace: WorkspaceInfo | null,
  workspaces: WorkspaceInfo[],
  hasPreferredUrl: boolean,
): NavigateToStudioDocumentStatus {
  if (!workspace && workspaces.length === 0) {
    return 'no-workspace'
  }

  if (!workspace && workspaces.length > 0) {
    // Had workspaces but none matched the preferred URL
    return 'no-workspace'
  }

  if (workspace && !workspace.isDeployed) {
    return 'not-deployed'
  }

  if (workspace && !workspace.hasManifest) {
    return 'no-manifest'
  }

  if (workspaces.length > 1 && !hasPreferredUrl) {
    return 'multiple-workspaces'
  }

  return 'ready'
}

/**
 * @public
 *
 * Hook that provides a function to navigate to a given document in its parent Studio,
 * along with workspace deployment and manifest status.
 *
 * Uses the `projectId` and `dataset` properties of the {@link DocumentHandle} you provide to resolve the correct Studio.
 * This will only work if you have deployed a studio with a workspace with this `projectId` / `dataset` combination.
 *
 * @remarks If you write your own Document Handle to pass to this hook (as opposed to a Document Handle generated by another hook),
 * it must include values for `documentId`, `documentType`, `projectId`, and `dataset`.
 *
 * @category Documents
 * @param documentHandle - The document handle for the document to navigate to
 * @param preferredStudioUrl - The preferred studio url to navigate to if you have multiple
 * studios with the same projectId and dataset
 * @returns An object containing:
 * - `navigateToStudioDocument` - Function that navigates via the Dashboard bridge (in-dashboard UX)
 * - `href` - Full absolute URL to the document in the studio (for `<a>` tags, copy-to-clipboard)
 * - `hasTarget` - Whether a navigation target was resolved (use to disable buttons/links)
 * - `workspace` - The resolved workspace info, or null if none found
 * - `workspaces` - All workspaces matching the projectId:dataset
 * - `status` - Detailed status ('ready', 'no-workspace', 'no-manifest', 'not-deployed', 'multiple-workspaces')
 *
 * @example Simple button with hasTarget
 * ```tsx
 * function EditButton({documentHandle}: {documentHandle: DocumentHandle}) {
 *   const {navigateToStudioDocument, hasTarget} = useNavigateToStudioDocument(documentHandle)
 *   return <Button onClick={navigateToStudioDocument} disabled={!hasTarget} text="Edit in Studio" />
 * }
 * ```
 *
 * @example Link with href
 * ```tsx
 * function EditLink({documentHandle}: {documentHandle: DocumentHandle}) {
 *   const {href, hasTarget} = useNavigateToStudioDocument(documentHandle)
 *   if (!hasTarget) return null
 *   return <a href={href!}>Edit in Studio</a>
 * }
 * ```
 *
 * @example Detailed status handling
 * ```tsx
 * function NavigateButton({documentHandle}: {documentHandle: DocumentHandle}) {
 *   const {navigateToStudioDocument, status} = useNavigateToStudioDocument(documentHandle)
 *
 *   if (status === 'no-workspace') return <Button text="No studio found" disabled />
 *   if (status === 'not-deployed') return <Button text="Studio not deployed" disabled />
 *   if (status === 'no-manifest') return <Button text="Studio manifest not loaded" disabled />
 *
 *   return <Button onClick={navigateToStudioDocument} text="Edit in Studio" />
 * }
 * ```
 */
export function useNavigateToStudioDocument(
  documentHandle: DocumentHandle,
  preferredStudioUrl?: string,
): NavigateToStudioResult {
  const {workspacesByProjectIdAndDataset} = useStudioWorkspacesByProjectIdDataset()
  const {sendMessage} = useWindowConnection<Bridge.Navigation.NavigateToResourceMessage, never>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
  })

  const {projectId, dataset, documentId, documentType} = documentHandle

  const intentPath = `/intent/edit/id=${documentId};type=${documentType}`

  const {workspace, workspaces, status} = useMemo(() => {
    if (!projectId || !dataset) {
      return {workspace: null, workspaces: [], status: 'no-workspace' as const}
    }

    const matchingResources = workspacesByProjectIdAndDataset[`${projectId}:${dataset}`] || []
    const allWorkspaceInfos = matchingResources.map(toWorkspaceInfo)

    let resolved: WorkspaceInfo | null = null

    if (preferredStudioUrl) {
      // Also consider workspaces without projectId/dataset (manifest not loaded yet)
      const noManifestResources = workspacesByProjectIdAndDataset['NO_PROJECT_ID:NO_DATASET'] || []
      const allCandidates = [...matchingResources, ...noManifestResources]
      const match = allCandidates.find((w) => w.url === preferredStudioUrl)
      resolved = match ? toWorkspaceInfo(match) : null
    } else {
      resolved = allWorkspaceInfos[0] ?? null
    }

    return {
      workspace: resolved,
      workspaces: allWorkspaceInfos,
      status: deriveStatus(resolved, allWorkspaceInfos, !!preferredStudioUrl),
    }
  }, [projectId, dataset, workspacesByProjectIdAndDataset, preferredStudioUrl])

  const hasTarget = workspace !== null && (status === 'ready' || status === 'multiple-workspaces')

  const href = useMemo(() => {
    if (!workspace) return null
    // Construct absolute URL: workspace URL + basePath + intent path
    // workspace.url is the studio origin (e.g., "https://my-studio.sanity.studio")
    // workspace.basePath is the workspace path within the studio (e.g., "/workspace1")
    return `${workspace.url}${workspace.basePath}${intentPath}`
  }, [workspace, intentPath])

  const navigateToStudioDocument = useCallback(() => {
    if (!projectId || !dataset) {
      // eslint-disable-next-line no-console
      console.warn('Project ID and dataset are required to navigate to a studio document')
      return
    }

    if (!workspace) {
      // eslint-disable-next-line no-console
      console.warn(
        `No workspace found for document with projectId: ${projectId} and dataset: ${dataset}${preferredStudioUrl ? ` or with preferred studio url: ${preferredStudioUrl}` : ''}`,
      )
      return
    }

    if (workspaces.length > 1 && !preferredStudioUrl) {
      // eslint-disable-next-line no-console
      console.warn('Multiple workspaces found for document and no preferred studio url', {
        projectId,
        dataset,
      })
      // eslint-disable-next-line no-console
      console.warn('Using the first one', workspace)
    }

    const message: Bridge.Navigation.NavigateToResourceMessage = {
      type: 'dashboard/v1/bridge/navigate-to-resource',
      data: {
        resourceId: workspace.id,
        resourceType: 'studio',
        path: intentPath,
      },
    }

    sendMessage(message.type, message.data)
  }, [workspace, workspaces, sendMessage, preferredStudioUrl, projectId, dataset, intentPath])

  return {
    navigateToStudioDocument,
    href,
    hasTarget,
    workspace,
    workspaces,
    status,
  }
}
