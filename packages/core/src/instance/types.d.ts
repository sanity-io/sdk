import type {ClientStore} from '../client/clientStore'
import type {SchemaStore} from '../schema/schemaStore'

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

  config: {
    /** @todo refactor - if we are binding clients to the identity, we can't have the token changing without those clients getting updated */
    token?: string
  }
}

/** @public */
export interface SdkIdentity {
  readonly id: string
  readonly projectId: string
  readonly dataset: string
}
