import type {ClientStore} from '../client/store/clientStore'
import type {SchemaStore} from '../schema/schemaStore'
import type {SanityConfig} from './sanityInstance'

/** @public */
export interface InternalStores {
  clientStore?: ClientStore
  schemaStore?: SchemaStore
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
}

/** @public */
export interface SdkIdentity {
  readonly id: string
  readonly projectId: string
  readonly dataset: string
}
