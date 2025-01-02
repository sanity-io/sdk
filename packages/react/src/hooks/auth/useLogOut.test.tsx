import {logout} from '@sanity/sdk'
import {identity} from 'rxjs'
import {describe, it} from 'vitest'

import {createCallbackHook} from '../helpers/createCallbackHook'

vi.mock('../helpers/createCallbackHook', () => ({createCallbackHook: vi.fn(identity)}))
vi.mock('@sanity/sdk', () => ({logout: vi.fn()}))

describe('useHandleCallback', () => {
  it('calls `createCallbackHook` with `handleCallback`', async () => {
    const {useLogOut} = await import('./useLogOut')
    expect(createCallbackHook).toHaveBeenCalledWith(logout)
    expect(useLogOut).toBe(logout)
  })
})
