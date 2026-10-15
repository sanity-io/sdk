import {
  type Application,
  type ApplicationDeployment,
  type ApplicationStudioConfig,
} from '@sanity/sdk'
import {expectTypeOf, test} from 'vitest'

import {type FetcherHookResult} from '../helpers/createFetcherHook'
import {useApplication} from './useApplication'

test('useApplication — no include: the base application', () => {
  const result = useApplication('app_1')
  expectTypeOf(result).toEqualTypeOf<FetcherHookResult<Application<never>>>()
  expectTypeOf<
    Extract<keyof typeof result.data, 'activeDeployment' | 'config'>
  >().toEqualTypeOf<never>()
})

test('useApplication — config.studio include adds config.studio', () => {
  const result = useApplication('app_1', {include: ['config.studio']})
  expectTypeOf(result.data).toEqualTypeOf<Application<'config.studio'>>()
  expectTypeOf(result.data.config.studio).toEqualTypeOf<ApplicationStudioConfig | undefined>()
})

test('useApplication — a slug with organizationId still shapes data by include', () => {
  const result = useApplication('my-studio', {
    include: ['config.studio'],
    organizationId: 'org_1',
  })
  expectTypeOf(result.data).toEqualTypeOf<Application<'config.studio'>>()
})

test('useApplication — a deployment-child include forces the deployment in', () => {
  const result = useApplication('app_1', {include: ['activeDeployment']})
  expectTypeOf(
    result.data.activeDeployment,
  ).toEqualTypeOf<ApplicationDeployment<'activeDeployment'> | null>()
})
