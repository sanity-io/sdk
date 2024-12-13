import {getOrCreateResource} from '../instance/sanityInstance'
import type {SanityInstance} from '../instance/types'
import {createPreviewStore} from './previewStore'
import {type PreviewStore} from './types'

/**
 * Get or create a preview store for the current `SanityInstance`
 * @public
 */
export const getPreviewStore = (instance: SanityInstance): PreviewStore => {
  return getOrCreateResource(instance, 'previewStore', () => createPreviewStore(instance))
}
