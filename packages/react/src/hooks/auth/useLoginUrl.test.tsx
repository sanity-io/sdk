import {createSanityInstance, getLoginUrlState} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {throwError} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {useLoginUrl} from './useLoginUrl'

vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn().mockReturnValue(createSanityInstance({projectId: 'p', dataset: 'd'})),
}))

vi.mock('@sanity/sdk', async (importOriginal) => {
  const actual = await importOriginal()
  return {...(actual || {}), getLoginUrlState: vi.fn()}
})

describe('useLoginUrl', () => {
  it('should return login URL', () => {
    const subscribe = vi.fn()
    const mockLoginUrl = 'https://example.com/login'
    vi.mocked(getLoginUrlState).mockReturnValue({
      getCurrent: () => mockLoginUrl,
      subscribe,
      observable: throwError(() => new Error('Unexpected usage of observable')),
    })

    const {result} = renderHook(() => useLoginUrl())
    expect(result.current).toBe(mockLoginUrl)
  })

  it('should return empty string when no URL is available', () => {
    const subscribe = vi.fn()
    vi.mocked(getLoginUrlState).mockReturnValue({
      getCurrent: () => '',
      subscribe,
      observable: throwError(() => new Error('Unexpected usage of observable')),
    })

    const {result} = renderHook(() => useLoginUrl())
    expect(result.current).toBe('')
  })
})
