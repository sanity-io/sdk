import {applyActions} from '@sanity/sdk'
import {describe, it} from 'vitest'

import {createCallbackHook} from '../helpers/createCallbackHook'

vi.mock('../helpers/createCallbackHook', () => ({
  createCallbackHook: vi.fn((cb) => () => cb),
}))
vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {...original, applyActions: vi.fn()}
})

describe('useApplyActions', () => {
  it('calls `createCallbackHook` with `applyActions`', async () => {
    expect(createCallbackHook).not.toHaveBeenCalled()
    await import('./useApplyActions')
    expect(createCallbackHook).toHaveBeenCalledWith(applyActions)
  })
})
