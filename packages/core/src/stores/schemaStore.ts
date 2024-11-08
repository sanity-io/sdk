/* eslint-disable @typescript-eslint/no-explicit-any */
import type {StateCreator} from 'zustand'

export interface SchemaState {
  schema: any
}

type SchemaSlice = (
  set: Parameters<StateCreator<SchemaState>>[0],
  get: Parameters<StateCreator<SchemaState>>[1],
) => SchemaState

// @ts-expect-error - implicitly has an 'any' type
export const createSchemaStore = (schemaTypes: any[]): SchemaSlice => {
  // @ts-expect-error unused-var
  return (set, get) => ({
    schema: {types: []},
    // @ts-expect-error - implicitly has an 'any' type.ts(7006)
    setSchema: (newSchema) => set({schema: newSchema}, undefined, 'setSchema'),
  })
}
