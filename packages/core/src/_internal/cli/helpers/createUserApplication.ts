import {type SanityClient} from '@sanity/client'

import type {UserApplication} from './getUserApplication'

/**
 * @internal
 */
export function createUserApplication(
  client: SanityClient,
  body: Pick<UserApplication, 'type' | 'appHost' | 'urlType'> & {
    title?: string
  },
): Promise<UserApplication> {
  return client.request({uri: '/user-applications', method: 'POST', body})
}
