/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export const createSchemaStore = (set: any, _get: any, _store: any) => ({
  schema: {types: []},
  // @ts-expect-error - implicitly has an 'any' type.ts(7006)
  setSchema: (newSchema) => set({schema: newSchema}, undefined, 'setSchema'),
})
