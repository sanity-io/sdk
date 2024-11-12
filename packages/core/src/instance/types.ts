import type {ClientStore} from '../client/clientStore'
import type {SchemaStore} from '../schema/schemaStore'
import {storesKey} from './sanityInstance'

/** @public */
export interface InternalStores {
  clientStore?: ClientStore
  schemaStore?: SchemaStore
}

/** @public */
export interface SanityInstance {
  config: {
    projectId: string
    dataset: string
    token?: string
  }
  // a symbol to ensure it can't be accessed from outside the package
  [storesKey]: InternalStores
}
