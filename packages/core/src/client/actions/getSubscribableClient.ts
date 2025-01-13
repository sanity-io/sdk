import type {SanityClient} from '@sanity/client'
import {distinctUntilChanged, map, startWith, type Subscribable} from 'rxjs'

import {createAction} from '../../resources/createAction'
import {clientStore} from '../clientStore'
import {type ClientOptions, getClient} from './getClient'

/**
 * Provides a stream of clients, based on the current state of the store.
 * (For example, when a user logs in, this will emit an authorized client.)
 * @public
 */
export const getSubscribableClient = createAction(clientStore, ({instance, state}) => {
  return (options: ClientOptions): Subscribable<SanityClient> => {
    const initialClient = getClient(instance, options)

    const client$ = state.observable.pipe(
      map(() => getClient(instance, options)),
      startWith(initialClient),
      // as we add more things that can change client configuration,
      // we might want to add more checks here
      distinctUntilChanged((prev, curr) => prev.config().token === curr.config().token),
    )

    return {
      subscribe: client$.subscribe.bind(client$),
    }
  }
})
