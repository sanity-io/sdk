import {getClient} from '../client/getClient'
import type {SanityInstance} from '../instance/types'

/**
 * This is an example function, and will be removed shortly.
 * @public
 * */
export const testFunction = (sanityInstance?: SanityInstance): string => {
  if (sanityInstance) {
    getClient({apiVersion: 'v2024-11-22'}, sanityInstance)
  }
  return 'example'
}
