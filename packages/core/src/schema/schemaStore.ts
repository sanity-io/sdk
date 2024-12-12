/* eslint-disable @typescript-eslint/no-explicit-any */
import type {StoreApi} from 'zustand'
import {devtools} from 'zustand/middleware'
import {createStore} from 'zustand/vanilla'

/** @public */
export interface SchemaState {
  schema: any
  setSchema: (newSchema: any) => void
}

/** @public */
export type SchemaStore = StoreApi<SchemaState>

/**
 * This is an internal function that creates a Zustand store for the schema.
 * @internal
 */
export const createSchemaStore = (schemaTypes: any[]): SchemaStore => {
  return createStore<SchemaState>()(
    devtools(
      (set) => ({
        schema: {types: schemaTypes},
        setSchema: (newSchema) => set({schema: newSchema}, false, 'setSchema'),
      }),
      {
        name: 'SanitySchemaStore',
        enabled: import.meta.env.DEV,
      },
    ),
  )
}
