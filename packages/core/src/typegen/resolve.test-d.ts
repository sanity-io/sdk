import {expectTypeOf, test} from 'vitest'

import {defineProjection} from './defineProjection'
import {
  type ResolveDocument,
  type ResolveProjectionResult,
  type ResolveQueryResult,
} from './resolve'

// A type alias, not an interface, matching what Typegen emits: aliases carry an implicit
// index signature, which `DocumentSet` requires.
type Post = {
  _id: string
  _type: 'post'
  _createdAt: string
  _updatedAt: string
  _rev: string
  title: string
}

// Shares the resource's key space with `Post` but is not a document, so
// `ResolveDocument` must not return it.
type Seo = {
  _type: 'seo'
  description: string
}

// What `sanity typegen generate` emits: flat, keyed by query string, no resource.
declare module '@sanity/client' {
  interface SanityQueries {
    '*[_type == "flat"]': {_id: string; flat: true}[]
  }
}

declare module '@sanity/client' {
  interface SanitySchemasByResource {
    'new.dataset': Post | Seo
  }
  interface SanityQueriesByResource {
    'new.dataset': {'*[_type == "post"]': Post[]}
  }
  interface SanityProjectionsByResource {
    'new.dataset': {'{title}': {post: {title: string | null}}}
  }
}

// Augmenting `groq` here would change what the other test files in this program resolve:
// the legacy lookups fall back to the union of every registered schema when a key is
// absent. The kitchensink covers the legacy path instead, through the file its `install`
// script generates.

test('ResolveDocument — resolves a document from the @sanity/client resource space', () => {
  expectTypeOf<ResolveDocument<'post', 'new.dataset'>>().toEqualTypeOf<Post>()
})

test('ResolveDocument — never returns a non-document type from the same schema', () => {
  expectTypeOf<ResolveDocument<'seo', 'new.dataset'>>().toEqualTypeOf<never>()
})

test('ResolveDocument — an unconstrained lookup still yields a usable document shape', () => {
  expectTypeOf<ResolveDocument<string, 'unregistered.dataset'>['_id']>().toEqualTypeOf<string>()
})

test('ResolveDocument — a named type on an unregistered resource resolves to never', () => {
  // Inherited from the experimental fork: a `_type` that no augmentation registers
  // narrows to nothing. Callers pass an explicit generic to the hook instead.
  expectTypeOf<ResolveDocument<'post', 'unregistered.dataset'>>().toEqualTypeOf<never>()
})

test('ResolveQueryResult — resolves from the @sanity/client resource space', () => {
  expectTypeOf<ResolveQueryResult<'*[_type == "post"]', 'new.dataset'>>().toEqualTypeOf<Post[]>()
})

test('ResolveQueryResult — falls back to the flat SanityQueries space', () => {
  expectTypeOf<ResolveQueryResult<'*[_type == "flat"]', 'any.resource'>>().toEqualTypeOf<
    {_id: string; flat: true}[]
  >()
})

test('ResolveQueryResult — the resource space wins over the flat space', () => {
  expectTypeOf<ResolveQueryResult<'*[_type == "post"]', 'new.dataset'>>().toEqualTypeOf<Post[]>()
})

test('ResolveQueryResult — the flat space wins over the loose legacy lookup', () => {
  // An app mid-migration holds a legacy `sanity.types.ts` and a newly generated one. The
  // legacy lookup answers for keys it does not carry, so the exact flat lookup runs first.
  expectTypeOf<ResolveQueryResult<'*[_type == "flat"]', 'legacy.dataset'>>().toEqualTypeOf<
    {_id: string; flat: true}[]
  >()
})

test('ResolveProjectionResult — narrows by projection and by document type', () => {
  expectTypeOf<ResolveProjectionResult<'{title}', 'post', 'new.dataset'>>().toEqualTypeOf<{
    title: string | null
  }>()
})

test('defineProjection — preserves the projection as a literal type', () => {
  // Typegen keys its result map on the literal, so widening to `string` would break
  // every projection lookup.
  expectTypeOf(defineProjection('{name}')).toEqualTypeOf<'{name}'>()
})
