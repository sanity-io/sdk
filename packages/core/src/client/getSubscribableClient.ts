import type {SanityClient} from '@sanity/client'
import type {Subscribable} from 'rxjs'
import type {SanityInstance} from '../instance/types'
import {type ClientOptions, getClientStore} from './store/clientStore'

/**
 * Creates a subscribable client based on the apiVersion.
 * The client will update when the underlying store changes (e.g., on user authentication changes).
 * @public
 */
export const getSubscribableClient = (
  options: ClientOptions,
  instance: SanityInstance,
): Subscribable<SanityClient> => {
  return getClientStore(instance).getClientEvents(options)
}
