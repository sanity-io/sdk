import {getTokenState} from '../../auth/authStore'
import {type ActionContext, createInternalAction} from '../../resources/createAction'
import type {ClientState} from '../clientStore'

const receiveToken = (prev: ClientState, token: string | undefined): ClientState => {
  const newDefaultClient = prev.defaultClient.withConfig({
    token,
  })
  const updatedClients = new Map(
    Array.from(prev.clients.entries()).map(([version, client]) => [
      version,
      client.withConfig({token}),
    ]),
  )

  return {
    defaultClient: newDefaultClient,
    clients: updatedClients,
  }
}

/**
 * Updates the client store state when a token is received.
 * @internal
 */
export const subscribeToAuthEvents = createInternalAction(
  ({instance, state}: ActionContext<ClientState>) => {
    return () => {
      return getTokenState(instance).observable.subscribe((newToken) => {
        state.set('receiveToken', (prev) => receiveToken(prev, newToken ?? undefined))
      })
    }
  },
)
