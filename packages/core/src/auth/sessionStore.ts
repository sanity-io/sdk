import type {CurrentUser} from '@sanity/types'
import {createStore, type StoreApi} from 'zustand/vanilla'
import {devtools} from 'zustand/middleware'

/** @public */
export const LOGGED_IN_STATES = {
  LOGGED_IN: 'LOGGED_IN',
  LOGGED_OUT: 'LOGGED_OUT',
  LOADING: 'LOADING',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const

/** @public */
export type LoggedInState = keyof typeof LOGGED_IN_STATES

/** @public */
export interface SessionState {
  sessionId: string | null
  setSessionId: (sessionId: string | null) => void
  user: CurrentUser | null
  setUser: (user: CurrentUser | null) => void
  loggedInState: LoggedInState
  setLoggedInState: (loggedInState: LoggedInState) => void
}

/** @internal */
export const createSessionStore = (): SessionStore => {
  return createStore<SessionState>()(
    devtools(
      (set, _get) => ({
        sessionId: null as string | null,
        setSessionId: (sessionId: string | null) => {
          set({sessionId}, undefined, 'setSessionId')
        },
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

/** @public */
export type SessionStore = StoreApi<SessionState>
