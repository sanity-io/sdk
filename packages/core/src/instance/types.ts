/* eslint-disable import/consistent-type-specifier-style */
// NOTE: These have to be type import because we do not want the side-effect
// of importing these modules, we just want the types for their configs
import type {AuthConfig} from '../auth/authStore'
import type {SchemaConfig} from '../schema/schemaManager'

/**
 * @public
 */
export interface SanityConfig {
  resources: SdkResource[]
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
  readonly resources: SdkResource[]

  config: Omit<SanityConfig, 'resources'>

  dispose: () => void
}

/** @public */
export interface SdkResource {
  readonly id?: string
  readonly projectId: string
  readonly dataset: string
}
