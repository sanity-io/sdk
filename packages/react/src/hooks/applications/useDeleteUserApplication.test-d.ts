import {type DeletedResult, type DeleteUserApplicationInput} from '@sanity/sdk'
import {expectTypeOf, test} from 'vitest'

import {type MutationHookResult} from '../helpers/createMutationHook'
import {useDeleteUserApplication} from './useDeleteUserApplication'

test('useDeleteUserApplication — returns the mutation envelope', () => {
  const result = useDeleteUserApplication()
  expectTypeOf(result).toEqualTypeOf<
    MutationHookResult<DeleteUserApplicationInput, DeletedResult>
  >()
  expectTypeOf(result.mutate).parameter(0).toEqualTypeOf<DeleteUserApplicationInput>()
  expectTypeOf(result.data).toEqualTypeOf<DeletedResult | undefined>()
})
