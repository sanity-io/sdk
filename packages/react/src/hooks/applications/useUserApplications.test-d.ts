import {type UserApplication} from '@sanity/sdk'
import {expectTypeOf, test} from 'vitest'

import {type FetcherHookResult} from '../helpers/createFetcherHook'
import {useUserApplications} from './useUserApplications'

test('useUserApplications — returns the user applications in the result envelope', () => {
  const result = useUserApplications({organizationId: 'org_1'})
  expectTypeOf(result).toEqualTypeOf<FetcherHookResult<UserApplication[]>>()
  expectTypeOf(result.data).toEqualTypeOf<UserApplication[]>()
})
