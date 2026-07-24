import {expectTypeOf, test} from 'vitest'

import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {type FetcherSnapshot} from '../store/fetcherStore'
import {type Organization, organization, type OrganizationMember} from './organization'

const instance = {} as SanityInstance

test('organization.resolveState — resolves the wide-boolean detail shape', () => {
  expectTypeOf(
    organization.resolveState(instance, {organizationId: 'org_1'}),
  ).resolves.toEqualTypeOf<Organization<boolean, boolean>>()
})

test('Organization — literal flags narrow members and features', () => {
  expectTypeOf<Organization<true, true>['members']>().toEqualTypeOf<OrganizationMember[]>()
  expectTypeOf<Organization<true, true>['features']>().toEqualTypeOf<string[]>()
  expectTypeOf<keyof Organization<false, false> & ('members' | 'features')>().toEqualTypeOf<never>()
})

test('organization.getState — exposes the snapshot envelope', () => {
  expectTypeOf(organization.getState(instance, {organizationId: 'org_1'})).toEqualTypeOf<
    StateSource<FetcherSnapshot<Organization<boolean, boolean>>>
  >()
})

test('organization — requires organizationId in options', () => {
  // @ts-expect-error organizationId is required
  void organization.resolveState(instance, {})
})

test('organization — rejects non-boolean flag values', () => {
  // @ts-expect-error includeMembers must be a boolean
  void organization.resolveState(instance, {organizationId: 'org_1', includeMembers: 'yes'})
})
