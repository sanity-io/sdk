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
  perspective?: Exclude<ClientPerspective, readonly unknown[]> | ReleasePerspective
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
 * The key used to identify the default resource in a resources map.
 * When no `resource` or `resourceName` is specified, the SDK resolves
 * the resource registered under this name.
 *
 * @public
 */
export const DEFAULT_RESOURCE_NAME = 'default'

/**
 * Represents the complete configuration for a Sanity SDK instance.
 *
 * Most apps configure resources via the `resources` prop on `SanityApp`:
 *
 * @example Typical React usage
 * ```tsx
 * <SanityApp
 *   resources={{ default: { projectId: 'abc123', dataset: 'production' } }}
 *   fallback={<Loading />}
 * >
 *   <App />
 * </SanityApp>
 * ```
 *
 * The `defaultResource` field is set automatically by the React layer from
 * `resources['default']`. It can also be set directly when using the core
 * SDK without React (e.g. in a Node.js script):
 *
 * @example Direct core usage (without React)
 * ```ts
 * const instance = createSanityInstance({
 *   defaultResource: { projectId: 'abc123', dataset: 'production' },
 * })
 * ```
 *
 * @public
 */
export interface SanityConfig extends PerspectiveHandle {
  /**
   * Authentication configuration for the instance
   * @remarks Merged with parent configurations when using createChild
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
   * The default document resource for this instance. Used by auth (projectId),
   * client fallback, and logging when no explicit resource is provided.
   *
   * @beta
   */
  defaultResource?: DocumentResource
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
 * Resolves the default `DocumentResource` from a `SanityConfig`.
 *
 * @internal
 */
export function resolveDefaultResource(config: SanityConfig): DocumentResource | undefined {
  return config.defaultResource
}

/**
 * Extracts the `projectId` from the config's default resource.
 * Returns `undefined` when no default resource exists or it is not a
 * {@link DatasetResource}.
 *
 * Useful for project-level operations (auth, CORS, project API) that
 * need a projectId but should not depend on data-targeting config.
 *
 * @internal
 */
export function getDefaultProjectId(config: SanityConfig): string | undefined {
  const resource = resolveDefaultResource(config)
  if (resource && isDatasetResource(resource)) return resource.projectId
  return undefined
}

/**
 * Extracts `projectId` and `dataset` from the config's default resource.
 * Returns `undefined` when no default resource exists or it is not a
 * {@link DatasetResource}.
 *
 * @internal
 */
export function getDefaultDatasetResource(config: SanityConfig): DatasetResource | undefined {
  const resource = resolveDefaultResource(config)
  if (resource && isDatasetResource(resource)) return resource
  return undefined
}
