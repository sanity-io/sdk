import type {CurrentUser} from '@sanity/types'
import {devtools} from 'zustand/middleware'
import {createStore, type StoreApi} from 'zustand/vanilla'

/**
 * Enum-like object defining all possible authentication states
 * @public
 * @readonly
 */
export const LOGGED_IN_STATES = {
  /** User is authenticated and has valid credentials */
  LOGGED_IN: 'LOGGED_IN',
  /** User is not authenticated */
  LOGGED_OUT: 'LOGGED_OUT',
  /** Authentication state is being determined */
  LOADING: 'LOADING',
  /** User lacks sufficient permissions */
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const

/**
 * Type representing the possible authentication states
 * @public
 */
export type LoggedInState = keyof typeof LOGGED_IN_STATES

/**
 * Interface describing the session state and its mutation methods
 * @public
 */
export interface SessionState {
  /** Current authenticated user information */
  user: CurrentUser | null
  /** Updates the current user information */
  setUser: (user: CurrentUser | null) => void
  /** Current authentication state */
  loggedInState: LoggedInState
  /** Updates the authentication state */
  setLoggedInState: (loggedInState: LoggedInState) => void
}

/**
 * Creates a new session store instance using Zustand
 * @internal
 * @returns {SessionStore} A store instance with session state management capabilities
 */
export const createSessionStore = (): SessionStore => {
  return createStore<SessionState>()(
    devtools(
      (set, _get) => ({
        user: null as CurrentUser | null,
        setUser: (user: CurrentUser | null) => {
          set({user}, undefined, 'setUser')
        },
        loggedInState: LOGGED_IN_STATES.LOGGED_OUT,
        setLoggedInState: (loggedInState: LoggedInState) => {
          set({loggedInState}, undefined, 'setLoggedInState')
        },
      }),
      {
        name: 'SanitySessionStore',
        enabled: true, // Should be process.env.NODE_ENV === 'development',
      },
    ),
  )
}

/**
 * Type representing the session store API
 * @public
 */
export type SessionStore = StoreApi<SessionState>
