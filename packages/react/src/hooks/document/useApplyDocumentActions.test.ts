import {applyDocumentActions} from '@sanity/sdk'
import {describe, it} from 'vitest'

import {createCallbackHook} from '../helpers/createCallbackHook'

vi.mock('../helpers/createCallbackHook', () => ({
  createCallbackHook: vi.fn((cb) => () => cb),
}))
vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {...original, applyDocumentActions: vi.fn()}
})

describe('useApplyDocumentActions', () => {
  it('calls `createCallbackHook` with `applyActions`', async () => {
    expect(createCallbackHook).not.toHaveBeenCalled()
    await import('./useApplyDocumentActions')
    expect(createCallbackHook).toHaveBeenCalledWith(applyDocumentActions)
  })
})
