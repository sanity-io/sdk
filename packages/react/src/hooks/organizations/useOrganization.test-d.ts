import {type Organization, type OrganizationMember} from '@sanity/sdk'
import {expectTypeOf, test} from 'vitest'

import {useOrganization} from './useOrganization'

test('useOrganization — no flags: members and features both omitted', () => {
  expectTypeOf(useOrganization({organizationId: 'org_1'}).data).toEqualTypeOf<
    Organization<false, false>
  >()
})

test('useOrganization — returns the FetcherHookResult envelope', () => {
  const result = useOrganization({organizationId: 'org_1'})
  expectTypeOf(result.isFetching).toEqualTypeOf<boolean>()
  expectTypeOf(result.error).toEqualTypeOf<unknown>()
  expectTypeOf(result.refetch).toEqualTypeOf<() => Promise<Organization<false, false>>>()
})

test('useOrganization — includeMembers: true adds members to the type', () => {
  expectTypeOf(useOrganization({organizationId: 'org_1', includeMembers: true}).data).toEqualTypeOf<
    Organization<true, false>
  >()
  type Result = ReturnType<typeof useOrganization<true, false>>
  expectTypeOf<Result['data']['members']>().toEqualTypeOf<OrganizationMember[]>()
})

test('useOrganization — includeFeatures: true adds features to the type', () => {
  expectTypeOf(
    useOrganization({organizationId: 'org_1', includeFeatures: true}).data,
  ).toEqualTypeOf<Organization<false, true>>()
})

test('useOrganization — both flags true → both arrays present', () => {
  expectTypeOf(
    useOrganization({organizationId: 'org_1', includeMembers: true, includeFeatures: true}).data,
  ).toEqualTypeOf<Organization<true, true>>()
})

test('useOrganization — both flags false → bare base shape', () => {
  expectTypeOf(
    useOrganization({organizationId: 'org_1', includeMembers: false, includeFeatures: false}).data,
  ).toEqualTypeOf<Organization<false, false>>()
  type Result = ReturnType<typeof useOrganization<false, false>>
  expectTypeOf<Result['data']['id']>().toEqualTypeOf<string>()
})

test('useOrganization — rejects non-boolean flag values', () => {
  // @ts-expect-error — includeMembers must be a boolean
  void useOrganization({organizationId: 'org_1', includeMembers: 'yes'})
})

test('useOrganization — non-literal boolean flag makes members optional', () => {
  const includeMembers = false as boolean
  expectTypeOf(useOrganization({organizationId: 'org_1', includeMembers}).data).toEqualTypeOf<
    Organization<boolean, false>
  >()
  type Result = ReturnType<typeof useOrganization<boolean, false>>
  expectTypeOf<Result['data']['members']>().toEqualTypeOf<OrganizationMember[] | undefined>()
  expectTypeOf<Pick<Result['data'], 'members'>>().toEqualTypeOf<{members?: OrganizationMember[]}>()
})
