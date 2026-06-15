import {createDocument} from '@sanity/sdk'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useApplyDocumentActions} from './useApplyDocumentActions'
import {useCreateDocument} from './useCreateDocument'

vi.mock('./useApplyDocumentActions', () => ({
  useApplyDocumentActions: vi.fn(),
}))

const typeHandle = {
  documentType: 'book',
  projectId: 'test',
  dataset: 'test',
} as const

describe('useCreateDocument hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('applies a createDocument action with a generated id and initial values', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-0000-0000-000000000000')
    const apply = vi.fn().mockResolvedValue({transactionId: 'tx1'})
    vi.mocked(useApplyDocumentActions).mockReturnValue(apply)

    const {result} = renderHook(() => useCreateDocument(typeHandle))
    const handle = await result.current({title: 'New Book'})

    expect(apply).toHaveBeenCalledWith(
      createDocument(
        {...typeHandle, documentId: '00000000-0000-0000-0000-000000000000'},
        {
          title: 'New Book',
        },
      ),
    )
    expect(handle).toEqual({...typeHandle, documentId: '00000000-0000-0000-0000-000000000000'})
  })

  it('returns a handle carrying the generated id', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-1111-1111-111111111111')
    const apply = vi.fn().mockResolvedValue({transactionId: 'tx2'})
    vi.mocked(useApplyDocumentActions).mockReturnValue(apply)

    const {result} = renderHook(() => useCreateDocument(typeHandle))
    const handle = await result.current()

    expect(handle.documentId).toBe('11111111-1111-1111-1111-111111111111')
    expect(handle.documentType).toBe('book')
  })

  it('uses the documentId supplied on the handle instead of generating one', async () => {
    const apply = vi.fn().mockResolvedValue({transactionId: 'tx3'})
    vi.mocked(useApplyDocumentActions).mockReturnValue(apply)

    const {result} = renderHook(() => useCreateDocument({...typeHandle, documentId: 'fixed-id'}))
    const handle = await result.current()

    expect(handle.documentId).toBe('fixed-id')
    expect(apply).toHaveBeenCalledWith(
      createDocument({...typeHandle, documentId: 'fixed-id'}, undefined),
    )
  })

  it('uses a per-call documentId override over the handle id', async () => {
    const apply = vi.fn().mockResolvedValue({transactionId: 'tx4'})
    vi.mocked(useApplyDocumentActions).mockReturnValue(apply)

    const {result} = renderHook(() => useCreateDocument({...typeHandle, documentId: 'handle-id'}))
    const handle = await result.current({title: 'Override'}, {documentId: 'override-id'})

    expect(handle.documentId).toBe('override-id')
    expect(apply).toHaveBeenCalledWith(
      createDocument({...typeHandle, documentId: 'override-id'}, {title: 'Override'}),
    )
  })
})
