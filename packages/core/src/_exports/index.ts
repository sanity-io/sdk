// Use import type to access the internal type and re-export it
import {
  type ClientConfig as _ClientConfig,
  type SanityProject as _SanityProject,
} from '@sanity/client'

/**
 * @public
 */
export type SanityProject = _SanityProject
/**
 * @public
 */
export type ClientConfig = _ClientConfig

export {AuthStateType} from '../auth/authStateType'
export {
  type AuthConfig,
  type AuthProvider,
  type AuthState,
  type AuthStoreState,
  type DashboardContext,
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
export {type ClientState} from '../client/clientStore'
export {type ClientOptions, getClient, getClientState} from '../client/clientStore'
export {destroyController} from '../comlink/controller/actions/destroyController'
export {getOrCreateChannel} from '../comlink/controller/actions/getOrCreateChannel'
export {getOrCreateController} from '../comlink/controller/actions/getOrCreateController'
export {releaseChannel} from '../comlink/controller/actions/releaseChannel'
export {
  type ChannelEntry,
  type ComlinkControllerState,
} from '../comlink/controller/comlinkControllerStore'
export {getOrCreateNode} from '../comlink/node/actions/getOrCreateNode'
export {releaseNode} from '../comlink/node/actions/releaseNode'
export {type ComlinkNodeState, type NodeEntry} from '../comlink/node/comlinkNodeStore'
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
  type DocumentState,
  type DocumentStoreState,
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
  type DeepGet,
  type DocumentHandle,
  type DocumentTypeHandle,
  type JsonMatch,
  jsonMatch,
  type JsonMatchPath,
  type MatchEntry,
  type ParseBracket,
  type ParseSegment,
  type PathParts,
  type SingleValuePath,
  type ToNumber,
} from '../document/patchOperations'
export {type DocumentResourceId, getResourceId, type ResourceId} from '../document/patchOperations'
export {type Grant} from '../document/permissions'
export {type PermissionDeniedReason, type PermissionsResult} from '../document/permissions'
export {type DocumentSet} from '../document/processMutations'
export {
  type ActionMap,
  type AppliedTransaction,
  type HttpAction,
  type OptimisticLock,
  type OutgoingTransaction,
  type QueuedTransaction,
  type UnverifiedDocumentRevision,
} from '../document/reducers'
export {createSanityInstance} from '../instance/sanityInstance'
export type {SanityConfig, SanityInstance, SdkIdentity} from '../instance/types'
export {getPreviewState, type GetPreviewStateOptions} from '../preview/getPreviewState'
export {
  type PreviewMedia,
  type PreviewStoreState,
  type PreviewValue,
  type ValuePending,
} from '../preview/previewStore'
export {resolvePreview, type ResolvePreviewOptions} from '../preview/resolvePreview'
export {getProjectState, resolveProject} from '../project/project'
export {getProjectionState, type GetProjectionStateOptions} from '../projection/getProjectionState'
export {
  type ProjectionStoreState,
  type ProjectionValuePending,
  type ValidProjection,
} from '../projection/projectionStore'
export {resolveProjection, type ResolveProjectionOptions} from '../projection/resolveProjection'
export {getProjectsState, resolveProjects} from '../projects/projects'
export {
  getQueryKey,
  getQueryState,
  parseQueryKey,
  type QueryOptions,
  resolveQuery,
  type ResolveQueryOptions,
} from '../query/queryStore'
export {type QueryState, type QueryStoreState} from '../query/reducers'
export {type ActionContext, type ResourceAction} from '../resources/createAction'
export {type ResourceState} from '../resources/createResource'
export type {StateSource} from '../resources/createStateSourceAction'
export {
  type BoundActions,
  type BoundResourceAction,
  type StoreFactory,
} from '../resources/createStore'
export {type Membership, type ResourceType, type SanityUser, type UserProfile} from '../users/types'
export {createUsersStore, type SanityUserResponse, type UsersStoreState} from '../users/usersStore'
export {
  type FetcherStore,
  type FetcherStoreState,
  type StoreEntry,
} from '../utils/createFetcherStore'
export {CORE_SDK_VERSION} from '../version'
export type {CurrentUser, Role, SanityDocument, SanityDocumentLike} from '@sanity/types'
