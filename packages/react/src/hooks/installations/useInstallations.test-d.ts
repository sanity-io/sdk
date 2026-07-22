import {type Installation, type InstallationAccess, type InstallationsResponse} from '@sanity/sdk'
import {expectTypeOf, test} from 'vitest'

import {type FetcherHookResult} from '../helpers/createFetcherHook'
import {useInstallations} from './useInstallations'

test('useInstallations — no include: base items, no gated fields', () => {
  const result = useInstallations({organizationId: 'org_1'})
  expectTypeOf(result).toEqualTypeOf<FetcherHookResult<InstallationsResponse<never>>>()
  type Item = (typeof result.data.data)[number]
  expectTypeOf<
    Extract<keyof Item, 'activeConfig' | 'access' | 'interfaces'>
  >().toEqualTypeOf<never>()
})

test('useInstallations — include shapes each item', () => {
  const result = useInstallations({organizationId: 'org_1', include: ['access']})
  expectTypeOf(result.data.data).toEqualTypeOf<Installation<'access'>[]>()
  type Item = (typeof result.data.data)[number]
  expectTypeOf<Item['access']>().toEqualTypeOf<InstallationAccess[]>()
})

test('useInstallations — requires an organizationId', () => {
  // @ts-expect-error — organizationId is required
  void useInstallations({})
})
