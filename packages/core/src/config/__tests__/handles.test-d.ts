import {type ClientPerspective} from '@sanity/client'
import {describe, expectTypeOf, test} from 'vitest'

import {createDatasetHandle, createDocumentHandle, createDocumentTypeHandle} from '../handles'
import {type DocumentHandle, type ReleasePerspective, type SanityConfig} from '../sanityConfig'

// `createDocumentHandle` exists to capture the literal types of its input. Its runtime
// behavior, returning the input unchanged, is covered in `handles.test.ts` and is the
// uninteresting half: a signature change that dropped `TDataset` or `TProjectId` would
// pass every runtime test while silently removing inference for every consumer.
//
// Typegen looks results up by a `projectId.dataset` key, so a handle carrying `string`
// instead of a literal matches nothing.
//
// A handle that names both `projectId` and `dataset` matches the first overload, which returns
// both fields as required. Every other handle matches the second overload, which returns the
// `DocumentHandle` interface unchanged, so those fields stay optional.

// Mirrors React's `useState` declaration. Core has no React dependency, and what the test needs
// is the inference: `S` comes from the initial value, and the setter accepts any other `S`.
declare function useState<S>(
  initialState: S | (() => S),
): [S, (value: S | ((prev: S) => S)) => void]

const authorHandle = createDocumentHandle({
  projectId: 'ppsg7ml5',
  dataset: 'test',
  documentId: 'some-id',
  documentType: 'author',
})

describe('createDocumentHandle with projectId and dataset', () => {
  test('returns projectId and dataset as required literals', () => {
    expectTypeOf(authorHandle.projectId).toEqualTypeOf<'ppsg7ml5'>()
    expectTypeOf(authorHandle.dataset).toEqualTypeOf<'test'>()
    expectTypeOf(authorHandle.documentType).toEqualTypeOf<'author'>()
    expectTypeOf(authorHandle.documentId).toEqualTypeOf<string>()
  })

  test('is assignable to the DocumentHandle for its resource', () => {
    expectTypeOf(authorHandle).toExtend<DocumentHandle<'author', 'test', 'ppsg7ml5'>>()
    // @ts-expect-error The handle belongs to the `test` dataset.
    expectTypeOf(authorHandle).toExtend<DocumentHandle<'author', 'production', 'ppsg7ml5'>>()
  })

  test('keeps fields that were not passed readable and optional', () => {
    expectTypeOf(authorHandle.perspective).toEqualTypeOf<
      ClientPerspective | ReleasePerspective | undefined
    >()
    // @ts-expect-error `perspective` was not passed, so it stays optional.
    expectTypeOf(authorHandle).toExtend<{perspective: unknown}>()
  })

  test('can be reassigned to a handle for another document', () => {
    let handle = createDocumentHandle({
      projectId: 'ppsg7ml5',
      dataset: 'test',
      documentId: 'a',
      documentType: 'author',
    })
    expectTypeOf(handle.documentId).toEqualTypeOf<string>()
    handle = createDocumentHandle({
      projectId: 'ppsg7ml5',
      dataset: 'test',
      documentId: 'b',
      documentType: 'author',
    })
    handle = {...handle, documentId: 'c'}
    expectTypeOf(handle.projectId).toEqualTypeOf<'ppsg7ml5'>()
  })

  test('works as useState state', () => {
    const [handle, setHandle] = useState(authorHandle)
    setHandle(
      createDocumentHandle({
        projectId: 'ppsg7ml5',
        dataset: 'test',
        documentId: 'b',
        documentType: 'author',
      }),
    )
    setHandle((prev) => ({...prev, documentId: 'c'}))
    expectTypeOf(handle.projectId).toEqualTypeOf<'ppsg7ml5'>()
  })

  // The cost of returning the fields as required: state inferred from this handle no longer
  // accepts a handle whose fields are optional, such as a `DocumentHandle` prop or a
  // `useDocuments` result for the same resource. Annotating the state type restores that.
  test('state inferred from it requires the fields; annotated state does not', () => {
    const fromProps: DocumentHandle<'author', 'test', 'ppsg7ml5'> = {
      projectId: 'ppsg7ml5',
      dataset: 'test',
      documentId: 'b',
      documentType: 'author',
    }

    const [, setInferred] = useState(authorHandle)
    // @ts-expect-error The inferred state type requires `projectId` and `dataset`.
    setInferred(fromProps)

    const [, setAnnotated] = useState<DocumentHandle<'author', 'test', 'ppsg7ml5'>>(authorHandle)
    setAnnotated(fromProps)
  })

  test('accepts explicit type arguments', () => {
    const typeOnly = createDocumentHandle<'author'>({
      projectId: 'ppsg7ml5',
      dataset: 'test',
      documentId: 'a',
      documentType: 'author',
    })
    expectTypeOf(typeOnly.projectId).toEqualTypeOf<string>()

    const allArguments = createDocumentHandle<'author', 'test', 'p1'>({
      projectId: 'p1',
      dataset: 'test',
      documentId: 'a',
      documentType: 'author',
    })
    expectTypeOf(allArguments.projectId).toEqualTypeOf<'p1'>()
    expectTypeOf(allArguments.dataset).toEqualTypeOf<'test'>()
  })
})

describe('createDocumentHandle without both projectId and dataset', () => {
  test('keeps projectId optional for an input typed as DocumentHandle', () => {
    const input: DocumentHandle = {
      projectId: 'ppsg7ml5',
      dataset: 'test',
      documentId: 'a',
      documentType: 'author',
    }
    const handle = createDocumentHandle(input)
    expectTypeOf(handle.projectId).toEqualTypeOf<string | undefined>()
    // @ts-expect-error The input type does not guarantee `projectId`.
    expectTypeOf(handle).toExtend<{projectId: string}>()
  })

  test('keeps projectId and dataset optional for a handle without a resource', () => {
    const handle = createDocumentHandle({documentId: 'a', documentType: 'author'})
    expectTypeOf(handle.projectId).toEqualTypeOf<string | undefined>()
    expectTypeOf(handle.dataset).toEqualTypeOf<string | undefined>()
    // @ts-expect-error `projectId` was not passed.
    expectTypeOf(handle).toExtend<{projectId: string}>()
    // @ts-expect-error `dataset` was not passed.
    expectTypeOf(handle).toExtend<{dataset: string}>()
  })

  test('keeps both fields optional when they are spread from a SanityConfig', () => {
    const config: SanityConfig = {projectId: 'ppsg7ml5', dataset: 'test'}
    const handle = createDocumentHandle({...config, documentId: 'a', documentType: 'author'})
    expectTypeOf(handle.projectId).toEqualTypeOf<string | undefined>()
    // @ts-expect-error `SanityConfig` types `projectId` as `string | undefined`.
    expectTypeOf(handle).toExtend<{projectId: string}>()
  })

  test('keeps both fields optional for a handle with only a projectId', () => {
    const handle = createDocumentHandle({
      projectId: 'ppsg7ml5',
      documentId: 'a',
      documentType: 'author',
    })
    expectTypeOf(handle.projectId).toEqualTypeOf<'ppsg7ml5' | undefined>()
    // @ts-expect-error Only a handle with both fields returns `projectId` as required.
    expectTypeOf(handle).toExtend<{projectId: string}>()
  })

  test('keeps both fields optional for a handle with only a dataset', () => {
    const handle = createDocumentHandle({
      dataset: 'test',
      documentId: 'a',
      documentType: 'author',
    })
    expectTypeOf(handle.dataset).toEqualTypeOf<'test' | undefined>()
    // @ts-expect-error `projectId` was not passed.
    expectTypeOf(handle).toExtend<{projectId: string}>()
    // @ts-expect-error Only a handle with both fields returns `dataset` as required.
    expectTypeOf(handle).toExtend<{dataset: string}>()
  })
})

describe('createDocumentTypeHandle', () => {
  test('returns projectId and dataset as required literals when both are passed', () => {
    const handle = createDocumentTypeHandle({
      projectId: 'ppsg7ml5',
      dataset: 'test',
      documentType: 'author',
    })
    expectTypeOf(handle.projectId).toEqualTypeOf<'ppsg7ml5'>()
    expectTypeOf(handle.dataset).toEqualTypeOf<'test'>()

    // Spreading it into `createDocumentHandle` keeps the fields required.
    const documentHandle = createDocumentHandle({...handle, documentId: 'a'})
    expectTypeOf(documentHandle.projectId).toEqualTypeOf<'ppsg7ml5'>()
  })

  test('keeps projectId optional when it is not passed', () => {
    const handle = createDocumentTypeHandle({dataset: 'test', documentType: 'author'})
    // @ts-expect-error `projectId` was not passed.
    expectTypeOf(handle).toExtend<{projectId: string}>()
  })
})

describe('createDatasetHandle', () => {
  test('returns projectId and dataset as required literals when both are passed', () => {
    const handle = createDatasetHandle({projectId: 'ppsg7ml5', dataset: 'test'})
    expectTypeOf(handle.projectId).toEqualTypeOf<'ppsg7ml5'>()
    expectTypeOf(handle.dataset).toEqualTypeOf<'test'>()
  })

  test('keeps projectId optional when it is not passed', () => {
    const handle = createDatasetHandle({dataset: 'test'})
    // @ts-expect-error `projectId` was not passed.
    expectTypeOf(handle).toExtend<{projectId: string}>()
  })
})
