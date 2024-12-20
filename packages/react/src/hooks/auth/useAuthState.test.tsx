import {getAuthState} from '@sanity/sdk'
import {identity} from 'rxjs'
import {describe, it} from 'vitest'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

vi.mock('../helpers/createStateSourceHook', () => ({createStateSourceHook: vi.fn(identity)}))
vi.mock('@sanity/sdk', () => ({getAuthState: vi.fn()}))

describe('useAuthState', () => {
  it('calls `createStateSourceHook` with `getAuthState`', async () => {
    const {useAuthState} = await import('./useAuthState')
    expect(createStateSourceHook).toHaveBeenCalledWith(getAuthState)
    expect(useAuthState).toBe(getAuthState)
  })
})
