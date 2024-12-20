import {handleCallback} from '@sanity/sdk'
import {identity} from 'rxjs'
import {describe, it} from 'vitest'

import {createCallbackHook} from '../helpers/createCallbackHook'

vi.mock('../helpers/createCallbackHook', () => ({createCallbackHook: vi.fn(identity)}))
vi.mock('@sanity/sdk', () => ({handleCallback: vi.fn()}))

describe('useHandleCallback', () => {
  it('calls `createCallbackHook` with `handleCallback`', async () => {
    const {useHandleCallback} = await import('./useHandleCallback')
    expect(createCallbackHook).toHaveBeenCalledWith(handleCallback)
    expect(useHandleCallback).toBe(handleCallback)
  })
})
