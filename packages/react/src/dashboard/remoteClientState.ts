import {type SanityInstance, type StateSource} from '@sanity/sdk'
import {of} from 'rxjs'

import {createRemoteInstance, type RemoteInstance} from './createRemoteInstance'

const remoteClientStates = new WeakMap<SanityInstance, StateSource<RemoteInstance>>()

/** Returns the instance's remote client state, creating it on first use. @internal */
export function getRemoteClientState(instance: SanityInstance): StateSource<RemoteInstance> {
  if (instance.isDisposed()) {
    throw new Error('Cannot create a remote client for a disposed Sanity instance')
  }

  const current = remoteClientStates.get(instance)
  if (current) return current

  const client = createRemoteInstance({name: `sanity-remote-${instance.instanceId}`})
  const state = {
    getCurrent: () => client,
    observable: of(client),
    subscribe: () => () => {},
  }

  remoteClientStates.set(instance, state)
  instance.onDispose(() => remoteClientStates.delete(instance))
  return state
}
