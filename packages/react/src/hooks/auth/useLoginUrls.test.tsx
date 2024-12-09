import {type AuthStore, getAuthStore} from '@sanity/sdk'
import {renderHook, waitFor} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {SanityProvider} from '../../components/context/SanityProvider'
import {useLoginUrls} from './useLoginUrls'

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getAuthStore: vi.fn(),
  }
})

describe('useLoginUrls', () => {
  it('should handle synchronous provider URLs', () => {
    const mockProviders = [{name: 'google', title: 'Google', url: 'http://test.com/auth/google'}]
    const mockAuthStore = {
      getLoginUrls: () => mockProviders,
    }
    vi.mocked(getAuthStore).mockReturnValue(mockAuthStore as AuthStore)

    const wrapper = ({children}: {children: React.ReactNode}) => (
      <SanityProvider config={{projectId: 'test', dataset: 'test'}}>{children}</SanityProvider>
    )

    const {result} = renderHook(() => useLoginUrls(), {wrapper})
    expect(result.current).toEqual(mockProviders)
  })

  it('should handle asynchronous provider URLs', async () => {
    const mockProviders = [{name: 'google', title: 'Google', url: 'http://test.com/auth/google'}]
    const mockAuthStore = {
      getLoginUrls: () => Promise.resolve(mockProviders),
    }
    vi.mocked(getAuthStore).mockReturnValue(mockAuthStore as AuthStore)

    const wrapper = ({children}: {children: React.ReactNode}) => (
      <SanityProvider config={{projectId: 'test', dataset: 'test'}}>{children}</SanityProvider>
    )

    const {result} = renderHook(() => useLoginUrls(), {wrapper})

    // Initially empty
    expect(result.current).toEqual([])

    // Wait for providers to load
    await waitFor(() => {
      expect(result.current).toEqual(mockProviders)
    })
  })
})
