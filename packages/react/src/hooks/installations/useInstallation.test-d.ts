import {type Installation, type InstallationActiveConfig} from '@sanity/sdk'
import {expectTypeOf, test} from 'vitest'

import {type FetcherHookResult} from '../helpers/createFetcherHook'
import {useInstallation} from './useInstallation'

test('useInstallation — no include: the base installation', () => {
  const result = useInstallation('inst_1')
  expectTypeOf(result).toEqualTypeOf<FetcherHookResult<Installation<never>>>()
  expectTypeOf<
    Extract<keyof typeof result.data, 'activeConfig' | 'access' | 'interfaces'>
  >().toEqualTypeOf<never>()
})

test('useInstallation — activeConfig include adds the config field', () => {
  const result = useInstallation('inst_1', {include: ['activeConfig']})
  expectTypeOf(result.data).toEqualTypeOf<Installation<'activeConfig'>>()
  expectTypeOf(result.data.activeConfig).toEqualTypeOf<InstallationActiveConfig | null>()
})
