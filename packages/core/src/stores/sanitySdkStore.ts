import {type SanityClient} from '@sanity/client'
import {devtools} from 'zustand/middleware'
import {createStore, type StoreApi} from 'zustand/vanilla'

import {type ClientState, createClientStore} from './clientStore'
import {createSchemaStore, type SchemaState} from './schemaStore'

export interface SanitySdkState extends SchemaState, ClientState {}

interface SdkConfig {
  client: SanityClient
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schemaTypes: any[]
}

/** @public */
export type SanitySdkStore = StoreApi<SanitySdkState>

export const createSanitySdkStore = (config: SdkConfig): SanitySdkStore => {
  return createStore<SanitySdkState>()(
    devtools(
      (set, get, _store) => ({
        ...createSchemaStore(config.schemaTypes)(set, get),
        ...createClientStore(config.client)(set, get),
      }),
      {
        name: 'SanitySDK',
        // Optional: customize devtools settings
        enabled: true, // for real it should actually be -> process.env.NODE_ENV === 'development'
        anonymousActionType: 'unknown', // Default type for actions without names
        serialize: {
          options: true, // Include options in the serialized state
          // @ts-expect-error - implicitly has an 'any' type.ts(7006)
          replacer: (key, value) => {
            // Optional: customize serialization
            // Return undefined to exclude a property
            return value
          },
        },
      },
    ),
  )
}
