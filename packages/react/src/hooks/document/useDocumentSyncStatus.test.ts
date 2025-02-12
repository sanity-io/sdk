import {getDocumentSyncStatus} from '@sanity/sdk'
import {identity} from 'rxjs'
import {describe, it} from 'vitest'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

vi.mock('../helpers/createStateSourceHook', () => ({createStateSourceHook: vi.fn(identity)}))
vi.mock('@sanity/sdk', () => ({getDocumentSyncStatus: vi.fn()}))

describe('useAuthToken', () => {
  it('calls `createStateSourceHook` with `getTokenState`', async () => {
    const {useDocumentSyncStatus} = await import('./useDocumentSyncStatus')
    expect(createStateSourceHook).toHaveBeenCalledWith(getDocumentSyncStatus)
    expect(useDocumentSyncStatus).toBe(getDocumentSyncStatus)
  })
})
