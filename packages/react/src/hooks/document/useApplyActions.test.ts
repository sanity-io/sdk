import {applyActions, createDocument} from '@sanity/sdk'
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
    const {useApplyActions} = await import('./useApplyActions')
    expect(createCallbackHook).toHaveBeenCalledWith(applyActions)

    expect(applyActions).not.toHaveBeenCalled()
    const apply = useApplyActions()
    apply(createDocument({_type: 'author'}))
    expect(applyActions).toHaveBeenCalled()
  })
})
