import {type OrganizationMember, type Organizations} from '@sanity/sdk'
import {expectTypeOf, test} from 'vitest'

import {useOrganizations} from './useOrganizations'

test('useOrganizations — no args: members and features both omitted', () => {
  expectTypeOf(useOrganizations().data).toEqualTypeOf<Organizations<false, false>>()
})

test('useOrganizations — returns the FetcherHookResult envelope', () => {
  const result = useOrganizations()
  expectTypeOf(result.isFetching).toEqualTypeOf<boolean>()
  expectTypeOf(result.error).toEqualTypeOf<unknown>()
  expectTypeOf(result.refetch).toEqualTypeOf<() => Promise<Organizations<false, false>>>()
})

test('useOrganizations — includeMembers: true adds members to the type', () => {
  expectTypeOf(useOrganizations({includeMembers: true}).data).toEqualTypeOf<
    Organizations<true, false>
  >()
  type Result = ReturnType<typeof useOrganizations<true, false>>
  expectTypeOf<Result['data'][number]['members']>().toEqualTypeOf<OrganizationMember[]>()
})

test('useOrganizations — includeFeatures: true adds features to the type', () => {
  expectTypeOf(useOrganizations({includeFeatures: true}).data).toEqualTypeOf<
    Organizations<false, true>
  >()
})

test('useOrganizations — both flags true → both arrays present', () => {
  expectTypeOf(useOrganizations({includeMembers: true, includeFeatures: true}).data).toEqualTypeOf<
    Organizations<true, true>
  >()
})

test('useOrganizations — both flags false → bare base shape', () => {
  expectTypeOf(
    useOrganizations({includeMembers: false, includeFeatures: false}).data,
  ).toEqualTypeOf<Organizations<false, false>>()
  type Result = ReturnType<typeof useOrganizations<false, false>>
  expectTypeOf<Result['data'][number]['id']>().toEqualTypeOf<string>()
})

test('useOrganizations — rejects non-boolean flag values', () => {
  // @ts-expect-error — includeMembers must be a boolean
  void useOrganizations({includeMembers: 'yes'})
})

test('useOrganizations — includeImplicitMemberships does not change the data shape', () => {
  expectTypeOf(useOrganizations({includeImplicitMemberships: true}).data).toEqualTypeOf<
    Organizations<false, false>
  >()
})

test('useOrganizations — non-literal boolean flag makes members optional', () => {
  const includeMembers = false as boolean
  expectTypeOf(useOrganizations({includeMembers}).data).toEqualTypeOf<
    Organizations<boolean, false>
  >()
  type Result = ReturnType<typeof useOrganizations<boolean, false>>
  expectTypeOf<Result['data'][number]['members']>().toEqualTypeOf<
    OrganizationMember[] | undefined
  >()
  expectTypeOf<Pick<Result['data'][number], 'members'>>().toEqualTypeOf<{
    members?: OrganizationMember[]
  }>()
})
