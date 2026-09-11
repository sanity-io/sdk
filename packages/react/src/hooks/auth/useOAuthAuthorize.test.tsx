import {startOAuthAuthorization} from '@sanity/sdk'
import {identity} from 'rxjs'
import {describe, it} from 'vitest'

import {createCallbackHook} from '../helpers/createCallbackHook'

vi.mock('../helpers/createCallbackHook', () => ({createCallbackHook: vi.fn(identity)}))
vi.mock('@sanity/sdk', () => ({startOAuthAuthorization: vi.fn()}))

describe('useOAuthAuthorize', () => {
  it('calls `createCallbackHook` with `startOAuthAuthorization`', async () => {
    const {useOAuthAuthorize} = await import('./useOAuthAuthorize')
    expect(createCallbackHook).toHaveBeenCalledWith(startOAuthAuthorization)
    expect(useOAuthAuthorize).toBe(startOAuthAuthorization)
  })
})
