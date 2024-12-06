import type {SanityClient} from '@sanity/client'
import {distinctUntilChanged, map, Observable, startWith, type Subscribable} from 'rxjs'
import type {StoreActionContext} from '../../../store/createStore'
import type {ClientOptions, ClientState} from '../clientStore'
import {getOrCreateClient} from './getOrCreateClient'

export const getClientEvents = (
  context: StoreActionContext<ClientState>,
  options: ClientOptions = {},
): Subscribable<SanityClient> => {
  const {store} = context

  const initialClient = getOrCreateClient(context, options)
  const clientStore$ = new Observable<void>((subscriber) =>
    store.subscribe(() => subscriber.next()),
  )

  const observable = clientStore$.pipe(
    map(() => getOrCreateClient(context, options)),
    startWith(initialClient),
    distinctUntilChanged((prev, curr) => prev.config().token === curr.config().token),
  )

  return {
    subscribe: observable.subscribe.bind(observable),
  }
}
