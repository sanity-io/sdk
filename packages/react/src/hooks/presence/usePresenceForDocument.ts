import {type DocumentPresence, getDocumentPresence, isMediaLibraryResource} from '@sanity/sdk'
import {type Path} from '@sanity/types'
import {useCallback, useMemo, useSyncExternalStore} from 'react'

import {type DocumentHandle} from '../../config/handles'
import {useSanityInstance} from '../context/useSanityInstance'
import {useNormalizedResourceOptions} from '../helpers/useNormalizedResourceOptions'
import {trackHookUsage} from '../helpers/useTrackHookUsage'

/** @beta */
export interface UsePresenceForDocumentOptions extends DocumentHandle {
  /**
   * Narrows to participants at or below this field path, which is what a field
   * indicator wants. Omit it for everyone in the document.
   */
  path?: Path

  /**
   * By default a draft, its published version, and any release versions count as
   * the same document, which is what document lists want. Set this to compare ids
   * exactly, so that a draft and a release version do not bleed into each other.
   */
  excludeVersions?: boolean
}

/**
 * Who else is in a document, flattened to one entry per participant per location
 * so it can be rendered straight against a field.
 *
 * Reading presence never announces anything. Use `useReportPresence` to make the
 * current user visible to others.
 *
 * Prefer this over `usePresence` when you care about one document: `usePresence`
 * returns every participant in the whole project and dataset, leaving the filtering
 * to you.
 *
 * Resolves the document through its perspective exactly as `useReportPresence` does,
 * so reads match writes. Participants are counted by session, so one person in two
 * tabs appears twice.
 *
 * @example Avatars on a document
 * ```tsx
 * const {presence} = usePresenceForDocument({documentId, documentType})
 * return presence.map((p) => <Avatar key={p.sessionId} user={p.user} />)
 * ```
 *
 * @example Avatars on a single field
 * ```tsx
 * const {presence} = usePresenceForDocument({
 *   documentId,
 *   documentType,
 *   path: ['title'],
 *   excludeVersions: true,
 * })
 * ```
 *
 * @beta
 */
export function usePresenceForDocument(options: UsePresenceForDocumentOptions): {
  presence: DocumentPresence[]
} {
  const {path, excludeVersions, ...handle} = options

  const normalizedOptions = useNormalizedResourceOptions(handle)
  if (normalizedOptions.resource && isMediaLibraryResource(normalizedOptions.resource)) {
    throw new Error(
      'usePresenceForDocument() does not support media library resources. Presence tracking requires a canvas or dataset resource.',
    )
  }

  const sanityInstance = useSanityInstance()
  trackHookUsage(sanityInstance, 'usePresenceForDocument')

  const {resource, perspective} = normalizedOptions
  const {documentId, liveEdit} = options

  // Serialized so a caller passing a fresh `path` array each render does not
  // rebuild the state source every render.
  const pathKey = useMemo(() => JSON.stringify(path ?? null), [path])

  const source = useMemo(
    () =>
      getDocumentPresence(sanityInstance, {
        ...(resource ? {resource} : {}),
        documentId,
        // Forwarded, not resolved here, so this matches what `useReportPresence`
        // sends. Core owns turning a perspective into a specific document id.
        ...(perspective ? {perspective} : {}),
        ...(liveEdit ? {liveEdit} : {}),
        ...(pathKey === 'null' ? {} : {path: JSON.parse(pathKey) as Path}),
        ...(excludeVersions === undefined ? {} : {excludeVersions}),
      }),
    [sanityInstance, resource, documentId, perspective, liveEdit, pathKey, excludeVersions],
  )

  const subscribe = useCallback((callback: () => void) => source.subscribe(callback), [source])
  const presence = useSyncExternalStore(
    subscribe,
    () => source.getCurrent(),
    () => source.getCurrent(),
  )

  return {presence: presence || []}
}
