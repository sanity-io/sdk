import type {SanityInstance} from '../instance/types'
import {getInternalAuthStore} from './getInternalAuthStore'
import type {AuthProvider, PublicAuthState, PublicTokenState} from './internalAuthStore'

export interface AuthStore {
  authState: PublicAuthState
  tokenState: PublicTokenState
  handleCallback: () => void
  logout: () => void
  dispose: () => void
  getLoginUrls: () => AuthProvider[] | Promise<AuthProvider[]>
}

/*
 * @public
 */
export const createAuthStore = (instance: SanityInstance): AuthStore => {
  const store = getInternalAuthStore(instance)

  const authState: PublicAuthState = {
    getState: () => store.getState().authState,
    getInitialState: () => store.getInitialState().authState,
    subscribe: store.subscribe.bind(store, (state) => state.authState),
  }

  const tokenState: PublicTokenState = {
    getCurrent: () => {
      const state = store.getState().authState
      if (state.type !== 'logged-in') return null
      return state.token
    },
    getInitial: () => {
      const state = store.getInitialState().authState
      if (state.type !== 'logged-in') return null
      return state.token
    },
    subscribe: store.subscribe.bind(store, (state) =>
      state.authState.type === 'logged-in' ? state.authState.token : null,
    ),
  }

  return {
    authState,
    tokenState,
    handleCallback: store.getState().handleCallback,
    logout: store.getState().logout,
    dispose: store.getState().dispose,
    getLoginUrls: store.getState().getLoginUrls,
  }
}
