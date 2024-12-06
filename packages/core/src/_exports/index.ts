/** MAIN INSTANCE */
// Utils
export {createSanityInstance} from '../instance/sanityInstance'
// Types
export type {SanityConfig} from '../instance/sanityInstance'
export type {InternalStores, SanityInstance, SdkIdentity} from '../instance/types'

/** CLIENT */
// Utils
export {getClient} from '../client/getClient'
// Types
export type {ClientOptions, ClientState, ClientStore} from '../client/clientStore'

/** SCHEMA */
export type {SchemaState, SchemaStore} from '../schema/schemaStore'

/** DOCUMENT LIST */
export type {
  DocumentHandle,
  DocumentListOptions,
  DocumentListState,
  DocumentListStore,
  SortOrderingItem,
} from '../documentList/documentListStore'
export {createDocumentListStore} from '../documentList/documentListStore'

/** TEST */
export {testFunction} from '../example/example'

/** AUTH */
export {type AuthProvider, getAuthProviders} from '../auth/authProviders'
export {getSessionStore} from '../auth/getSessionStore'
export {getSidUrlSearch} from '../auth/sessionId'
export type {LoggedInState, SessionState, SessionStore} from '../auth/sessionStore'
export {LOGGED_IN_STATES} from '../auth/sessionStore'
export {tradeTokenForSession} from '../auth/tradeTokenForSession'
export type {CurrentUser, Role} from '@sanity/types'

export {type AuthState, type AuthConfig, type AuthStore} from '../auth/authStore'
export {getAuthStore} from '../auth/getAuthStore'
