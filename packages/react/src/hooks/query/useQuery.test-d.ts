import {defineQuery} from 'groq'
import {expectTypeOf, test} from 'vitest'

import {useQuery} from './useQuery'

type Post = {_id: string; _type: 'post'; title: string}
type PostsBySearchResult = Array<Pick<Post, '_id' | 'title'>>
type PostsBySearchParams = {searchQuery: string; start: number; end: number}

// The brand `@sanity-labs/groq-content-mapper` puts on the default export of an imported `.groq`
// file, written out by hand: the SDK reads it structurally and must not depend on that package.
declare const postsBySearch: string & {
  __groqResult: PostsBySearchResult
  __groqParams: PostsBySearchParams
}
declare const firstPost: '*[_type == "post"][0]' & {
  readonly __groqResult?: Post | null
  readonly __groqParams?: Record<string, never>
}

type RegisteredResult = {registered: true}

// Registered the way generated files do: as globals, which the interfaces `@sanity/client`
// exports extend. Every file in this package's type-check program sees these registrations, not
// only this test, so their keys must stay unique across the package's tests.
declare global {
  interface SanityQueriesByResource {
    'usequery1.test': {'*[_type == "useQueryRegistered"]': RegisteredResult}
  }
}

const params = {searchQuery: 'a', start: 0, end: 9}

test('a branded query types data with no generic', () => {
  expectTypeOf(useQuery({query: postsBySearch, params}).data).toEqualTypeOf<PostsBySearchResult>()
  expectTypeOf(useQuery({query: firstPost}).data).toEqualTypeOf<Post | null>()
  expectTypeOf(
    useQuery({query: postsBySearch, params, resourceName: 'blog'}).data,
  ).toEqualTypeOf<PostsBySearchResult>()
})

test('a branded query checks its params', () => {
  // @ts-expect-error -- `start` and `end` are required
  useQuery({query: postsBySearch, params: {searchQuery: 'a'}})
  // @ts-expect-error -- `start` is a number
  useQuery({query: postsBySearch, params: {...params, start: '0'}})
  // @ts-expect-error -- `limit` is not a param of this query
  useQuery({query: postsBySearch, params: {...params, limit: 10}})
  // @ts-expect-error -- this query declares no params
  useQuery({query: firstPost, params: {slug: 'a'}})
})

test('an explicit generic overrides the brand, with open params', () => {
  expectTypeOf(
    useQuery<{custom: true}>({query: postsBySearch, params: {anything: 1}}).data,
  ).toEqualTypeOf<{custom: true}>()
})

test('plain strings, defineQuery, registered queries and explicit generics resolve as before', () => {
  expectTypeOf(useQuery({query: '*[_type == "useQueryUnregistered"]'}).data).toBeNever()
  const definedQuery = defineQuery('*[_type == "useQueryRegistered"]')
  expectTypeOf(
    useQuery({query: definedQuery, projectId: 'usequery1', dataset: 'test', params: {a: 1}}).data,
  ).toEqualTypeOf<RegisteredResult>()
  expectTypeOf(
    useQuery<Post[]>({query: '*[_type == "post"]', params: {anything: 1}}).data,
  ).toEqualTypeOf<Post[]>()
  const query: string = '*[_type == $type]'
  useQuery({query, params: {type: 'post'}})
})

test('the signature read off the last overload is unchanged', () => {
  expectTypeOf<Parameters<typeof useQuery>[0]['params']>().toEqualTypeOf<
    Record<string, unknown> | undefined
  >()
  expectTypeOf<ReturnType<typeof useQuery>>().toEqualTypeOf<{data: unknown; isPending: boolean}>()
})
