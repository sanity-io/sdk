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
export type {ClientOptions, ClientState, ClientStore} from '../client/store/clientStore'

/** SCHEMA */
export type {SchemaState, SchemaStore} from '../schema/schemaStore'

/** DOCUMENT LIST */
export {type AuthConfig, type AuthProvider, type AuthState, type AuthStore} from '../auth/authStore'
export {getAuthStore} from '../auth/getAuthStore'
export type {
  DocumentHandle,
  DocumentListOptions,
  DocumentListState,
  DocumentListStore,
  SortOrderingItem,
} from '../documentList/documentListStore'
export {createDocumentListStore} from '../documentList/documentListStore'
export type {CurrentUser, Role} from '@sanity/types'

export {handleCallback} from '../auth/actions/handleCallback'
