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
  getIsInDashboardState,
  getLoginUrlState,
  getTokenState,
  type LoggedInAuthState,
  type LoggedOutAuthState,
  type LoggingInAuthState,
  setAuthToken,
} from '../auth/authStore'
export {observeOrganizationVerificationState} from '../auth/getOrganizationVerificationState'
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
export {getNodeState, type NodeState} from '../comlink/node/getNodeState'
export {
  type FrameMessage,
  type NewTokenResponseMessage,
  type RequestNewTokenMessage,
  type WindowMessage,
} from '../comlink/types'
export {type AuthConfig, type AuthProvider} from '../config/authConfig'
export {
  createDatasetHandle,
  createDocumentHandle,
  createDocumentTypeHandle,
  createProjectHandle,
} from '../config/handles'
export {
  type DatasetHandle,
  type DocumentHandle,
  type DocumentTypeHandle,
  type PerspectiveHandle,
  type ProjectHandle,
  type ReleasePerspective,
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
  type DocumentOptions,
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
export {type JsonMatch} from '../document/patchOperations'
export {type DocumentPermissionsResult, type PermissionDeniedReason} from '../document/permissions'
export type {FavoriteStatusResponse} from '../favorites/favorites'
export {getFavoritesState, resolveFavoritesState} from '../favorites/favorites'
export {getPresence} from '../presence/presenceStore'
export type {
  DisconnectEvent,
  PresenceLocation,
  RollCallEvent,
  StateEvent,
  TransportEvent,
  UserPresence,
} from '../presence/types'
export {getPreviewState, type GetPreviewStateOptions} from '../preview/getPreviewState'
export type {PreviewStoreState, PreviewValue, ValuePending} from '../preview/previewStore'
export {resolvePreview, type ResolvePreviewOptions} from '../preview/resolvePreview'
export {type OrgVerificationResult} from '../project/organizationVerification'
export {getProjectState, resolveProject} from '../project/project'
export {getProjectionState} from '../projection/getProjectionState'
export {resolveProjection} from '../projection/resolveProjection'
export {type ProjectionValuePending, type ValidProjection} from '../projection/types'
export {getProjectsState, resolveProjects} from '../projects/projects'
export {
  getQueryKey,
  getQueryState,
  parseQueryKey,
  type QueryOptions,
  resolveQuery,
} from '../query/queryStore'
export {getPerspectiveState} from '../releases/getPerspectiveState'
export type {ReleaseDocument} from '../releases/releasesStore'
export {getActiveReleasesState} from '../releases/releasesStore'
export {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
export {type Selector, type StateSource} from '../store/createStateSourceAction'
export {getUsersKey, parseUsersKey} from '../users/reducers'
export {
  type GetUserOptions,
  type GetUsersOptions,
  type Membership,
  type ResolveUserOptions,
  type ResolveUsersOptions,
  type SanityUser,
  type SanityUserResponse,
  type UserProfile,
  type UsersGroupState,
  type UsersStoreState,
} from '../users/types'
export {
  getUsersState,
  getUserState,
  loadMoreUsers,
  resolveUser,
  resolveUsers,
} from '../users/usersStore'
export {type FetcherStore, type FetcherStoreState} from '../utils/createFetcherStore'
export {createGroqSearchFilter} from '../utils/createGroqSearchFilter'
export {defineIntent, type Intent, type IntentFilter} from '../utils/defineIntent'
export {CORE_SDK_VERSION} from '../version'
export {
  getIndexForKey,
  getPathDepth,
  joinPaths,
  jsonMatch,
  slicePath,
  stringifyPath,
} from '@sanity/json-match'
export type {CurrentUser, Role, SanityDocument} from '@sanity/types'
