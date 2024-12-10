import {distinctUntilChanged, filter, map, switchMap} from 'rxjs'
import {createResourceAction} from '../../store/createResource'
import {Auth, type AuthState} from '../newAuthStore'
import type {CurrentUser} from '@sanity/types'
import {isEqual} from 'lodash-es'

const DEFAULT_API_VERSION = '2021-06-07'
const REQUEST_TAG_PREFIX = 'sdk.auth'

export const subscribeToStoreAndFetchCurrentUser = createResourceAction(
  Auth,
  ({state, context, instance}) => {
    const {clientFactory, authScope, apiHost} = context
    const {projectId, dataset} = instance.identity

    // TODO: if `function` is used, then the `name ` could be introspected
    return function subscribeToStoreAndFetchCurrentUser() {
      return state.observable
        .pipe(
          map((e) => e.authState),
          filter(
            (e): e is Extract<AuthState, {type: 'logged-in'}> =>
              e.type === 'logged-in' && !e.currentUser,
          ),
          distinctUntilChanged(isEqual),
          switchMap((authState) => {
            const client = clientFactory({
              token: authState.token,
              projectId,
              dataset,
              requestTagPrefix: REQUEST_TAG_PREFIX,
              apiVersion: DEFAULT_API_VERSION,
              useProjectHostname: authScope === 'project',
              ...(apiHost && {apiHost}),
            })

            // TODO: requests that result in a 401 or don't return a user would
            // signal an invalid session that we should react to (e.g. setting a
            // logged-out state)
            return client.observable
              .request<CurrentUser>({uri: '/users/me', method: 'GET'})
              .pipe(map((currentUser) => ({...authState, currentUser})))
          }),
        )
        .subscribe({
          next: (authState) => {
            state.set('currentUserSet', {authState})
          },
        })
    }
  },
)
