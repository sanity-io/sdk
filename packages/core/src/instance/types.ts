/* eslint-disable import/consistent-type-specifier-style */
// NOTE: These have to be type import because we do not want the side-effect
// of importing these modules, we just want the types for their configs
import type {AuthConfig} from '../auth/authStore'
import type {ResourceId} from '../document/patchOperations'
import type {SchemaConfig} from '../schema/schemaManager'

/**
 * @public
 */
export interface SanityConfig {
  projectId: string
  dataset: string
  auth?: AuthConfig
  schema?: SchemaConfig
}

/** @public */
export interface SanityInstance {
  /**
   * The following is used to look up resources associated with this instance,
   * and can be used to retrieve an "id" for the instance - useful in debugging.
   *
   * @public
   */
  readonly identity: SdkIdentity

  config: Omit<SanityConfig, 'projectId' | 'dataset'>

  dispose: () => void
}

/** @public */
export interface SdkIdentity {
  readonly id: string
  readonly projectId: string
  readonly dataset: string
  readonly resourceId: ResourceId
}
