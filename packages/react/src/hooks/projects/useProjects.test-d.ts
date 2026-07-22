import {type Project, type ProjectMember} from '@sanity/sdk'
import {expectTypeOf, test} from 'vitest'

import {useProjects} from './useProjects'

test('useProjects — no args: features included, members omitted', () => {
  expectTypeOf(useProjects().data).toEqualTypeOf<Project<false, true>[]>()
})

test('useProjects — returns the FetcherHookResult envelope', () => {
  const result = useProjects()
  expectTypeOf(result.isFetching).toEqualTypeOf<boolean>()
  expectTypeOf(result.error).toEqualTypeOf<unknown>()
  expectTypeOf(result.refetch).toEqualTypeOf<() => Promise<Project<false, true>[]>>()
})

test('useProjects — includeMembers: true adds members to the type', () => {
  expectTypeOf(useProjects({includeMembers: true}).data).toEqualTypeOf<Project<true, true>[]>()
  type Result = ReturnType<typeof useProjects<true, true>>
  expectTypeOf<Result['data'][number]['members']>().toEqualTypeOf<ProjectMember[]>()
})

test('useProjects — includeFeatures: false drops features from the type', () => {
  expectTypeOf(useProjects({includeFeatures: false}).data).toEqualTypeOf<Project<false, false>[]>()
})

test('useProjects — both flags true → both arrays present', () => {
  expectTypeOf(useProjects({includeMembers: true, includeFeatures: true}).data).toEqualTypeOf<
    Project<true, true>[]
  >()
})

test('useProjects — both flags false → bare base shape', () => {
  expectTypeOf(useProjects({includeMembers: false, includeFeatures: false}).data).toEqualTypeOf<
    Project<false, false>[]
  >()
  type Result = ReturnType<typeof useProjects<false, false>>
  expectTypeOf<Result['data'][number]['id']>().toEqualTypeOf<string>()
})

test('useProjects — rejects non-boolean flag values', () => {
  // @ts-expect-error — includeMembers must be a boolean
  void useProjects({includeMembers: 'yes'})
})

test('useProjects — organizationId alone does not change the data shape', () => {
  expectTypeOf(useProjects({organizationId: 'org_123'}).data).toEqualTypeOf<
    Project<false, true>[]
  >()
})

test('useProjects — non-literal boolean flag makes members optional', () => {
  const includeMembers = false as boolean
  expectTypeOf(useProjects({includeMembers}).data).toEqualTypeOf<Project<boolean, true>[]>()
  type Result = ReturnType<typeof useProjects<boolean, true>>
  expectTypeOf<Result['data'][number]['members']>().toEqualTypeOf<ProjectMember[] | undefined>()
  expectTypeOf<Pick<Result['data'][number], 'members'>>().toEqualTypeOf<{
    members?: ProjectMember[]
  }>()
})
