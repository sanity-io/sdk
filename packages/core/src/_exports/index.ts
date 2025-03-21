// Use import type to access the internal type and re-export it
import {type SanityProject as _SanityProject} from '@sanity/client'

/**
 * @public
 */
export type SanityProject = _SanityProject

export {AuthStateType} from '../auth/authStateType'
export {
  type AuthConfig,
  type AuthProvider,
  type AuthState,
  type AuthStoreState,
  type ErrorAuthState,
  getAuthState,
  getCurrentUserState,
  getDashboardOrganizationId,
  getLoginUrlsState,
  getTokenState,
  type LoggedInAuthState,
  type LoggedOutAuthState,
  type LoggingInAuthState,
} from '../auth/authStore'
export {fetchLoginUrls} from '../auth/fetchLoginUrls'
export {handleAuthCallback} from '../auth/handleAuthCallback'
export {logout} from '../auth/logout'
export type {ClientState} from '../client/clientStore'
export {type ClientOptions, getClient, getClientState} from '../client/clientStore'
export {destroyController} from '../comlink/controller/actions/destroyController'
export {getOrCreateChannel} from '../comlink/controller/actions/getOrCreateChannel'
export {getOrCreateController} from '../comlink/controller/actions/getOrCreateController'
export {releaseChannel} from '../comlink/controller/actions/releaseChannel'
export type {ComlinkControllerState} from '../comlink/controller/comlinkControllerStore'
export {getOrCreateNode} from '../comlink/node/actions/getOrCreateNode'
export {releaseNode} from '../comlink/node/actions/releaseNode'
export type {ComlinkNodeState} from '../comlink/node/comlinkNodeStore'
export {type FrameMessage, type WindowMessage} from '../comlink/types'
export {getDatasetsState, resolveDatasets} from '../datasets/datasets'
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
export {type DocumentResourceId, getResourceId, type ResourceId} from '../document/patchOperations'
export {type PermissionDeniedReason, type PermissionsResult} from '../document/permissions'
export {createSanityInstance} from '../instance/sanityInstance'
export type {SanityConfig, SanityInstance, SdkIdentity} from '../instance/types'
export {getPreviewState, type GetPreviewStateOptions} from '../preview/getPreviewState'
export type {PreviewStoreState, PreviewValue, ValuePending} from '../preview/previewStore'
export {resolvePreview, type ResolvePreviewOptions} from '../preview/resolvePreview'
export {getProjectState, resolveProject} from '../project/project'
export {getProjectionState} from '../projection/getProjectionState'
export type {ProjectionValuePending, ValidProjection} from '../projection/projectionStore'
export {resolveProjection} from '../projection/resolveProjection'
export {getProjectsState, resolveProjects} from '../projects/projects'
export {
  getQueryKey,
  getQueryState,
  parseQueryKey,
  type QueryOptions,
  resolveQuery,
} from '../query/queryStore'
export {type ActionContext, type ResourceAction} from '../resources/createAction'
export {type ResourceState} from '../resources/createResource'
export type {StateSource} from '../resources/createStateSourceAction'
export {type BoundResourceAction} from '../resources/createStore'
export {type Membership, type ResourceType, type SanityUser, type UserProfile} from '../users/types'
export {createUsersStore, type UsersStoreState} from '../users/usersStore'
export {type FetcherStore, type FetcherStoreState} from '../utils/createFetcherStore'
export {CORE_SDK_VERSION} from '../version'
export type {CurrentUser, Role, SanityDocument, SanityDocumentLike} from '@sanity/types'
