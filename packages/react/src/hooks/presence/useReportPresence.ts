import {
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
 * The perspective decides which specific document is reported: the draft under
 * `drafts`, the published document under `published`, a version under a release.
 * It is taken from `ResourceProvider` unless you pass one on the handle. That
 * matters for interoperability, because the Studio's field indicators compare the
 * exact id its form is on, so a mismatch shows your user at document level while
 * never lighting up a field.
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
 * @example Presence in a release version
 * ```tsx
 * // The document id stays plain; the perspective selects the version.
 * useReportPresence({documentId, documentType, perspective: {releaseName: 'autumn'}})
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

  const normalizedOptions = useNormalizedResourceOptions(handle)
  if (normalizedOptions.resource && isMediaLibraryResource(normalizedOptions.resource)) {
    throw new Error(
      'useReportPresence() does not support media library resources. Presence tracking requires a canvas or dataset resource.',
    )
  }

  const sanityInstance = useSanityInstance()
  trackHookUsage(sanityInstance, 'useReportPresence')

  const {resource, perspective} = normalizedOptions
  const {documentId, liveEdit} = options

  const interval = throttleMs ?? (selection ? SELECTION_THROTTLE_MS : FOCUS_THROTTLE_MS)

  // Compared by value, because callers write `path={['title']}` inline and a fresh
  // array identity every render must not mean a fresh announcement every render.
  const locationKey = useMemo(
    () =>
      JSON.stringify([documentId, path ?? [], selection ?? null, perspective ?? null, liveEdit]),
    [documentId, path, selection, perspective, liveEdit],
  )

  // Rebuilt from the key rather than from the props, so the effect below can
  // depend on it honestly instead of suppressing the exhaustive-deps rule.
  const location = useMemo<ReportPresenceOptions>(() => {
    const [id, parsedPath, parsedSelection, parsedPerspective, parsedLiveEdit] = JSON.parse(
      locationKey,
    ) as [string, Path, PresenceSelection, ReportPresenceOptions['perspective'] | null, boolean?]
    return {
      documentId: id,
      // Forwarded rather than resolved here: core turns the perspective into the
      // specific document id, so the read and write sides cannot drift apart.
      ...(parsedPerspective ? {perspective: parsedPerspective} : {}),
      ...(parsedLiveEdit ? {liveEdit: parsedLiveEdit} : {}),
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
