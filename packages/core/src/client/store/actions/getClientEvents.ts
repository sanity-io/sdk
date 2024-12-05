import type {SanityClient} from '@sanity/client'
import {Observable, type Subscribable} from 'rxjs'

import type {StoreActionContext} from '../../../store/createStore'
import type {ClientOptions, ClientState} from '../clientStore'
import {getOrCreateClient} from './getOrCreateClient'

/**
 *
 */
export const getClientEvents = (
  context: StoreActionContext<ClientState>,
  options: ClientOptions = {},
): Subscribable<SanityClient> => {
  const {store} = context
  const observable = new Observable<SanityClient>((observer) => {
    // this makes it so that when the consumer calls subscribe, they immediately
    // get a client pushed to them and they don't have to wait until a store change
    observer.next(getOrCreateClient(context, options))

    const storeSubscription = store.subscribe(() => {
      observer.next(getOrCreateClient(context, options))
    })
    return storeSubscription
  })

  const subscribe = observable.subscribe.bind(observable)
  return {subscribe}
}
