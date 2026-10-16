import {expectTypeOf, test} from 'vitest'

import {type OrganizationMember} from '../organization/organization'
import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {type FetcherSnapshot} from '../store/fetcherStore'
import {type Organizations, organizations} from './organizations'

const instance = {} as SanityInstance

test('organizations.resolveState — resolves the wide-boolean list shape', () => {
  expectTypeOf(organizations.resolveState(instance)).resolves.toEqualTypeOf<
    Organizations<boolean, boolean>
  >()
})

test('organizations.getState — exposes the snapshot envelope', () => {
  expectTypeOf(organizations.getState(instance)).toEqualTypeOf<
    StateSource<FetcherSnapshot<Organizations<boolean, boolean>>>
  >()
})

test('organizations — rejects non-boolean flag values', () => {
  // @ts-expect-error includeMembers must be a boolean
  void organizations.resolveState(instance, {includeMembers: 'yes'})
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
