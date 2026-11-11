import {getCurrentUserState} from '@sanity/sdk'
import {filter, firstValueFrom} from 'rxjs'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

const useSignedInUser = createStateSourceHook({
  getState: getCurrentUserState,
  shouldSuspend: (instance) => getCurrentUserState(instance).getCurrent() === null,
  suspender: (instance) =>
    firstValueFrom(getCurrentUserState(instance).observable.pipe(filter(Boolean))),
})

/**
 * The signed-in user's ID, suspending until `/users/me` has answered. Preferences are cached per
 * user, so nothing is read or written before the ID is known.
 *
 * @internal
 */
export function useSignedInUserId(): string {
  // Suspended above until there's a user
  return useSignedInUser()!.id
}
