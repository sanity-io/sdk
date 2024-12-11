import {renderHook} from '@testing-library/react'
import {useHandleCallback} from './useHandleCallback'
import {getAuthStore} from '@sanity/sdk'
import {useSanityInstance} from '../context/useSanityInstance'
import {vi, type Mock} from 'vitest'

vi.mock('../context/useSanityInstance')
vi.mock('@sanity/sdk', () => ({getAuthStore: vi.fn()}))

describe('useHandleCallback', () => {
  it('returns handleCallback from auth store', () => {
    const mockInstance = {id: 'test'}
    const mockHandleCallback = vi.fn()
    const mockAuthStore = {handleCallback: mockHandleCallback}

    ;(useSanityInstance as Mock).mockReturnValue(mockInstance)
    ;(getAuthStore as Mock).mockReturnValue(mockAuthStore)

    const {result} = renderHook(() => useHandleCallback())

    expect(getAuthStore).toHaveBeenCalledWith(mockInstance)
    expect(result.current).toBe(mockHandleCallback)
  })
})
