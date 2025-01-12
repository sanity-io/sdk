import {mutate} from '@sanity/sdk'
import {identity} from 'rxjs'
import {describe, it} from 'vitest'

import {createCallbackHook} from '../helpers/createCallbackHook'

vi.mock('../helpers/createCallbackHook', () => ({createCallbackHook: vi.fn(identity)}))
vi.mock('@sanity/sdk', () => ({mutate: vi.fn()}))

describe('useMutate', () => {
  it('calls `createCallbackHook` with `handleCallback`', async () => {
    const {useMutate} = await import('./useMutate')
    expect(createCallbackHook).toHaveBeenCalledWith(mutate)
    expect(useMutate).toBe(mutate)
  })
})
