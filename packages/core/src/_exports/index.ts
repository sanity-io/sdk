/** MAIN INSTANCE */
// Utils
export {createSanityInstance} from '../instance/sanityInstance'
// Types
export type {SanityConfig} from '../instance/sanityInstance'
export type {InternalStores, SanityInstance, SdkIdentity} from '../instance/types'

/** CLIENT */
// Utils
export {getClient} from '../client/getClient'
export {getSubscribableClient} from '../client/getSubscribableClient'
// Types
export type {ClientOptions, ClientState, ClientStore} from '../client/store/clientStore'

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

/** AUTH */
export type {CurrentUserSlice} from '../auth/authStore'
export {
  type AuthConfig,
  type AuthProvider,
  type AuthState,
  type AuthStateSlice,
  type AuthStore,
  getAuthStore,
  type AuthTokenSlice as PublicTokenSlice,
} from '../auth/authStore'
export type {CurrentUser, Role} from '@sanity/types'

/** PREVIEW */
export {getPreviewStore} from '../preview/getPreviewStore'
export type {
  GetPreviewOptions,
  PreviewEventsOptions,
  PreviewStore,
  PreviewValue,
  ResolvePreviewOptions,
  ValuePending,
} from '../preview/types'
