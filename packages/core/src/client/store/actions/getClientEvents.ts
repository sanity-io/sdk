import type {SanityClient} from '@sanity/client'
import {distinctUntilChanged, map, Observable, startWith, type Subscribable} from 'rxjs'

import type {StoreActionContext} from '../../../store/createStore'
import type {ClientOptions, ClientState} from '../clientStore'
import {getOrCreateClient} from './getOrCreateClient'

/**
 * Provides a stream of clients, based on the current state of the store.
 * (For example, when a user logs in, this will emit an authorized client.)
 * @internal
 */
export const getClientEvents = (
  context: StoreActionContext<ClientState>,
  options: ClientOptions = {},
): Subscribable<SanityClient> => {
  const {store} = context

  const initialClient = getOrCreateClient(context, options)
  const clientStore$ = new Observable<void>((subscriber) =>
    store.subscribe(() => subscriber.next()),
  )

  const client$ = clientStore$.pipe(
    map(() => getOrCreateClient(context, options)),
    startWith(initialClient),
    distinctUntilChanged((prev, curr) => prev.config().token === curr.config().token),
  )

  return {
    subscribe: client$.subscribe.bind(client$),
  }
}
