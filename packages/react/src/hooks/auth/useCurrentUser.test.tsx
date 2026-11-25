import {getCurrentUserState} from '@sanity/sdk'
import {identity} from 'rxjs'
import {describe, it} from 'vitest'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

vi.mock('../helpers/createStateSourceHook', () => ({createStateSourceHook: vi.fn(identity)}))
vi.mock('@sanity/sdk', () => ({getCurrentUserState: vi.fn()}))

describe('useCurrentUser', () => {
  it('calls `createStateSourceHook` with `getTokenState`', async () => {
    const {useCurrentUser} = await import('./useCurrentUser')
    expect(createStateSourceHook).toHaveBeenCalledWith(getCurrentUserState)
    expect(useCurrentUser).toBe(getCurrentUserState)
  })
})
