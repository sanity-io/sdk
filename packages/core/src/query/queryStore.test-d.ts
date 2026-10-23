import {defineQuery} from 'groq'
import {describe, expectTypeOf, test} from 'vitest'

import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {type ResolveQueryResult} from '../typegen/resolve'
import {
  getQueryState,
  type QueryOptions,
  resolveQuery,
  type ResolveQueryOptions,
} from './queryStore'

declare const instance: SanityInstance

type Post = {_id: string; _type: 'post'; title: string}
type PostsBySearchResult = Array<Pick<Post, '_id' | 'title'>>
type PostsBySearchParams = {searchQuery: string; start: number; end: number}

// The brand `@sanity-labs/groq-content-mapper` puts on the default export of an imported `.groq`
// file, written out by hand: the SDK reads it structurally and must not depend on that package.
type PostsBySearchQuery = string & {
  __groqResult: PostsBySearchResult
  __groqParams: PostsBySearchParams
}
declare const postsBySearch: PostsBySearchQuery

// The same brand with optional phantom properties, the way the client's own tests declare it.
declare const firstPost: '*[_type == "post"][0]' & {
  readonly __groqResult?: Post | null
  readonly __groqParams?: Record<string, never>
}

// A params type declared as an interface has no index signature.
interface SlugParams {
  slug: string
}
declare const postBySlug: string & {__groqResult: Post | null; __groqParams: SlugParams}

type RegisteredResult = {registered: true}
type BrandedResult = {branded: true}

// Registered the way generated files do: as globals, which the interfaces `@sanity/client`
// exports extend. Every file in this package's type-check program sees these registrations, not
// only this test, so their keys must stay unique across the package's tests.
declare global {
  interface SanityQueriesByResource {
    'querystore1.test': {'*[_type == "queryStoreRegistered"]': RegisteredResult}
  }
}
// The registered query text, carrying a brand that says something else.
declare const brandedRegistered: '*[_type == "queryStoreRegistered"]' & {
  __groqResult: BrandedResult
  __groqParams: Record<string, never>
}

describe('ResolveQueryResult', () => {
  test('reads the __groqResult brand', () => {
    expectTypeOf<ResolveQueryResult<PostsBySearchQuery>>().toEqualTypeOf<PostsBySearchResult>()
    expectTypeOf<ResolveQueryResult<typeof firstPost>>().toEqualTypeOf<Post | null>()
  })

  test('the brand wins over a resource registration for the same query text', () => {
    expectTypeOf<
      ResolveQueryResult<typeof brandedRegistered, 'querystore1.test'>
    >().toEqualTypeOf<BrandedResult>()
    expectTypeOf<
      ResolveQueryResult<'*[_type == "queryStoreRegistered"]', 'querystore1.test'>
    >().toEqualTypeOf<RegisteredResult>()
  })

  test('unbranded queries resolve as before', () => {
    expectTypeOf<ResolveQueryResult>().toEqualTypeOf<never>()
    expectTypeOf<ResolveQueryResult<'*[_type == "unregistered"]'>>().toEqualTypeOf<never>()
    expectTypeOf<
      ResolveQueryResult<'*[_type == "queryStoreRegistered"]', `${string}.${string}`>
    >().toEqualTypeOf<RegisteredResult>()
    expectTypeOf<
      ResolveQueryResult<'*[_type == "unregistered"]', 'querystore1.test'>
    >().toEqualTypeOf<never>()
  })
})

describe('QueryOptions', () => {
  test('types params from the __groqParams brand', () => {
    expectTypeOf<QueryOptions<PostsBySearchQuery>['params']>().toEqualTypeOf<
      PostsBySearchParams | undefined
    >()
  })

  test('unbranded queries keep the open params record', () => {
    expectTypeOf<QueryOptions['params']>().toEqualTypeOf<Record<string, unknown> | undefined>()
    expectTypeOf<QueryOptions<'*[_type == "post"]'>['params']>().toEqualTypeOf<
      Record<string, unknown> | undefined
    >()
  })
})

describe('getQueryState', () => {
  test('a branded query types the result and checks the params, with no generic', () => {
    expectTypeOf(
      getQueryState(instance, {query: postsBySearch, params: {searchQuery: 'a', start: 0, end: 9}}),
    ).toEqualTypeOf<StateSource<PostsBySearchResult | undefined>>()
    expectTypeOf(getQueryState(instance, {query: firstPost})).toEqualTypeOf<
      StateSource<Post | null | undefined>
    >()
    expectTypeOf(getQueryState(instance, {query: postBySlug, params: {slug: 'a'}})).toEqualTypeOf<
      StateSource<Post | null | undefined>
    >()

    // @ts-expect-error -- `start` and `end` are required
    getQueryState(instance, {query: postsBySearch, params: {searchQuery: 'a'}})
    getQueryState(instance, {
      query: postsBySearch,
      // @ts-expect-error -- `start` is a number
      params: {searchQuery: 'a', start: '0', end: 9},
    })
    getQueryState(instance, {
      query: postsBySearch,
      // @ts-expect-error -- `limit` is not a param of this query
      params: {searchQuery: 'a', start: 0, end: 9, limit: 10},
    })
    // @ts-expect-error -- this query declares no params
    getQueryState(instance, {query: firstPost, params: {slug: 'a'}})
  })

  test('the brand wins over a resource registration', () => {
    expectTypeOf(
      getQueryState(instance, {
        query: brandedRegistered,
        projectId: 'querystore1',
        dataset: 'test',
      }),
    ).toEqualTypeOf<StateSource<BrandedResult | undefined>>()
  })

  test('an explicit generic overrides the brand, with open params', () => {
    expectTypeOf(
      getQueryState<{custom: true}>(instance, {query: postsBySearch, params: {anything: 1}}),
    ).toEqualTypeOf<StateSource<{custom: true} | undefined>>()
  })

  test('plain strings, defineQuery and registered queries resolve as before', () => {
    expectTypeOf(
      getQueryState(instance, {query: '*[_type == "queryStoreUnregistered"]'}),
    ).toEqualTypeOf<StateSource<undefined>>()
    const definedQuery = defineQuery('*[_type == "queryStoreRegistered"]')
    expectTypeOf(
      getQueryState(instance, {query: definedQuery, projectId: 'querystore1', dataset: 'test'}),
    ).toEqualTypeOf<StateSource<RegisteredResult | undefined>>()
    expectTypeOf(
      getQueryState(instance, {query: definedQuery, params: {anything: 1}}),
    ).toEqualTypeOf<StateSource<RegisteredResult | undefined>>()
    expectTypeOf(
      getQueryState<Post[]>(instance, {query: '*[_type == "post"]', params: {anything: 1}}),
    ).toEqualTypeOf<StateSource<Post[] | undefined>>()
  })

  test('a query known only as string still accepts any params record', () => {
    const query: string = '*[_type == $type]'
    getQueryState(instance, {query, params: {type: 'post'}})
  })
})

test('the signatures read off the last overloads are unchanged', () => {
  expectTypeOf<Parameters<typeof getQueryState>>().toEqualTypeOf<[SanityInstance, QueryOptions]>()
  expectTypeOf<ReturnType<typeof getQueryState>>().toEqualTypeOf<StateSource<unknown>>()
  expectTypeOf<Parameters<typeof resolveQuery>>().toEqualTypeOf<
    [SanityInstance, ResolveQueryOptions]
  >()
  expectTypeOf<ReturnType<typeof resolveQuery>>().toEqualTypeOf<Promise<unknown>>()
})

describe('resolveQuery', () => {
  test('a branded query types the result and checks the params, with no generic', () => {
    expectTypeOf(
      resolveQuery(instance, {query: postsBySearch, params: {searchQuery: 'a', start: 0, end: 9}}),
    ).toEqualTypeOf<Promise<PostsBySearchResult>>()
    expectTypeOf(resolveQuery(instance, {query: firstPost})).toEqualTypeOf<Promise<Post | null>>()

    // @ts-expect-error -- `start` and `end` are required
    void resolveQuery(instance, {query: postsBySearch, params: {searchQuery: 'a'}})
  })

  test('plain strings and explicit generics resolve as before', () => {
    expectTypeOf(
      resolveQuery(instance, {query: '*[_type == "queryStoreUnregistered"]'}),
    ).resolves.toBeNever()
    expectTypeOf(
      resolveQuery<Post[]>(instance, {query: '*[_type == "post"]', params: {anything: 1}}),
    ).toEqualTypeOf<Promise<Post[]>>()
  })
})
