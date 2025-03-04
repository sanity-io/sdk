/** MAIN INSTANCE */
// Utils
export {createSanityInstance} from '../instance/sanityInstance'
export {type ActionContext, type ResourceAction} from '../resources/createAction'
export {type ResourceState} from '../resources/createResource'
export {type BoundResourceAction} from '../resources/createStore'

// Types
export type {SanityConfig, SanityInstance, SdkResource} from '../instance/types'
export type {StateSource} from '../resources/createStateSourceAction'

/** CLIENT */
// Utils
export {type ClientOptions, getClient, getClientState} from '../client/clientStore'
// Types
export type {ClientState} from '../client/clientStore'

/** DOCUMENT LIST */
export type {DocumentListOptions, DocumentListState} from '../documentList/documentListStore'
export {createDocumentListStore} from '../documentList/documentListStore'

/** AUTH */
export {AuthStateType} from '../auth/authStateType'
export {
  type AuthConfig,
  type AuthProvider,
  type AuthState,
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
export type {CurrentUser, Role, SanityDocument, SanityDocumentLike} from '@sanity/types'

/** PREVIEW */
export {getPreviewState, type GetPreviewStateOptions} from '../preview/getPreviewState'
export type {PreviewStoreState, PreviewValue, ValuePending} from '../preview/previewStore'
export {resolvePreview, type ResolvePreviewOptions} from '../preview/resolvePreview'

/** COMLINK */
export {destroyController} from '../comlink/controller/actions/destroyController'
export {getOrCreateChannel} from '../comlink/controller/actions/getOrCreateChannel'
export {getOrCreateController} from '../comlink/controller/actions/getOrCreateController'
export {releaseChannel} from '../comlink/controller/actions/releaseChannel'
export type {ComlinkControllerState} from '../comlink/controller/comlinkControllerStore'
export {getOrCreateNode} from '../comlink/node/actions/getOrCreateNode'
export {releaseNode} from '../comlink/node/actions/releaseNode'
export type {ComlinkNodeState} from '../comlink/node/comlinkNodeStore'
export {type FrameMessage, type WindowMessage} from '../comlink/types'

/** DOCUMENT */
export {
  createDocument,
  type CreateDocumentAction,
  deleteDocument,
  type DeleteDocumentAction,
  discardDocument,
  type DiscardDocumentAction,
  type DocumentAction,
  editDocument,
  type EditDocumentAction,
  publishDocument,
  type PublishDocumentAction,
  unpublishDocument,
  type UnpublishDocumentAction,
} from '../document/actions'
export {type ActionsResult, applyActions, type ApplyActionsOptions} from '../document/applyActions'
export {
  getDocumentState,
  getDocumentSyncStatus,
  getPermissionsState,
  resolveDocument,
  resolvePermissions,
  subscribeDocumentEvents,
} from '../document/documentStore'
export {
  type ActionErrorEvent,
  type DocumentCreatedEvent,
  type DocumentDeletedEvent,
  type DocumentDiscardedEvent,
  type DocumentEditedEvent,
  type DocumentEvent,
  type DocumentPublishedEvent,
  type DocumentRebaseErrorEvent,
  type DocumentUnpublishedEvent,
  type TransactionAcceptedEvent,
  type TransactionRevertedEvent,
} from '../document/events'
export {
  type DocumentHandle,
  type DocumentTypeHandle,
  type JsonMatch,
  jsonMatch,
  type JsonMatchPath,
} from '../document/patchOperations'
export {type PermissionDeniedReason, type PermissionsResult} from '../document/permissions'

/** USERS */
export {createUsersStore, type UsersStoreState} from '../users/usersStore'
