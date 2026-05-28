import {expectTypeOf, test} from 'vitest'

import {type OrganizationMember} from '../organization/organization'
import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {getOrganizationsState, type Organizations, resolveOrganizations} from './organizations'

const instance = {} as SanityInstance

test('resolveOrganizations — default call: bare list shape', () => {
  expectTypeOf(resolveOrganizations(instance)).resolves.toEqualTypeOf<Organizations<false, false>>()
})

test('resolveOrganizations — includeMembers: true narrows the generic', () => {
  expectTypeOf(resolveOrganizations(instance, {includeMembers: true})).resolves.toEqualTypeOf<
    Organizations<true, false>
  >()
})

test('resolveOrganizations — includeFeatures: true narrows the generic', () => {
  expectTypeOf(resolveOrganizations(instance, {includeFeatures: true})).resolves.toEqualTypeOf<
    Organizations<false, true>
  >()
})

test('resolveOrganizations — both flags true', () => {
  expectTypeOf(
    resolveOrganizations(instance, {includeMembers: true, includeFeatures: true}),
  ).resolves.toEqualTypeOf<Organizations<true, true>>()
})

test('resolveOrganizations — rejects non-boolean flag values', () => {
  // @ts-expect-error — includeMembers must be a boolean
  void resolveOrganizations(instance, {includeMembers: 'yes'})
})

test('resolveOrganizations — includeImplicitMemberships does not change the data shape', () => {
  expectTypeOf(
    resolveOrganizations(instance, {includeImplicitMemberships: true}),
  ).resolves.toEqualTypeOf<Organizations<false, false>>()
})

test('Organizations — list items expose the documented subset of keys', () => {
  type Keys = keyof Organizations<false, false>[number]
  expectTypeOf<Keys>().toEqualTypeOf<
    | 'id'
    | 'name'
    | 'slug'
    | 'createdAt'
    | 'updatedAt'
    | 'defaultRoleName'
    | 'dashboardStatus'
    | 'aiFeaturesStatus'
  >()
})

test('Organizations<true, false>[number] exposes members[]', () => {
  type Item = Organizations<true, false>[number]
  expectTypeOf<Item['members']>().toEqualTypeOf<OrganizationMember[]>()
})

test('Organizations<false, true>[number] exposes features[]', () => {
  type Item = Organizations<false, true>[number]
  expectTypeOf<Item['features']>().toEqualTypeOf<string[]>()
})

test('Organizations<true, true>[number] exposes both members[] and features[]', () => {
  type Item = Organizations<true, true>[number]
  expectTypeOf<Item['members']>().toEqualTypeOf<OrganizationMember[]>()
  expectTypeOf<Item['features']>().toEqualTypeOf<string[]>()
})

test('getOrganizationsState — default call returns the bare-base StateSource', () => {
  expectTypeOf(getOrganizationsState(instance)).toEqualTypeOf<
    StateSource<Organizations<false, false> | undefined>
  >()
})
