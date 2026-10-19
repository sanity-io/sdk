import {type DocumentStatus} from '@sanity/sdk'
import {expectTypeOf, test} from 'vitest'

import {useDocumentProjection} from './useDocumentProjection'

// Registered the way generated files do: as globals. Every file in this package's type-check
// program sees these registrations, so their keys must stay unique across the package's tests.
declare global {
  interface SanityProjectionsByResource {
    'projection1.test': {article: {'{title}': {title: string | null}}}
  }
}

// `as const` keeps the document type and projection literal, which the Typegen lookup needs.
const handle = {documentId: 'a', documentType: 'article', projection: '{title}'} as const

test('useDocumentProjection adds _status to an explicit result type', () => {
  const {data} = useDocumentProjection<{title?: string}>(handle)
  expectTypeOf(data._status).toEqualTypeOf<DocumentStatus | undefined>()
  expectTypeOf(data.title).toEqualTypeOf<string | undefined>()
})

test('useDocumentProjection adds _status to a Typegen result type', () => {
  const {data} = useDocumentProjection({...handle, projectId: 'projection1', dataset: 'test'})
  expectTypeOf(data._status).toEqualTypeOf<DocumentStatus | undefined>()
  expectTypeOf(data.title).toEqualTypeOf<string | null>()
})
