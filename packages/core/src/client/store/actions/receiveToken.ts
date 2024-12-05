import type {StoreActionContext} from '../../../store/createStore'
import type {ClientState} from '../clientStore'

/**
 *
 */
export const receiveToken = (
  {store}: StoreActionContext<ClientState>,
  token: string | undefined,
) => {
  const newClientsByVersion = new Map()
  store.getState().clients.forEach((client, version) => {
    newClientsByVersion.set(
      version,
      client.withConfig({
        token,
      }),
    )
  })
  store.setState({
    clients: newClientsByVersion,
  })
}
