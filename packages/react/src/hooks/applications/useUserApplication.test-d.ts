import {type UserApplication} from '@sanity/sdk'
import {expectTypeOf, test} from 'vitest'

import {type FetcherHookResult} from '../helpers/createFetcherHook'
import {useUserApplication} from './useUserApplication'

test('useUserApplication — returns a single user application in the result envelope', () => {
  const result = useUserApplication('user_app_1')
  expectTypeOf(result).toEqualTypeOf<FetcherHookResult<UserApplication>>()
  expectTypeOf(result.data).toEqualTypeOf<UserApplication>()
})
