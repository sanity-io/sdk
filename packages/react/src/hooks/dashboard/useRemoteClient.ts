import {type RemoteInstance} from '../../dashboard/createRemoteInstance'
import {getRemoteClientState} from '../../dashboard/remoteClientState'
import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * Returns a remote client shared by hooks using the same Sanity instance.
 * The first call creates the client; later calls reuse it.
 * @public
 */
export const useRemoteClient: () => RemoteInstance = createStateSourceHook(getRemoteClientState)
