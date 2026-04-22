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
export {getOrganizationVerificationState} from '../auth/getOrganizationVerificationState'
export {handleAuthCallback} from '../auth/handleAuthCallback'
export {logout} from '../auth/logout'
export type {ClientStoreState as ClientState} from '../client/clientStore'
export {type ClientOptions, getClient, getClientState} from '../client/clientStore'
export {type AuthConfig, type AuthProvider} from '../config/authConfig'
export {
  createDocumentHandle,
  createDocumentTypeHandle,
  createResourceHandle,
} from '../config/handles'
export {
  configureLogging,
  type InstanceContext,
  type LogContext,
  type Logger,
  type LoggerConfig,
  type LogLevel,
  type LogNamespace,
} from '../config/loggingConfig'
export {
  type CanvasResource,
  type DatasetResource,
  type DocumentHandle,
  type DocumentResource,
  type DocumentTypeHandle,
  isCanvasResource,
  isDatasetResource,
  isMediaLibraryResource,
  type MediaLibraryResource,
  type PerspectiveHandle,
  type ReleasePerspective,
  type ResourceHandle,
  type SanityConfig,
  type StudioConfig,
  type TokenSource,
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
  onDocumentEvent,
  resolveDocument,
  resolvePermissions,
} from '../document/documentStore'
export {
  type ActionErrorEvent,
  type DocumentCreatedEvent,
  type DocumentDeletedEvent,
  type DocumentDiscardedEvent,
  type DocumentEditedEvent,
  type DocumentEvent,
  type DocumentPublishedEvent,
  type DocumentTransactionSubmissionResult,
  type DocumentUnpublishedEvent,
  type TransactionAcceptedEvent,
  type TransactionRevertedEvent,
} from '../document/events'
export {type DocumentPermissionsResult, type PermissionDeniedReason} from '../document/permissions'
export type {FavoriteStatusResponse} from '../favorites/favorites'
export {getFavoritesState, resolveFavoritesState} from '../favorites/favorites'
export {getPresenceState} from '../presence/presenceStore'
export type {
  DisconnectEvent,
  PresenceLocation,
  RollCallEvent,
  StateEvent,
  TransportEvent,
  UserPresence,
} from '../presence/types'
export type {PreviewMedia, PreviewQueryResult, PreviewValue} from '../preview/types'
export {type OrganizationVerificationResult} from '../project/organizationVerification'
export {getProjectState, type ProjectHandle, resolveProject} from '../project/project'
export {getProjectionState} from '../projection/getProjectionState'
export {resolveProjection} from '../projection/resolveProjection'
export {type ProjectionValuePending} from '../projection/types'
export {getProjectsState, resolveProjects} from '../projects/projects'
export {getQueryState, type QueryOptions, resolveQuery} from '../query/queryStore'
export {getPerspectiveState} from '../releases/getPerspectiveState'
export {getActiveReleasesState, type ReleaseDocument} from '../releases/releasesStore'
export {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
export {type Selector, type StateSource} from '../store/createStateSourceAction'
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
// must be exported since many stores are based on this type
export {type FetcherStore, type FetcherStoreState} from '../utils/createFetcherStore'
export {defineIntent, type Intent, type IntentFilter} from '../utils/defineIntent'
export {getCorsErrorProjectId} from '../utils/getCorsErrorProjectId'
export {CORE_SDK_VERSION} from '../version'
export type {CurrentUser, Role, SanityDocument} from '@sanity/types'
