import {type AuthStore, createSanityInstance, getAuthStore} from '@sanity/sdk'
import {renderHook, waitFor} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {SanityProvider} from '../../components/context/SanityProvider'
import {useLoginUrls} from './useLoginUrls'
import {Suspense} from 'react'

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

    const sanityInstance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const wrapper = ({children}: {children: React.ReactNode}) => (
      <SanityProvider sanityInstance={sanityInstance}>{children}</SanityProvider>
    )

    const {result} = renderHook(() => useLoginUrls(), {wrapper})
    expect(result.current).toEqual(mockProviders)
  })

  it('should handle asynchronous provider URLs', async () => {
    const mockProviders = [{name: 'google', title: 'Google', url: 'http://test.com/auth/google'}]

    const getLoginUrls = vi
      .fn<AuthStore['getLoginUrls']>()
      .mockResolvedValueOnce(mockProviders)
      .mockReturnValueOnce(mockProviders)

    vi.mocked(getAuthStore).mockReturnValue({getLoginUrls} as unknown as AuthStore)

    const sanityInstance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const wrapper = ({children}: {children: React.ReactNode}) => (
      <Suspense fallback={<>Loading…</>}>
        <SanityProvider sanityInstance={sanityInstance}>{children}</SanityProvider>
      </Suspense>
    )

    const {result} = renderHook(() => useLoginUrls(), {wrapper})

    // Initially empty
    expect(result.current).toEqual(null)

    // Wait for providers to load
    await waitFor(() => {
      expect(result.current).toEqual(mockProviders)
    })
  })
})
