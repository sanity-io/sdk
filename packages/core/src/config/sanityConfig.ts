import {type ClientPerspective, type StackablePerspective} from '@sanity/client'

import {type AuthConfig} from './authConfig'

/**
 * A minimal Observable-compatible interface for subscribing to token changes.
 * Any object with a `subscribe` method that follows this contract will work,
 * including RxJS Observables. This avoids coupling the SDK to a specific
 * reactive library.
 *
 * @public
 */
export interface TokenSource {
  /** Subscribe to token emissions. Emits `null` when logged out. */
  subscribe(observer: {next: (token: string | null) => void}): {unsubscribe(): void}
}

/**
 * Studio-specific configuration for the SDK.
 * When present, the SDK operates in studio mode and derives auth from the
 * provided token source instead of discovering tokens independently.
 *
 * @public
 */
export interface StudioConfig {
  /**
   * Whether the Studio has already determined the user is authenticated.
   * When `true` and the token source emits `null`, the SDK infers
   * cookie-based auth is in use rather than transitioning to logged-out.
   */
  authenticated?: boolean
  /** Reactive auth token source from the Studio's auth store. */
  auth?: {
    /**
     * A reactive token source. The SDK subscribes and stays in sync — the
     * Studio is the single authority for auth and handles token refresh.
     *
     * Optional because older Studios may not expose it. When absent, the
     * SDK falls back to localStorage/cookie discovery.
     */
    token?: TokenSource
  }
}

/**
 * Represents the minimal configuration required to identify a Sanity project.
 * @public
 */
export interface ProjectHandle<TProjectId extends string = string> {
  projectId?: TProjectId
}

/**
 * @public
 */
export type ReleasePerspective = {
  releaseName: string
  excludedPerspectives?: StackablePerspective[]
}

/**
 * @public
 */
export interface PerspectiveHandle {
  perspective?: ClientPerspective | ReleasePerspective
}

/**
 * @public
 */
export interface DatasetHandle<TDataset extends string = string, TProjectId extends string = string>
  extends ProjectHandle<TProjectId>, PerspectiveHandle {
  dataset?: TDataset
  /**
   * @beta
   * Explicit resource object to use for this operation.
   */
  resource?: DocumentResource
  /**
   * @deprecated Use `resource` instead.
   * @beta
   */
  source?: DocumentResource
}

/**
 * Identifies a specific document type within a Sanity dataset and project.
 * Includes `projectId`, `dataset`, and `documentType`.
 * Optionally includes a `documentId` and `liveEdit` flag.
 * @public
 */
export interface DocumentTypeHandle<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DatasetHandle<TDataset, TProjectId> {
  documentId?: string
  documentType: TDocumentType
  /**
   * Indicates whether this document uses liveEdit mode.
   * When `true`, the document does not use the draft/published model and edits are applied directly to the document.
   * @see https://www.sanity.io/docs/content-lake/drafts#ca0663a8f002
   */
  liveEdit?: boolean
}

/**
 * Uniquely identifies a specific document within a Sanity dataset and project.
 * Includes `projectId`, `dataset`, `documentType`, and the required `documentId`.
 * Commonly used by document-related hooks and components to reference a document without fetching its full content initially.
 * @public
 */
export interface DocumentHandle<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DocumentTypeHandle<TDocumentType, TDataset, TProjectId> {
  documentId: string
}

/**
 * Represents the complete configuration for a Sanity SDK instance
 * @public
 */
export interface SanityConfig extends DatasetHandle, PerspectiveHandle {
  /**
   * Authentication configuration for the instance
   */
  auth?: AuthConfig
  /**
   * Studio configuration provided by a Sanity Studio workspace.
   * When present, the SDK operates in studio mode and derives auth from the
   * workspace's reactive token source — no manual configuration needed.
   *
   * @remarks Typically set automatically by `SanityApp` when it detects an
   * `SDKStudioContext` provider. Can also be set explicitly for programmatic use.
   */
  studio?: StudioConfig

  /**
   * Studio mode configuration for use of the SDK in a Sanity Studio.
   * @remarks Controls whether studio mode features are enabled.
   * @deprecated Use `studio` instead, which provides richer integration
   * with the Studio's workspace (auth token sync, etc.).
   */
  studioMode?: {
    enabled: boolean
  }

  /**
   * @beta
   * A list of named resources to use for this instance.
   */
  resources?: Record<string, DocumentResource>
  /**
   * @deprecated Use `resources` instead.
   * @beta
   */
  sources?: Record<string, DocumentResource>
}

/**
 * A document resource can be used for querying.
 * This will soon be the default way to identify where you are querying from.
 *
 * @beta
 */
export type DocumentResource = DatasetResource | MediaLibraryResource | CanvasResource

/**
 * @beta
 */
export type DatasetResource = {projectId: string; dataset: string}

/**
 * @beta
 */
export type MediaLibraryResource = {mediaLibraryId: string}

/**
 * @beta
 */
export type CanvasResource = {canvasId: string}

/**
 * @beta
 */
export function isDatasetResource(resource: DocumentResource): resource is DatasetResource {
  return 'projectId' in resource && 'dataset' in resource
}

/**
 * @beta
 */
export function isMediaLibraryResource(
  resource: DocumentResource,
): resource is MediaLibraryResource {
  return 'mediaLibraryId' in resource
}

/**
 * @beta
 */
export function isCanvasResource(resource: DocumentResource): resource is CanvasResource {
  return 'canvasId' in resource
}

/**
 * @deprecated Use `DocumentResource` instead.
 * @beta
 */
export type DocumentSource = DocumentResource

/**
 * @deprecated Use `DatasetResource` instead.
 * @beta
 */
export type DatasetSource = DatasetResource

/**
 * @deprecated Use `MediaLibraryResource` instead.
 * @beta
 */
export type MediaLibrarySource = MediaLibraryResource

/**
 * @deprecated Use `CanvasResource` instead.
 * @beta
 */
export type CanvasSource = CanvasResource

/**
 * @deprecated Use `isDatasetResource` instead.
 * @beta
 */
export function isDatasetSource(source: DocumentSource): source is DatasetSource {
  return isDatasetResource(source)
}

/**
 * @deprecated Use `isMediaLibraryResource` instead.
 * @beta
 */
export function isMediaLibrarySource(source: DocumentSource): source is MediaLibrarySource {
  return isMediaLibraryResource(source)
}

/**
 * @deprecated Use `isCanvasResource` instead.
 * @beta
 */
export function isCanvasSource(source: DocumentSource): source is CanvasSource {
  return isCanvasResource(source)
}
