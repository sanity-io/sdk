import {type DeleteApplicationInput, type DeletedResult} from '@sanity/sdk'
import {expectTypeOf, test} from 'vitest'

import {type MutationHookResult} from '../helpers/createMutationHook'
import {useDeleteApplication} from './useDeleteApplication'

test('useDeleteApplication — returns the mutation envelope', () => {
  const result = useDeleteApplication()
  expectTypeOf(result).toEqualTypeOf<MutationHookResult<DeleteApplicationInput, DeletedResult>>()
  expectTypeOf(result.mutate).parameter(0).toEqualTypeOf<DeleteApplicationInput>()
  expectTypeOf(result.data).toEqualTypeOf<DeletedResult | undefined>()
})
