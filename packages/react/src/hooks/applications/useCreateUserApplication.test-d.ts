import {type CreateUserApplicationInput, type UserApplication} from '@sanity/sdk'
import {expectTypeOf, test} from 'vitest'

import {type MutationHookResult} from '../helpers/createMutationHook'
import {useCreateUserApplication} from './useCreateUserApplication'

test('useCreateUserApplication — returns the mutation envelope', () => {
  const result = useCreateUserApplication()
  expectTypeOf(result).toEqualTypeOf<
    MutationHookResult<CreateUserApplicationInput, UserApplication>
  >()
  expectTypeOf(result.mutate).parameter(0).toEqualTypeOf<CreateUserApplicationInput>()
  expectTypeOf(result.data).toEqualTypeOf<UserApplication | undefined>()
})
