import {distinctUntilChanged, map, Observable} from 'rxjs'

import {getAuthStore} from '../../auth/getAuthStore'
import {createResourceAction, type ResourceState} from '../../store/createResource'
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
export const subscribeToAuthEvents = createResourceAction(clientStore, ({instance, state}) => {
  return () => {
    const authStore = getAuthStore(instance)

    const observableAuthStore = new Observable(authStore.subscribe)
    return observableAuthStore
      .pipe(
        map((authState) => {
          if (authState.type === 'logged-in') {
            return authState.token
          }
          return undefined
        }),
        distinctUntilChanged(),
      )
      .subscribe((newToken) => receiveToken(state, newToken))
  }
})
