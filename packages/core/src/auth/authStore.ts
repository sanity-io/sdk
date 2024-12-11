import type {CurrentUser} from '@sanity/types'

import type {SanityInstance} from '../instance/types'
import {getInternalAuthStore} from './getInternalAuthStore'
import type {AuthProvider, AuthState} from './internalAuthStore'

/**
 * @public
 */
export interface AuthStore {
  authState: AuthStateSlice
  tokenState: AuthTokenSlice
  currentUserState: CurrentUserSlice
  handleCallback: (locationHref?: string) => Promise<string | false>
  logout: () => void
  dispose: () => void
  getLoginUrls: () => AuthProvider[] | Promise<AuthProvider[]>
}

/**
 * Public interface for the auth store.
 * @public
 */
export interface AuthStateSlice {
  getState: () => AuthState
  getInitialState: () => AuthState
  subscribe: (listener: (state: AuthState, prevState: AuthState) => void) => () => void
}

/**
 * Public interface for the token store.
 *
 * @public
 */
export interface AuthTokenSlice {
  getState: () => string | null
  getInitialState: () => string | null
  subscribe: (listener: (token: string | null, prevToken: string | null) => void) => () => void
}

/**
 * Public interface for the auth store slice that contains the current user.
 *
 * @public
 */
export interface CurrentUserSlice {
  getState: () => CurrentUser | null
  getInitialState: () => CurrentUser | null
  subscribe: (
    listener: (user: CurrentUser | null, prevUser: CurrentUser | null) => void,
  ) => () => void
}

export type {AuthConfig, AuthProvider, AuthState} from './internalAuthStore'

/**
 * Retrieves or creates an `AuthStore` for the given `SanityInstance`.
 *
 * @param instance - The `SanityInstance` to get or create the `AuthStore` for.
 * @returns The `AuthStore` associated with the given `SanityInstance`.
 *
 * @public
 */
export const getAuthStore = (instance: SanityInstance): AuthStore => {
  const internalAuthStore = getInternalAuthStore(instance)

  const authState: AuthStateSlice = {
    getState: () => internalAuthStore.getState().authState,
    getInitialState: () => internalAuthStore.getInitialState().authState,
    subscribe: (listener) =>
      internalAuthStore.subscribe((current, prev) => {
        listener(current.authState, prev.authState)
      }),
  }

  const tokenState: AuthTokenSlice = {
    getState: () => {
      const state = internalAuthStore.getState()
      if (state.authState.type !== 'logged-in') return null
      return state.authState.token
    },
    getInitialState: () => {
      const state = internalAuthStore.getInitialState()
      if (state.authState.type !== 'logged-in') return null
      return state.authState.token
    },
    subscribe: (listener) =>
      internalAuthStore.subscribe((state, prevState) => {
        const token = state.authState.type === 'logged-in' ? state.authState.token : null
        const prevToken =
          prevState.authState.type === 'logged-in' ? prevState.authState.token : null
        listener(token, prevToken)
      }),
  }

  const currentUserState: CurrentUserSlice = {
    getState: () => {
      const state = internalAuthStore.getState()
      if (state.authState.type !== 'logged-in') return null
      return state.authState.currentUser
    },
    getInitialState: () => {
      const state = internalAuthStore.getInitialState()
      if (state.authState.type !== 'logged-in') return null
      return state.authState.currentUser
    },
    subscribe: (listener) =>
      internalAuthStore.subscribe((state, prevState) => {
        const user = state.authState.type === 'logged-in' ? state.authState.currentUser : null
        const prevUser =
          prevState.authState.type === 'logged-in' ? prevState.authState.currentUser : null
        listener(user, prevUser)
      }),
  }

  return {
    authState,
    tokenState,
    currentUserState,
    handleCallback: internalAuthStore.getState().handleCallback,
    logout: internalAuthStore.getState().logout,
    dispose: internalAuthStore.getState().dispose,
    getLoginUrls: internalAuthStore.getState().getLoginUrls,
  }
}
