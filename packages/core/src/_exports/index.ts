/**
 * @packageDocumentation
 * @module @sanity/sdk
 */

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

/** TEST */
export {testFunction} from '../example/example'

/** AUTH */
export {type AuthProvider, getAuthProviders} from '../auth/authProviders'
export {getSessionStore} from '../auth/getSessionStore'
export {getSidUrlSearch} from '../auth/sessionId'
export type {SessionState, SessionStore, LoggedInState} from '../auth/sessionStore'
export {tradeTokenForSession} from '../auth/tradeTokenForSession'
export type {CurrentUser, Role} from '@sanity/types'
export {LOGGED_IN_STATES} from '../auth/sessionStore'
