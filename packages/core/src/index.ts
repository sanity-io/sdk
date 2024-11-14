/**
 * @packageDocumentation
 * @module @sanity/sdk
 */

/** MAIN INSTANCE */
// Utils
export {createSanityInstance} from './instance/sanityInstance'
// Types
export type {SdkIdentity} from './instance/identity'
export type {SanityConfig} from './instance/sanityInstance'
export type {InternalStores, SanityInstance} from './instance/types'

/** CLIENT */
// Utils
export {getClient} from './client/getClient'
// Types
export type {ClientOptions, ClientState, ClientStore} from './client/clientStore'

/** SCHEMA */
export type {SchemaState, SchemaStore} from './schema/schemaStore'

/** TEST */
export {testFunction} from './example/example'
