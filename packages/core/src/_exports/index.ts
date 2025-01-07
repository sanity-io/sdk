/** MAIN INSTANCE */
// Utils
export {createSanityInstance} from '../instance/sanityInstance'
export {type ActionContext, type ResourceAction} from '../resources/createAction'
export {type ResourceState} from '../resources/createResource'
export {type BoundResourceAction} from '../resources/createStore'

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
} from '../documentList/documentListStore'
export {createDocumentListStore} from '../documentList/documentListStore'

/** AUTH */
export {
  type AuthConfig,
  type AuthProvider,
  type AuthState,
  AuthStateType,
  type AuthStoreState,
  type ErrorAuthState,
  getAuthState,
  getCurrentUserState,
  getLoginUrlsState,
  getTokenState,
  type LoggedInAuthState,
  type LoggedOutAuthState,
  type LoggingInAuthState,
} from '../auth/authStore'
export {fetchLoginUrls} from '../auth/fetchLoginUrls'
export {handleCallback} from '../auth/handleCallback'
export {logout} from '../auth/logout'
export {type SchemaConfig} from '../schema/schemaManager'
export type {CurrentUser, Role} from '@sanity/types'

/** PREVIEW */
export {getPreviewState, type GetPreviewStateOptions} from '../preview/getPreviewState'
export type {PreviewStoreState, PreviewValue, ValuePending} from '../preview/previewStore'
export {resolvePreview, type ResolvePreviewOptions} from '../preview/resolvePreview'

/** COMLINK */
export {createChannel} from '../comlink/controller/actions/createChannel'
export {createController} from '../comlink/controller/actions/createController'
export {destroyController} from '../comlink/controller/actions/destroyController'
export {getChannelState} from '../comlink/controller/actions/getChannelState'
export {getControllerState} from '../comlink/controller/actions/getControllerState'
export {removeChannel} from '../comlink/controller/actions/removeChannel'
export type {
  ComlinkControllerState,
  CreateChannelOptions,
} from '../comlink/controller/comlinkControllerStore'
export {createNode} from '../comlink/node/actions/createNode'
export {getNodeState} from '../comlink/node/actions/getNodeState'
export type {ComlinkNodeState} from '../comlink/node/comlinkNodeStore'
export {type FrameMessage, type WindowMessage} from '../comlink/types'
