import {type DocumentResource} from '@sanity/sdk'
import {createContext} from 'react'

export const DEFAULT_MEDIA_LIBRARY_RESOURCE_NAME = 'media-library'
export const DEFAULT_CANVAS_RESOURCE_NAME = 'canvas'

/**
 * Provides the in-flight inference promise for org resources (media library,
 * canvas). `null` means inference is disabled or not configured.
 *
 * Consumed by `useNormalizedResourceOptions` to suspend only the hooks that
 * actually need an inferred resource, rather than blocking the whole app.
 *
 * @internal
 */
export const OrgInferenceContext = createContext<Promise<Record<string, DocumentResource>> | null>(
  null,
)
