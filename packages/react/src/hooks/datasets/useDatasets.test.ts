import {getDatasets, getDatasetsState} from '@sanity/sdk'
import {type Mock, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useSanityInstance} from '../context/useSanityInstance'
import {useDatasets} from './useDatasets'

// Mock the necessary modules
vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn(),
}))

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getDatasets: vi.fn(),
    getDatasetsState: vi.fn(),
  }
})

describe('useDatasets', () => {
  const mockInstance = {}
  const mockDatasets = [
    {
      name: 'foo',
      aclMode: 'public',
      createdAt: '2017-11-02T14:45:09.221Z',
      createdByUserId: null,
      addonFor: null,
      datasetProfile: 'content',
      features: [],
      tags: [],
    },
    {
      name: 'another',
      aclMode: 'public',
      createdAt: '2017-11-16T11:38:06.491Z',
      createdByUserId: null,
      addonFor: null,
      datasetProfile: 'content',
      features: [],
      tags: [],
    },
  ]
  const mockSubscribe = vi.fn()

  beforeEach(() => {
    ;(useSanityInstance as Mock).mockReturnValue(mockInstance)
    ;(getDatasetsState as Mock).mockReturnValue({
      datasets: mockDatasets,
      isPending: false,
      error: null,
      initialLoadComplete: true,
      subscribe: mockSubscribe,
    })
    ;(getDatasets as Mock).mockResolvedValue(mockDatasets)
  })

  it('should return datasets from the state', () => {
    const {result} = renderHook(() => useDatasets())

    expect(result.current).toEqual(mockDatasets)
  })
})
