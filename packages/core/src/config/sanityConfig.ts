import {type ClientPerspective, type StackablePerspective} from '@sanity/client'

import {type AuthConfig} from './authConfig'

/**
 * Type for intent handler functions that process specific intent payloads
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IntentHandler<TPayload = any> = (payload: TPayload) => Promise<void>

/**
 * Configuration for intent handlers that process various intent types
 * @public
 */
export interface IntentHandlers {
  [key: string]: IntentHandler
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
  extends ProjectHandle<TProjectId>,
    PerspectiveHandle {
  dataset?: TDataset
}

/**
 * Identifies a specific document type within a Sanity dataset and project.
 * Includes `projectId`, `dataset`, and `documentType`.
 * Optionally includes a `documentId`, useful for referencing a specific document type context, potentially without a specific document ID.
 * @public
 */
export interface DocumentTypeHandle<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DatasetHandle<TDataset, TProjectId> {
  documentId?: string
  documentType: TDocumentType
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
   * @remarks Merged with parent configurations when using createChild
   */
  auth?: AuthConfig
  /**
   * Studio mode configuration for use of the SDK in a Sanity Studio
   * @remarks Controls whether studio mode features are enabled
   */
  studioMode?: {
    enabled: boolean
  }
  /**
   * Intent handlers for processing various intent types
   * @remarks Object where keys are intent names and values are async handler functions
   * @example
   * ```typescript
   * {
   *   handleTranslation: async (payload: TranslationPayload) => {
   *     // Handle translation intent
   *   },
   *   handlePreview: async (payload: PreviewPayload) => {
   *     // Handle preview intent
   *   }
   * }
   * ```
   */
  intentHandlers?: IntentHandlers
}
