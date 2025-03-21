import {handleAuthCallback} from '@sanity/sdk'
import {identity} from 'rxjs'
import {describe, it} from 'vitest'

import {createCallbackHook} from '../helpers/createCallbackHook'

vi.mock('../helpers/createCallbackHook', () => ({createCallbackHook: vi.fn(identity)}))
vi.mock('@sanity/sdk', () => ({handleAuthCallback: vi.fn()}))

describe('useHandleAuthCallback', () => {
  it('calls `createCallbackHook` with `handleAuthCallback`', async () => {
    const {useHandleAuthCallback} = await import('./useHandleAuthCallback')
    expect(createCallbackHook).toHaveBeenCalledWith(handleAuthCallback)
    expect(useHandleAuthCallback).toBe(handleAuthCallback)
  })
})
