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
   * The following is used to look up resources associated with this instance.
   */
  readonly instanceId: unique symbol

  config: {
    projectId: string
    dataset: string
    token?: string
  }
}
