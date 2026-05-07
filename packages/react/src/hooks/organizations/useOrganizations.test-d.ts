import {type OrganizationMember, type Organizations} from '@sanity/sdk'
import {expectTypeOf, test} from 'vitest'

import {useOrganizations} from './useOrganizations'

test('useOrganizations — no args: members and features both omitted', () => {
  expectTypeOf(useOrganizations()).toEqualTypeOf<Organizations<false, false>>()
})

test('useOrganizations — includeMembers: true adds members to the type', () => {
  expectTypeOf(useOrganizations({includeMembers: true})).toEqualTypeOf<Organizations<true, false>>()
  type Result = ReturnType<typeof useOrganizations<true, false>>
  expectTypeOf<Result[number]['members']>().toEqualTypeOf<OrganizationMember[]>()
})

test('useOrganizations — includeFeatures: true adds features to the type', () => {
  expectTypeOf(useOrganizations({includeFeatures: true})).toEqualTypeOf<
    Organizations<false, true>
  >()
})

test('useOrganizations — both flags true → both arrays present', () => {
  expectTypeOf(useOrganizations({includeMembers: true, includeFeatures: true})).toEqualTypeOf<
    Organizations<true, true>
  >()
})

test('useOrganizations — both flags false → bare base shape', () => {
  expectTypeOf(useOrganizations({includeMembers: false, includeFeatures: false})).toEqualTypeOf<
    Organizations<false, false>
  >()
  type Result = ReturnType<typeof useOrganizations<false, false>>
  expectTypeOf<Result[number]['id']>().toEqualTypeOf<string>()
})

test('useOrganizations — rejects non-boolean flag values', () => {
  // @ts-expect-error — includeMembers must be a boolean
  void useOrganizations({includeMembers: 'yes'})
})

test('useOrganizations — includeImplicitMemberships does not change the data shape', () => {
  expectTypeOf(useOrganizations({includeImplicitMemberships: true})).toEqualTypeOf<
    Organizations<false, false>
  >()
})

test('useOrganizations — non-literal boolean flag makes members optional', () => {
  const includeMembers = false as boolean
  expectTypeOf(useOrganizations({includeMembers})).toEqualTypeOf<Organizations<boolean, false>>()
  type Result = ReturnType<typeof useOrganizations<boolean, false>>
  expectTypeOf<Result[number]['members']>().toEqualTypeOf<OrganizationMember[] | undefined>()
  expectTypeOf<Pick<Result[number], 'members'>>().toEqualTypeOf<{
    members?: OrganizationMember[]
  }>()
})
