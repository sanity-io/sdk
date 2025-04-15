import {type ClientPerspective, type StackablePerspective} from '@sanity/client'
import {type SanityDocumentLike} from '@sanity/types'

import {type AuthConfig} from './authConfig'

/**
 * @public
 */
export interface ProjectHandle {
  projectId?: string | undefined
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
export interface DatasetHandle extends ProjectHandle, PerspectiveHandle {
  dataset?: string | undefined
}

/** @public */
export interface DocumentTypeHandle<TDocument extends SanityDocumentLike = SanityDocumentLike>
  extends DatasetHandle {
  documentId?: string
  documentType: TDocument['_type']
}

/**
 * @public
 * A minimal set of metadata for a given document, comprising the document's ID and type.
 * Used by most document-related hooks (such as {@link usePreview}, {@link useDocument}, and {@link useEditDocument})
 * to reference a particular document without fetching the entire document upfront.
 * @category Types
 */
export interface DocumentHandle<TDocument extends SanityDocumentLike = SanityDocumentLike>
  extends DocumentTypeHandle<TDocument> {
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
}
