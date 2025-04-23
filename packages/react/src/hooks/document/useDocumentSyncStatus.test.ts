import {getDocumentSyncStatus} from '@sanity/sdk'
import {describe, it} from 'vitest'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

const mockHook = vi.fn()
vi.mock('../helpers/createStateSourceHook', () => ({createStateSourceHook: vi.fn(() => mockHook)}))
vi.mock('@sanity/sdk', () => ({getDocumentSyncStatus: vi.fn()}))

describe('useDocumentSyncStatus', () => {
  it('calls `createStateSourceHook` with `getDocumentSyncStatus`', async () => {
    const {useDocumentSyncStatus} = await import('./useDocumentSyncStatus')
    expect(createStateSourceHook).toHaveBeenCalledWith(
      expect.objectContaining({
        getState: getDocumentSyncStatus,
        shouldSuspend: expect.any(Function),
        suspender: expect.any(Function),
        getConfig: expect.any(Function),
      }),
    )
    expect(useDocumentSyncStatus).toBe(mockHook)
  })
})
