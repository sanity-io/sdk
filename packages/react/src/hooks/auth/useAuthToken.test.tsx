import {getTokenState} from '@sanity/sdk'
import {identity} from 'rxjs'
import {describe, it} from 'vitest'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

vi.mock('../helpers/createStateSourceHook', () => ({createStateSourceHook: vi.fn(identity)}))
vi.mock('@sanity/sdk', () => ({getTokenState: vi.fn()}))

describe('useAuthToken', () => {
  it('calls `createStateSourceHook` with `getTokenState`', async () => {
    const {useAuthToken} = await import('./useAuthToken')
    expect(createStateSourceHook).toHaveBeenCalledWith(getTokenState)
    expect(useAuthToken).toBe(getTokenState)
  })
})
