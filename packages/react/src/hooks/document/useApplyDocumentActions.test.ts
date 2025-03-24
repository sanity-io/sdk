import {applyDocumentActions, createDocument, type ResourceId} from '@sanity/sdk'
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
  it('calls `createCallbackHook` with `applyDocumentActions`', async () => {
    const {useApplyDocumentActions} = await import('./useApplyDocumentActions')
    const resourceId: ResourceId = 'project1.dataset1'
    expect(createCallbackHook).not.toHaveBeenCalled()

    expect(applyDocumentActions).not.toHaveBeenCalled()
    const apply = useApplyDocumentActions(resourceId)
    apply(createDocument({_type: 'author'}))
    expect(applyDocumentActions).toHaveBeenCalledWith(createDocument({_type: 'author'}))
  })
})
