import {
  getEditingDocumentId,
  isMediaLibraryResource,
  type PresenceSelection,
  reportPresence,
  type ReportPresenceOptions,
} from '@sanity/sdk'
import {type Path} from '@sanity/types'
import {useEffect, useMemo, useRef} from 'react'

import {type DocumentHandle} from '../../config/handles'
import {useSanityInstance} from '../context/useSanityInstance'
import {useNormalizedResourceOptions} from '../helpers/useNormalizedResourceOptions'
import {trackHookUsage} from '../helpers/useTrackHookUsage'

/**
 * Field focus moves at human speed, so a second between announcements is plenty.
 */
const FOCUS_THROTTLE_MS = 1000

/**
 * A caret that trails a second behind reads as broken rather than as latency, so
 * reporting a `selection` announces more often. The Studio uses a flat 1000ms for
 * both, which is why its remote carets feel sluggish.
 */
const SELECTION_THROTTLE_MS = 250

/** @beta */
export interface UseReportPresenceOptions extends DocumentHandle {
  /**
   * The focused field path. Omit it for document-level presence. Keyed and numeric
   * segments are supported, so array items and Portable Text spans can be
   * addressed.
   */
  path?: Path

  /** The Portable Text caret, when the focused field is a Portable Text field. */
  selection?: PresenceSelection

  /** Overrides the throttle interval. Mainly useful in tests. */
  throttleMs?: number
}

/**
 * Announces that the current user is in a document, so that other clients in the
 * same project and dataset can show them.
 *
 * Writing presence is opt-in. Reading it with `usePresenceForDocument` or
 * `usePresence` never announces anything, and this hook is the only thing that
 * makes an app visible to others. That includes the Studio, which shares the same
 * presence room and will show these users in its navbar and field indicators.
 *
 * Announcements are throttled, collapsed over a short window, and then repeated
 * every 30 seconds while the user is idle. That repeat is what tells peers the
 * session is still alive, so the intended usage is to mount this hook for as long
 * as the user is in the document. On unmount the location is cleared, leaving the
 * user present in the app but not in any particular document.
 *
 * Presence is scoped to a single project and dataset. It is not a list of everyone
 * signed in to your organization.
 *
 * @example Document-level presence
 * ```tsx
 * function DocumentEditor({documentId, documentType}: DocumentHandle) {
 *   useReportPresence({documentId, documentType})
 *   return <Editor />
 * }
 * ```
 *
 * @example Field-level presence
 * ```tsx
 * function TitleField({documentId, documentType}: DocumentHandle) {
 *   const [focused, setFocused] = useState(false)
 *   useReportPresence({documentId, documentType, path: focused ? ['title'] : undefined})
 *   return <input onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
 * }
 * ```
 *
 * @beta
 */
export function useReportPresence(options: UseReportPresenceOptions): void {
  const {path, selection, throttleMs, ...handle} = options

  // Resolved to the specific document the user is editing under this perspective,
  // because that is what other clients compare against. The Studio's field
  // indicators match its form's id exactly, so reporting the published id would
  // appear at document level and never light up a field.
  const documentId = getEditingDocumentId(options)

  const normalizedOptions = useNormalizedResourceOptions(handle)
  if (normalizedOptions.resource && isMediaLibraryResource(normalizedOptions.resource)) {
    throw new Error(
      'useReportPresence() does not support media library resources. Presence tracking requires a canvas or dataset resource.',
    )
  }

  const sanityInstance = useSanityInstance()
  trackHookUsage(sanityInstance, 'useReportPresence')

  const {resource} = normalizedOptions
  const interval = throttleMs ?? (selection ? SELECTION_THROTTLE_MS : FOCUS_THROTTLE_MS)

  // Compared by value, because callers write `path={['title']}` inline and a fresh
  // array identity every render must not mean a fresh announcement every render.
  const locationKey = useMemo(
    () => JSON.stringify([documentId, path ?? [], selection ?? null]),
    [documentId, path, selection],
  )

  // Rebuilt from the key rather than from the props, so the effect below can
  // depend on it honestly instead of suppressing the exhaustive-deps rule.
  const location = useMemo<ReportPresenceOptions>(() => {
    const [id, parsedPath, parsedSelection] = JSON.parse(locationKey) as [
      string,
      Path,
      PresenceSelection,
    ]
    return {
      documentId: id,
      ...(parsedPath.length > 0 ? {path: parsedPath} : {}),
      ...(parsedSelection ? {selection: parsedSelection} : {}),
    }
  }, [locationKey])

  const lastSentAt = useRef(0)
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    // Captured in this effect's closure rather than read from a ref, so nothing is
    // written during render. A newer location re-runs the effect, which clears the
    // pending timeout below and schedules the newer value instead.
    const send = () => {
      lastSentAt.current = Date.now()
      reportPresence(sanityInstance, {
        ...(resource ? {resource} : {}),
        locations: [location],
      })
    }

    const elapsed = Date.now() - lastSentAt.current
    if (elapsed >= interval) {
      send()
    } else {
      // Trailing edge, so the position the user settled on is the one announced.
      clearTimeout(pending.current)
      pending.current = setTimeout(send, interval - elapsed)
    }

    return () => clearTimeout(pending.current)
  }, [location, interval, sanityInstance, resource])

  // Kept separate from the throttled effect so it runs on unmount only, rather
  // than every time the reported location changes.
  useEffect(() => {
    return () => {
      reportPresence(sanityInstance, {...(resource ? {resource} : {}), locations: []})
    }
  }, [sanityInstance, resource])
}
