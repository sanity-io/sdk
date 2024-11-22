import {getClient} from '../client/getClient'
import type {SanityInstance} from '../instance/types'

/**
 * @public
 * @module @sanity/sdk
 * @category Example
 * */
export const testFunction = (sanityInstance?: SanityInstance): string => {
  if (sanityInstance) {
    const client = getClient({apiVersion: 'v2024-11-22'}, sanityInstance)
    // eslint-disable-next-line no-console
    console.log(client)
  }
  return 'example lol'
}
