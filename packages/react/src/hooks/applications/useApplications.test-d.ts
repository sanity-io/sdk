import {type Application, type ApplicationInterface, type ApplicationsResponse} from '@sanity/sdk'
import {expectTypeOf, test} from 'vitest'

import {type FetcherHookResult} from '../helpers/createFetcherHook'
import {useApplications} from './useApplications'

test('useApplications — no include: base items, no deployment or config', () => {
  const result = useApplications({organizationId: 'org_1'})
  expectTypeOf(result).toEqualTypeOf<FetcherHookResult<ApplicationsResponse<never>>>()
  type Item = (typeof result.data.data)[number]
  expectTypeOf<Extract<keyof Item, 'activeDeployment' | 'config'>>().toEqualTypeOf<never>()
})

test('useApplications — include shapes each item', () => {
  const result = useApplications({organizationId: 'org_1', include: ['interfaces']})
  expectTypeOf(result.data).toEqualTypeOf<ApplicationsResponse<'interfaces'>>()
  type Item = (typeof result.data.data)[number]
  expectTypeOf<NonNullable<Item['activeDeployment']>['interfaces']>().toEqualTypeOf<
    ApplicationInterface[]
  >()
})

test('useApplications — result data is the current include-narrowed application', () => {
  const result = useApplications({organizationId: 'org_1', include: ['config.studio']})
  expectTypeOf(result.data.data).toEqualTypeOf<Application<'config.studio'>[]>()
})

test('useApplications — requires an organizationId', () => {
  // @ts-expect-error — organizationId is required
  void useApplications({})
})
