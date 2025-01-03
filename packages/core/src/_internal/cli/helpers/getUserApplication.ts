import {type SanityClient} from '@sanity/client'

import {debug} from './debug'
import {isClientError} from './isClientError'

/**
 * @internal
 */
export interface GetUserApplicationOptions {
  client: SanityClient
  appHost?: string
}

/**
 * @internal
 */
export interface ActiveDeployment {
  deployedAt: string
  deployedBy: string
  isActiveDeployment: boolean
  isAutoUpdating: boolean | null
  size: string | null
  createdAt: string
  updatedAt: string
  version: string
}

/**
 * @internal
 */
export interface UserApplication {
  id: string
  projectId: string
  title: string | null
  appHost: string
  urlType: 'internal' | 'external'
  createdAt: string
  updatedAt: string
  type: string
  activeDeployment?: ActiveDeployment | null
}

/**
 * @internal
 */
export async function getUserApplication({
  client,
  appHost,
}: GetUserApplicationOptions): Promise<UserApplication | null> {
  try {
    return await client.request({
      uri: '/user-applications',
      query: appHost ? {appHost, type: 'sdkApp'} : {default: 'true', type: 'sdkApp'},
    })
  } catch (e) {
    if (isClientError(e) && e.statusCode === 404) {
      return null
    }

    debug('Error getting user application', e)
    throw e
  }
}
