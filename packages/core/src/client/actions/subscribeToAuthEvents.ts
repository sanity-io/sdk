import {distinctUntilChanged, map, Observable} from 'rxjs'

import {getAuthStore} from '../../auth/authStore'
import {createAction} from '../../resources/createAction'
import {type ResourceState} from '../../resources/createResource'
import {type ClientState, clientStore} from '../clientStore'

const receiveToken = (state: ResourceState<ClientState>, token: string | undefined): void => {
  const newDefaultClient = state.get().defaultClient.withConfig({
    token,
  })
  const updatedClients = new Map(
    Array.from(state.get().clients.entries()).map(([version, client]) => [
      version,
      client.withConfig({token}),
    ]),
  )
  state.set('receiveToken', {
    defaultClient: newDefaultClient,
    clients: updatedClients,
  })
}

/**
 * Updates the client store state when a token is received.
 * @internal
 */
export const subscribeToAuthEvents = createAction(
  () => clientStore,
  ({instance, state}) => {
    return () => {
      const authStore = getAuthStore(instance)

      const observableAuthStore = new Observable<string | null>((observer) => {
        return authStore.tokenState.subscribe((token) => {
          observer.next(token)
        })
      })

      return observableAuthStore
        .pipe(
          map((token) => token ?? undefined),
          distinctUntilChanged(),
        )
        .subscribe((newToken) => receiveToken(state, newToken))
    }
  },
)
