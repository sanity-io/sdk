import {expectTypeOf, test} from 'vitest'

import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {type FetcherSnapshot} from '../store/fetcherStore'
import {
  type Installation,
  installation,
  type InstallationAccess,
  type InstallationActiveConfig,
  type InstallationBase,
  type InstallationInclude,
  type InstallationInterface,
  installations,
  type InstallationsResponse,
} from './installations'

const instance = {} as SanityInstance

type IncludeKeys = 'activeConfig' | 'access' | 'interfaces'

// Whether key `K` of `T` is optional, without an `{}`-based check.
type KeyModifier<T, K extends keyof T> =
  Pick<T, K> extends Required<Pick<T, K>> ? 'required' : 'optional'

test('Installation — no includes: only the base shape', () => {
  expectTypeOf<Installation>().toEqualTypeOf<InstallationBase>()
  expectTypeOf<Installation<never>>().toEqualTypeOf<InstallationBase>()
  expectTypeOf<Extract<keyof Installation, IncludeKeys>>().toEqualTypeOf<never>()
})

test('Installation — each token adds its top-level field, required, others absent', () => {
  expectTypeOf<Installation<'access'>['access']>().toEqualTypeOf<InstallationAccess[]>()
  expectTypeOf<
    Extract<keyof Installation<'access'>, 'activeConfig' | 'interfaces'>
  >().toEqualTypeOf<never>()

  expectTypeOf<Installation<'interfaces'>['interfaces']>().toEqualTypeOf<InstallationInterface[]>()
  expectTypeOf<
    Installation<'activeConfig'>['activeConfig']
  >().toEqualTypeOf<InstallationActiveConfig | null>()
})

test('Installation — multiple tokens add each field', () => {
  type Both = Installation<'access' | 'interfaces'>
  expectTypeOf<Both['access']>().toEqualTypeOf<InstallationAccess[]>()
  expectTypeOf<Both['interfaces']>().toEqualTypeOf<InstallationInterface[]>()
  expectTypeOf<Extract<keyof Both, 'activeConfig'>>().toEqualTypeOf<never>()
})

test('Installation — a wide include array makes the fields optional', () => {
  type Wide = Installation<InstallationInclude>
  expectTypeOf<KeyModifier<Wide, 'access'>>().toEqualTypeOf<'optional'>()
  expectTypeOf<KeyModifier<Wide, 'interfaces'>>().toEqualTypeOf<'optional'>()
  expectTypeOf<KeyModifier<Wide, 'activeConfig'>>().toEqualTypeOf<'optional'>()
})

test('installations.resolveState — resolves the wide list envelope', () => {
  expectTypeOf(
    installations.resolveState(instance, {organizationId: 'org_1'}),
  ).resolves.toEqualTypeOf<InstallationsResponse<InstallationInclude>>()
})

test('installation.getState — exposes the snapshot envelope', () => {
  expectTypeOf(installation.getState(instance, 'inst_1')).toEqualTypeOf<
    StateSource<FetcherSnapshot<Installation<InstallationInclude>>>
  >()
})
