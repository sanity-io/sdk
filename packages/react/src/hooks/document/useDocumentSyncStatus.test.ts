import {getDocumentSyncStatus} from '@sanity/sdk'
import {describe, it} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {createStateSourceHook} from '../helpers/createStateSourceHook'

const mockHook = vi.fn()
vi.mock('../helpers/createStateSourceHook', () => ({createStateSourceHook: vi.fn(() => mockHook)}))
vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...original,
    getDocumentSyncStatus: vi.fn(),
  }
})

vi.mock('../context/useSanityInstance')

describe('useDocumentSyncStatus', () => {
  it('calls `createStateSourceHook` with `getDocumentSyncStatus`', async () => {
    const {useDocumentSyncStatus} = await import('./useDocumentSyncStatus')
    renderHook(() => useDocumentSyncStatus({documentId: '1', documentType: 'test'}))
    expect(createStateSourceHook).toHaveBeenCalledWith(
      expect.objectContaining({
        getState: getDocumentSyncStatus,
        shouldSuspend: expect.any(Function),
        suspender: expect.any(Function),
        getConfig: expect.any(Function),
      }),
    )
    // Verify that the hook was created and can be called
    expect(mockHook).toHaveBeenCalled()
  })
})
