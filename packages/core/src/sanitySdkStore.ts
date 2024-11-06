import {devtools} from 'zustand/middleware'
import {createStore} from 'zustand/vanilla'

import {createSchemaStore} from './config/schemaStore'

/** @public */
export const sanitySdkStore = createStore(
  devtools(
    (...a) => ({
      ...createSchemaStore(...a),
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
