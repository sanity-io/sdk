import {expectTypeOf, test} from 'vitest'

import {type FetcherHookResult} from '../helpers/createFetcherHook'
import {useCheckPermissions} from './useCheckPermissions'

test('useCheckPermissions — the result is keyed by exactly the permissions passed', () => {
  const result = useCheckPermissions('project', 'proj_1', ['read', 'write'])
  expectTypeOf(result).toEqualTypeOf<FetcherHookResult<Record<'read' | 'write', boolean>>>()
  expectTypeOf(result.data).toEqualTypeOf<Record<'read' | 'write', boolean>>()
})

test('useCheckPermissions — rejects an unknown resource type', () => {
  // @ts-expect-error — resourceType must be an AccessResourceType
  void useCheckPermissions('not-a-resource', 'id', ['read'])
})
