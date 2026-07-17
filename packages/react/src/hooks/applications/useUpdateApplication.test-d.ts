import {type Application, type UpdateApplicationInput} from '@sanity/sdk'
import {expectTypeOf, test} from 'vitest'

import {type MutationHookResult} from '../helpers/createMutationHook'
import {useUpdateApplication} from './useUpdateApplication'

test('useUpdateApplication — returns the mutation envelope', () => {
  const result = useUpdateApplication()
  expectTypeOf(result).toEqualTypeOf<MutationHookResult<UpdateApplicationInput, Application>>()
  expectTypeOf(result.mutate).parameter(0).toEqualTypeOf<UpdateApplicationInput>()
  expectTypeOf(result.data).toEqualTypeOf<Application | undefined>()
})
