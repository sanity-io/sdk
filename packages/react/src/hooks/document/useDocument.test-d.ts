import {createDocumentHandle} from '@sanity/sdk'
import {expectTypeOf, test} from 'vitest'

import {useDocument} from './useDocument'

// End-to-end check that the resource-keyed lookup reaches the hook. The resolver reads
// `SanitySchemasByResource`; this asserts `useDocument` passes the handle's project and
// dataset through to it.
//
// Only covers the form where the literals are written at the call site. A handle built from
// a selected resource, or arriving as a `DocumentHandle<'post'>` prop, still carries `string`
// and resolves to nothing. That is the propagation work, tracked separately.

type HookPost = {
  _id: string
  _type: 'post'
  _createdAt: string
  _updatedAt: string
  _rev: string
  title: string
}
interface ProductionPost extends Omit<HookPost, 'title'> {
  title: number
}

declare module '@sanity/client' {
  interface SanitySchemasByResource {
    'hook1.test': HookPost
    'hook2.production': ProductionPost
  }
}

const testHandle = createDocumentHandle({
  projectId: 'hook1',
  dataset: 'test',
  documentId: 'a',
  documentType: 'post',
})
const productionHandle = createDocumentHandle({
  projectId: 'hook2',
  dataset: 'production',
  documentId: 'a',
  documentType: 'post',
})

test('useDocument resolves the document type for each handle resource', () => {
  expectTypeOf(useDocument(testHandle).data).toEqualTypeOf<HookPost | null>()
  expectTypeOf(useDocument(productionHandle).data).toEqualTypeOf<ProductionPost | null>()
})

test('useDocument preserves the resource when selecting a field', () => {
  expectTypeOf(useDocument({...testHandle, path: 'title'}).data).toEqualTypeOf<string | undefined>()
  expectTypeOf(useDocument({...productionHandle, path: 'title'}).data).toEqualTypeOf<
    number | undefined
  >()
})

test('explicit resource generics require a matching handle', () => {
  useDocument<'title', 'post', 'test', 'hook1'>({...testHandle, path: 'title'})
  // @ts-expect-error The handle belongs to a different project and dataset.
  useDocument<'title', 'post', 'test', 'hook1'>({...productionHandle, path: 'title'})
})
