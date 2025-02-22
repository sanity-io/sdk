import {getProjects, getProjectState} from '@sanity/sdk'
import {type Mock, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useSanityInstance} from '../context/useSanityInstance'
import {useProjects} from './useProjects'

// Mock the necessary modules
vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn(),
}))

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getProjects: vi.fn(),
    getProjectState: vi.fn(),
  }
})

describe('useProjects', () => {
  const mockInstance = {}
  const mockProjects = [
    {id: '1', displayName: 'Project 1'},
    {id: '2', displayName: 'Project 2'},
  ]
  const mockSubscribe = vi.fn()

  beforeEach(() => {
    ;(useSanityInstance as Mock).mockReturnValue(mockInstance)
    ;(getProjectState as Mock).mockReturnValue({
      projects: mockProjects,
      subscribe: mockSubscribe,
      projectStatus: {__all__: true},
    })
    ;(getProjects as Mock).mockResolvedValue(mockProjects)
  })

  it('should return projects from the state', () => {
    const {result} = renderHook(() => useProjects())

    expect(result.current).toEqual(mockProjects)
  })

  it('should refetch projects if already loaded', async () => {
    renderHook(() => useProjects())

    expect(getProjects).toHaveBeenCalledWith(mockInstance, true)
  })
})
