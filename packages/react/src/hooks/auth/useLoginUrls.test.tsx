import {createSanityInstance, fetchLoginUrls, getLoginUrlsState} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {act, Suspense} from 'react'
import {throwError} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {useLoginUrls} from './useLoginUrls'

vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn().mockReturnValue(createSanityInstance({projectId: 'p', dataset: 'd'})),
}))

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  return {...actual, getLoginUrlsState: vi.fn(), fetchLoginUrls: vi.fn()}
})

describe('useLoginUrls', () => {
  it('should suspend by throwing `fetchLoginUrls` if `getLoginUrlsState().getCurrent()` is falsy', async () => {
    const subscribe = vi.fn()
    const getCurrent = vi.fn().mockReturnValue(undefined)

    let resolve: () => void
    const promise = new Promise<void>((thisResolve) => {
      resolve = thisResolve
    })
    vi.mocked(fetchLoginUrls).mockReturnValue(
      promise as unknown as ReturnType<typeof fetchLoginUrls>,
    )

    vi.mocked(getLoginUrlsState).mockReturnValue({
      getCurrent,
      subscribe,
      observable: throwError(() => new Error('Unexpected usage of observable')),
    })

    const wrapper = ({children}: {children: React.ReactNode}) => (
      <Suspense fallback={<>Loading…</>}>{children}</Suspense>
    )

    const {result, rerender} = renderHook(() => useLoginUrls(), {wrapper})
    expect(result.current).toEqual(null)

    const mockProviders = [{name: 'google', title: 'Google', url: 'http://test.com/auth/google'}]

    await act(async () => {
      getCurrent.mockReturnValue(mockProviders)
      resolve()
      rerender()
      await promise
    })

    expect(result.current).toEqual(mockProviders)
  })

  it('should render according to `getLoginUrlsState`', () => {
    const subscribe = vi.fn()
    const mockProviders = [{name: 'google', title: 'Google', url: 'http://test.com/auth/google'}]
    vi.mocked(getLoginUrlsState).mockReturnValue({
      getCurrent: () => mockProviders,
      subscribe,
      observable: throwError(() => new Error('Unexpected usage of observable')),
    })

    const {result} = renderHook(() => useLoginUrls())
    expect(result.current).toEqual(mockProviders)
  })
})
