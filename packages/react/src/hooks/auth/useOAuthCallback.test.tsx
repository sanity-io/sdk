import {handleOAuthCallback} from '@sanity/sdk'
import {identity} from 'rxjs'
import {describe, it} from 'vitest'

import {createCallbackHook} from '../helpers/createCallbackHook'

vi.mock('../helpers/createCallbackHook', () => ({createCallbackHook: vi.fn(identity)}))
vi.mock('@sanity/sdk', () => ({handleOAuthCallback: vi.fn()}))

describe('useOAuthCallback', () => {
  it('calls `createCallbackHook` with `handleOAuthCallback`', async () => {
    const {useOAuthCallback} = await import('./useOAuthCallback')
    expect(createCallbackHook).toHaveBeenCalledWith(handleOAuthCallback)
    expect(useOAuthCallback).toBe(handleOAuthCallback)
  })
})
