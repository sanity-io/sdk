import {expectTypeOf, test} from 'vitest'

import {type ActionsResult} from '../document/applyDocumentActions'
import {
  type ResolveDocument,
  type ResolveProjectionResult,
  type ResolveQueryResult,
} from './resolve'

// Stands in for what a multi-resource `sanity typegen` run emits. Two resources whose
// schemas disagree, plus an object type that must not resolve as a document.
type TestPost = {
  _id: string
  _type: 'post'
  _createdAt: string
  _updatedAt: string
  _rev: string
  title: string
}
interface ProductionPost {
  _id: string
  _type: 'post'
  _createdAt: string
  _updatedAt: string
  _rev: string
  title: number
}
type Slug = {_type: 'slug'; current: string}

type TestPostsResult = {_id: string; title: string}[]
type ProductionPostsResult = {_id: string; title: number}[]
type TestTitleProjection = {title: string}
type AuthorTitleProjection = {title: null}

// Registered the way generated files do: as globals, which the interfaces `@sanity/client`
// exports extend. Every file in this package's type-check program sees these registrations, not
// only this test, so their keys must stay unique across the package's tests.
declare global {
  interface SanitySchemasByResource {
    'resolve1.test': TestPost | Slug
    'resolve2.production': ProductionPost
  }
  interface SanityQueriesByResource {
    'resolve1.test': {'*[_type == "post"]': TestPostsResult}
    'resolve2.production': {'*[_type == "post"]': ProductionPostsResult}
  }
  interface SanityProjectionsByResource {
    'resolve1.test': {
      author: {'{name}': {name: string}; '{title}': AuthorTitleProjection}
      post: {'{title}': TestTitleProjection}
    }
  }
}

test('registered resources resolve documents declared as aliases or interfaces', () => {
  expectTypeOf<ResolveDocument<'post', 'resolve1.test'>>().toEqualTypeOf<TestPost>()
  expectTypeOf<ResolveDocument<'post', 'resolve2.production'>>().toEqualTypeOf<ProductionPost>()
})

test('interface registrations remain usable in document action results', () => {
  type Result = ActionsResult<ResolveDocument<'post', 'resolve2.production'>>
  expectTypeOf<NonNullable<Result['documents'][string]>>().toEqualTypeOf<ProductionPost>()
})

test('a document type absent from a registered resource is never', () => {
  // Not the legacy union. Falling through would describe the wrong dataset while looking
  // precise.
  expectTypeOf<ResolveDocument<'movie', 'resolve1.test'>>().toEqualTypeOf<never>()
})

test('an object type in the schema union is not a document', () => {
  expectTypeOf<ResolveDocument<'slug', 'resolve1.test'>>().toEqualTypeOf<never>()
})

test('an unconstrained document type yields the resource documents only', () => {
  expectTypeOf<ResolveDocument<string, 'resolve1.test'>>().toEqualTypeOf<TestPost>()
})

test('an unregistered resource falls back to the legacy lookup', () => {
  // The legacy path answers with the base document shape when nothing is registered, which
  // is what keeps saved experimental output working.
  expectTypeOf<ResolveDocument<string, 'unregistered.dataset'>['_id']>().toEqualTypeOf<string>()
  expectTypeOf<ResolveDocument<'post', 'unregistered.dataset'>>().toEqualTypeOf<never>()
})

test('the same query text resolves to a different type per resource', () => {
  expectTypeOf<
    ResolveQueryResult<'*[_type == "post"]', 'resolve1.test'>
  >().toEqualTypeOf<TestPostsResult>()
  expectTypeOf<
    ResolveQueryResult<'*[_type == "post"]', 'resolve2.production'>
  >().toEqualTypeOf<ProductionPostsResult>()
})

test('an unregistered query on a registered resource is never', () => {
  expectTypeOf<ResolveQueryResult<'*[_type == "movie"]', 'resolve1.test'>>().toEqualTypeOf<never>()
})

test('a projection resolves by resource and document type', () => {
  expectTypeOf<
    ResolveProjectionResult<'{title}', 'post', 'resolve1.test'>
  >().toEqualTypeOf<TestTitleProjection>()
})

test('a handle with a widened document type gets the projection across document types', () => {
  expectTypeOf<ResolveProjectionResult<'{title}', string, 'resolve1.test'>>().toEqualTypeOf<
    TestTitleProjection | AuthorTitleProjection
  >()
  expectTypeOf<ResolveProjectionResult<'{name}', string, 'resolve1.test'>>().toEqualTypeOf<{
    name: string
  }>()
  expectTypeOf<
    ResolveProjectionResult<'{missing}', string, 'resolve1.test'>
  >().toEqualTypeOf<never>()
})

test('a projection on a document type with no registrations is never', () => {
  expectTypeOf<
    ResolveProjectionResult<'{title}', 'movie', 'resolve1.test'>
  >().toEqualTypeOf<never>()
})
