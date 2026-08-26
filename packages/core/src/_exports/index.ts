import {type SanityProject as _SanityProject} from '@sanity/client'

/**
 * @public
 */
export type SanityProject = _SanityProject

export {checkPermissions} from '../access/checkPermissions'
export {type AccessResourceType} from '../access/checkPermissions'
export {
  application,
  applications,
  deleteApplication,
  updateApplication,
} from '../applications/applications'
export {
  type Application,
  type ApplicationAccess,
  type ApplicationBase,
  type ApplicationDeployment,
  type ApplicationInclude,
  type ApplicationInterface,
  type ApplicationsOptions,
  type ApplicationsResponse,
  type ApplicationStudioConfig,
  type ApplicationVisibility,
  type ApplicationWorkspace,
  type DeleteApplicationInput,
  type DeletedResult,
  type UpdateApplicationInput,
} from '../applications/applications'
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
  createComment,
  type CreateCommentOptions,
  removeComment,
  type RemoveCommentOptions,
  replyToComment,
  type ReplyToCommentOptions,
  setCommentStatus,
  type SetCommentStatusOptions,
  updateComment,
  type UpdateCommentOptions,
} from '../comments/commentActions'
export {
  type CommentsOptions,
  getCommentsState,
  getCommentThreadsState,
  resolveComments,
  type ResolveCommentsOptions,
  resolveCommentThreads,
} from '../comments/commentsStore'
export {
  type Comment,
  type CommentLocalState,
  type CommentMessage,
  type CommentReaction,
  type CommentStatus,
  type CommentTextSelection,
  type CommentTextSelectionItem,
  type CommentThread,
} from '../comments/types'
export {type AuthConfig, type AuthProvider} from '../config/authConfig'
export {
  createDatasetHandle,
  createDocumentHandle,
  createDocumentTypeHandle,
  createProjectHandle,
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
  type DatasetHandle,
  type DatasetResource,
  type DocumentHandle,
  type DocumentResource,
  type DocumentTypeHandle,
  isCanvasResource,
  isDatasetResource,
  isMediaLibraryResource,
  type MediaLibraryResource,
  type PerspectiveHandle,
  type ProjectHandle,
  type ReleaseHandle,
  type ReleasePerspective,
  type SanityConfig,
  type StudioConfig,
  type TokenSource,
} from '../config/sanityConfig'
export {datasets} from '../datasets/datasets'
export {
  type Action,
  archiveRelease,
  type ArchiveReleaseAction,
  createDocument,
  type CreateDocumentAction,
  createRelease,
  type CreateReleaseAction,
  deleteDocument,
  type DeleteDocumentAction,
  deleteRelease,
  type DeleteReleaseAction,
  discardDocument,
  type DiscardDocumentAction,
  type DocumentAction,
  editDocument,
  type EditDocumentAction,
  type EditDocumentOptions,
  editRelease,
  type EditReleaseAction,
  publishDocument,
  type PublishDocumentAction,
  publishRelease,
  type PublishReleaseAction,
  type ReleaseAction,
  scheduleRelease,
  type ScheduleReleaseAction,
  unarchiveRelease,
  type UnarchiveReleaseAction,
  unpublishDocument,
  type UnpublishDocumentAction,
  unscheduleRelease,
  type UnscheduleReleaseAction,
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
  type DocumentRemotePatchesEvent,
  type DocumentTransactionSubmissionResult,
  type DocumentUnpublishedEvent,
  type TransactionAcceptedEvent,
  type TransactionRevertedEvent,
} from '../document/events'
export {type JsonMatch} from '../document/patchOperations'
export {type DocumentPermissionsResult, type PermissionDeniedReason} from '../document/permissions'
export {getReleaseDocumentId} from '../document/processActions/releaseUtil'
export type {
  FavoriteDocumentContext,
  FavoriteStatusResponse,
  SetFavoriteInput,
} from '../favorites/favorites'
export {favorites, setFavorite} from '../favorites/favorites'
export {installation, installations} from '../installations/installations'
export {
  type Installation,
  type InstallationAccess,
  type InstallationActiveConfig,
  type InstallationBase,
  type InstallationInclude,
  type InstallationInterface,
  type InstallationsOptions,
  type InstallationsResponse,
} from '../installations/installations'
export {organization} from '../organization/organization'
export {
  type Organization,
  type OrganizationBase,
  type OrganizationMember,
  type OrganizationOptions,
} from '../organization/organization'
export {organizations} from '../organizations/organizations'
export {type Organizations, type OrganizationsOptions} from '../organizations/organizations'
export {getDocumentPresence, getPresence, reportPresence} from '../presence/presenceStore'
export type {
  DisconnectEvent,
  DocumentPresence,
  DocumentPresenceOptions,
  PresenceLocation,
  PresencePerspectiveOptions,
  PresenceSelection,
  PresenceSelectionPoint,
  ReportPresenceOptions,
  RollCallEvent,
  StateEvent,
  TransportEvent,
  UserPresence,
} from '../presence/types'
export type {PreviewMedia, PreviewQueryResult, PreviewValue} from '../preview/types'
export {type OrgVerificationResult} from '../project/organizationVerification'
export {project} from '../project/project'
export {
  type Project,
  type ProjectBase,
  type ProjectMember,
  type ProjectMemberRole,
  type ProjectMetadata,
  type ProjectOptions,
} from '../project/project'
export {getProjectionState} from '../projection/getProjectionState'
export {resolveProjection} from '../projection/resolveProjection'
export {type ProjectionValuePending} from '../projection/types'
export {projects} from '../projects/projects'
export {type ProjectsOptions} from '../projects/projects'
export {getQueryState, type QueryOptions, resolveQuery} from '../query/queryStore'
export {getPerspectiveState} from '../releases/getPerspectiveState'
export type {ReleaseState} from '../releases/releasesStore'
export {getActiveReleasesState, getAllReleasesState} from '../releases/releasesStore'
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
export {getCorsErrorProjectId} from '../utils/getCorsErrorProjectId'
export {isImportError} from '../utils/isImportError'
export {CORE_SDK_VERSION} from '../version'
export type {ReleaseDocument} from '@sanity/client'
export {
  getIndexForKey,
  getPathDepth,
  joinPaths,
  jsonMatch,
  slicePath,
  stringifyPath,
} from '@sanity/json-match'
export type {CurrentUser, Role, SanityDocument} from '@sanity/types'
