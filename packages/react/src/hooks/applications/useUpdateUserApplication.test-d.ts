import {type UpdateUserApplicationInput, type UserApplication} from '@sanity/sdk'
import {expectTypeOf, test} from 'vitest'

import {type MutationHookResult} from '../helpers/createMutationHook'
import {useUpdateUserApplication} from './useUpdateUserApplication'

test('useUpdateUserApplication — returns the mutation envelope', () => {
  const result = useUpdateUserApplication()
  expectTypeOf(result).toEqualTypeOf<
    MutationHookResult<UpdateUserApplicationInput, UserApplication>
  >()
  expectTypeOf(result.mutate).parameter(0).toEqualTypeOf<UpdateUserApplicationInput>()
  expectTypeOf(result.data).toEqualTypeOf<UserApplication | undefined>()
})
