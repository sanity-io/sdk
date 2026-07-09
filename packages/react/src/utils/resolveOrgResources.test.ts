import {type SanityClient} from '@sanity/client'
import {getClientState, type SanityInstance, type StateSource} from '@sanity/sdk'
import {firstValueFrom} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {resolveOrgResources} from './resolveOrgResources'

vi.mock('@sanity/sdk', () => ({
  getClientState: vi.fn(),
}))

vi.mock('rxjs', () => ({
  firstValueFrom: vi.fn(),
}))

const mockGetClientState = vi.mocked(getClientState)
const mockFirstValueFrom = vi.mocked(firstValueFrom)

const mockRequest = vi.fn()
const mockClient = {request: mockRequest}
const mockInstance = {} as SanityInstance

beforeEach(() => {
  vi.clearAllMocks()
  mockGetClientState.mockReturnValue({
    observable: 'mock-observable',
  } as unknown as StateSource<SanityClient>)
  mockFirstValueFrom.mockResolvedValue(mockClient as unknown as SanityClient)
})

describe('resolveOrgResources', () => {
  it('returns both mediaLibrary and canvas when both requests succeed', async () => {
    mockRequest
      .mockResolvedValueOnce({data: [{id: 'ml-123'}]})
      .mockResolvedValueOnce({data: [{id: 'canvas-456'}]})

    const result = await resolveOrgResources(mockInstance, 'org-id')

    expect(result).toEqual({
      mediaLibrary: {mediaLibraryId: 'ml-123'},
      canvas: {canvasId: 'canvas-456'},
    })
  })

  it('returns only mediaLibrary when canvas request fails', async () => {
    mockRequest
      .mockResolvedValueOnce({data: [{id: 'ml-123'}]})
      .mockRejectedValueOnce(new Error('canvas not found'))

    const result = await resolveOrgResources(mockInstance, 'org-id')

    expect(result).toEqual({
      mediaLibrary: {mediaLibraryId: 'ml-123'},
      canvas: undefined,
    })
  })

  it('returns only canvas when mediaLibrary request fails', async () => {
    mockRequest
      .mockRejectedValueOnce(new Error('media library not found'))
      .mockResolvedValueOnce({data: [{id: 'canvas-456'}]})

    const result = await resolveOrgResources(mockInstance, 'org-id')

    expect(result).toEqual({
      mediaLibrary: undefined,
      canvas: {canvasId: 'canvas-456'},
    })
  })

  it('returns undefined for both when both requests fail', async () => {
    mockRequest
      .mockRejectedValueOnce(new Error('error 1'))
      .mockRejectedValueOnce(new Error('error 2'))

    const result = await resolveOrgResources(mockInstance, 'org-id')

    expect(result).toEqual({
      mediaLibrary: undefined,
      canvas: undefined,
    })
  })

  it('returns undefined for both when data arrays are empty', async () => {
    mockRequest.mockResolvedValueOnce({data: []}).mockResolvedValueOnce({data: []})

    const result = await resolveOrgResources(mockInstance, 'org-id')

    expect(result).toEqual({
      mediaLibrary: undefined,
      canvas: undefined,
    })
  })
})
