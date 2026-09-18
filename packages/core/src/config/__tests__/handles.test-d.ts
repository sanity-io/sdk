import {expectTypeOf, test} from 'vitest'

import {createDocumentHandle} from '../handles'

// `createDocumentHandle` exists to capture the literal types of its input. Its runtime
// behavior, returning the input unchanged, is covered in `handles.test.ts` and is the
// uninteresting half: a signature change that dropped `TDataset` or `TProjectId` would
// pass every runtime test while silently removing inference for every consumer.
//
// Typegen looks results up by a `projectId.dataset` key, so a handle carrying `string`
// instead of a literal matches nothing.

test('createDocumentHandle preserves the literal types of its input', () => {
  const handle = createDocumentHandle({
    projectId: 'ppsg7ml5',
    dataset: 'test',
    documentId: 'some-id',
    documentType: 'author',
  })

  expectTypeOf(handle.projectId).toEqualTypeOf<'ppsg7ml5' | undefined>()
  expectTypeOf(handle.dataset).toEqualTypeOf<'test' | undefined>()
  expectTypeOf(handle.documentType).toEqualTypeOf<'author'>()
})
