import {type SanityProject as _SanityProject} from '@sanity/client'

/**
 * @public
 */
export type SanityProject = _SanityProject

export {AuthStateType} from '../auth/authStateType'
export {
  type AuthState,
  type AuthStoreState,
  type ErrorAuthState,
  getAuthState,
  getCurrentUserState,
  getDashboardOrganizationId,
  getLoginUrlState,
  getTokenState,
  type LoggedInAuthState,
  type LoggedOutAuthState,
  type LoggingInAuthState,
} from '../auth/authStore'
export {handleAuthCallback} from '../auth/handleAuthCallback'
export {logout} from '../auth/logout'
export type {ClientStoreState as ClientState} from '../client/clientStore'
export {type ClientOptions, getClient, getClientState} from '../client/clientStore'
export {
  type ComlinkControllerState,
  destroyController,
  getOrCreateChannel,
  getOrCreateController,
  releaseChannel,
} from '../comlink/controller/comlinkControllerStore'
export type {ComlinkNodeState} from '../comlink/node/comlinkNodeStore'
export {getOrCreateNode, releaseNode} from '../comlink/node/comlinkNodeStore'
export {type FrameMessage, type WindowMessage} from '../comlink/types'
export {type AuthConfig, type AuthProvider} from '../config/authConfig'
export {
  type DatasetHandle,
  type DocumentHandle,
  type DocumentTypeHandle,
  type ProjectHandle,
  type SanityConfig,
} from '../config/sanityConfig'
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
export {
  type ActionsResult,
  applyDocumentActions,
  type ApplyDocumentActionsOptions,
} from '../document/applyDocumentActions'
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
export {type JsonMatch, jsonMatch, type JsonMatchPath} from '../document/patchOperations'
export {type DocumentPermissionsResult, type PermissionDeniedReason} from '../document/permissions'
export {getPreviewState, type GetPreviewStateOptions} from '../preview/getPreviewState'
export type {PreviewStoreState, PreviewValue, ValuePending} from '../preview/previewStore'
export {resolvePreview, type ResolvePreviewOptions} from '../preview/resolvePreview'
export {getProjectState, resolveProject} from '../project/project'
export {getProjectionState} from '../projection/getProjectionState'
export {type ProjectionValuePending, type ValidProjection} from '../projection/projectionStore'
export {resolveProjection} from '../projection/resolveProjection'
export {getProjectsState, resolveProjects} from '../projects/projects'
export {
  getQueryKey,
  getQueryState,
  parseQueryKey,
  type QueryOptions,
  resolveQuery,
} from '../query/queryStore'
export {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
export {type Selector, type StateSource} from '../store/createStateSourceAction'
export {getUsersKey, parseUsersKey} from '../users/reducers'
export {
  type GetUsersOptions,
  type Membership,
  type ResolveUsersOptions,
  type SanityUser,
  type UserProfile,
} from '../users/types'
export {getUsersState, loadMoreUsers, resolveUsers} from '../users/usersStore'
export {type FetcherStore, type FetcherStoreState} from '../utils/createFetcherStore'
export {createGroqSearchFilter} from '../utils/createGroqSearchFilter'
export {CORE_SDK_VERSION} from '../version'
export type {CurrentUser, Role, SanityDocument, SanityDocumentLike} from '@sanity/types'
