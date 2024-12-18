/** MAIN INSTANCE */
// Utils
export {createSanityInstance} from '../instance/sanityInstance'
export {type ActionContext, type ResourceAction} from '../resources/createAction'
export {type ResourceState} from '../resources/createResource'

// Types
export type {SanityConfig} from '../instance/sanityInstance'
export type {InternalStores, SanityInstance, SdkIdentity} from '../instance/types'
export type {StateSource} from '../resources/createStateSourceAction'

/** CLIENT */
// Utils
export {type ClientOptions, getClient} from '../client/actions/getClient'
export {getSubscribableClient} from '../client/actions/getSubscribableClient'
// Types
export type {ClientState} from '../client/clientStore'

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
  AuthStateType,
  type AuthStore,
  type ErrorAuthState,
  getAuthStore,
  type LoggedInAuthState,
  type LoggedOutAuthState,
  type LoggingInAuthState,
  type AuthTokenSlice as PublicTokenSlice,
} from '../auth/authStore'
export {type SchemaConfig} from '../schema/schemaManager'
export type {CurrentUser, Role} from '@sanity/types'

/** PREVIEW */
export {getPreview, type GetPreviewOptions} from '../preview/getPreview'
export {getPreviewSource, type GetPreviewSourceOptions} from '../preview/getPreviewSource'
export type {PreviewStoreState, PreviewValue, ValuePending} from '../preview/previewStore'
export {resolvePreview, type ResolvePreviewOptions} from '../preview/resolvePreview'
