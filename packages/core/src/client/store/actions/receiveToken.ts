import type {StoreActionContext} from '../../../store/createStore'
import type {ClientState} from '../clientStore'

/**
 *
 */
export const receiveToken = (
  {store}: StoreActionContext<ClientState>,
  token: string | undefined,
) => {
  // Update the default client
  const newDefaultClient = store.getState().defaultClient.withConfig({
    token,
  })

  // Update existing clients while preserving the map structure
  store.setState((prevState) => {
    const updatedClients = new Map(
      Array.from(prevState.clients.entries()).map(([version, client]) => [
        version,
        client.withConfig({token}),
      ]),
    )

    return {
      defaultClient: newDefaultClient,
      clients: updatedClients,
    }
  })
}
