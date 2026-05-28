import {expectTypeOf, test} from 'vitest'

import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {
  getOrganizationState,
  type Organization,
  type OrganizationBase,
  type OrganizationMember,
  resolveOrganization,
} from './organization'

const instance = {} as SanityInstance

test('resolveOrganization — default call: members and features both omitted by default', () => {
  expectTypeOf(resolveOrganization(instance, {organizationId: 'org_1'})).resolves.toEqualTypeOf<
    Organization<false, false>
  >()
  type Result = Awaited<ReturnType<typeof resolveOrganization<false, false>>>
  expectTypeOf<Result['id']>().toEqualTypeOf<string>()
})

test('resolveOrganization — includeMembers: true adds members to the type', () => {
  expectTypeOf(
    resolveOrganization(instance, {organizationId: 'org_1', includeMembers: true}),
  ).resolves.toEqualTypeOf<Organization<true, false>>()
  type Result = Awaited<ReturnType<typeof resolveOrganization<true, false>>>
  expectTypeOf<Result['members']>().toEqualTypeOf<OrganizationMember[]>()
})

test('resolveOrganization — includeFeatures: true adds features to the type', () => {
  expectTypeOf(
    resolveOrganization(instance, {organizationId: 'org_1', includeFeatures: true}),
  ).resolves.toEqualTypeOf<Organization<false, true>>()
})

test('resolveOrganization — both flags true → both arrays present', () => {
  expectTypeOf(
    resolveOrganization(instance, {
      organizationId: 'org_1',
      includeMembers: true,
      includeFeatures: true,
    }),
  ).resolves.toEqualTypeOf<Organization<true, true>>()
})

test('resolveOrganization — rejects non-boolean flag values', () => {
  // @ts-expect-error — includeMembers must be a boolean
  void resolveOrganization(instance, {organizationId: 'org_1', includeMembers: 'yes'})
})

test('resolveOrganization — requires organizationId', () => {
  // @ts-expect-error — organizationId is required
  void resolveOrganization(instance, {})
})

test('resolveOrganization — non-literal boolean flag makes members optional', () => {
  const includeMembers = false as boolean
  expectTypeOf(
    resolveOrganization(instance, {organizationId: 'org_1', includeMembers}),
  ).resolves.toEqualTypeOf<Organization<boolean, false>>()
})

test('getOrganizationState — default call returns bare-base StateSource', () => {
  expectTypeOf(getOrganizationState(instance, {organizationId: 'org_1'})).toEqualTypeOf<
    StateSource<Organization<false, false> | undefined>
  >()
})

test('getOrganizationState — both flags true narrows the StateSource value type', () => {
  expectTypeOf(
    getOrganizationState(instance, {
      organizationId: 'org_1',
      includeMembers: true,
      includeFeatures: true,
    }),
  ).toEqualTypeOf<StateSource<Organization<true, true> | undefined>>()
})

test('Organization — wide boolean for IncludeMembers makes members optional', () => {
  expectTypeOf<Organization<boolean, true>>().toEqualTypeOf<
    OrganizationBase & {members?: OrganizationMember[]} & {features: string[]}
  >()
  expectTypeOf<Pick<Organization<boolean, true>, 'members'>>().toEqualTypeOf<{
    members?: OrganizationMember[]
  }>()
})

test('Organization — wide boolean for IncludeFeatures makes features optional', () => {
  expectTypeOf<Organization<true, boolean>>().toEqualTypeOf<
    OrganizationBase & {members: OrganizationMember[]} & {features?: string[]}
  >()
  expectTypeOf<Pick<Organization<true, boolean>, 'features'>>().toEqualTypeOf<{
    features?: string[]
  }>()
})

test('Organization — both wide booleans make both fields optional', () => {
  expectTypeOf<Organization<boolean, boolean>>().toEqualTypeOf<
    OrganizationBase & {members?: OrganizationMember[]} & {features?: string[]}
  >()
})
