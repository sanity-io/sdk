import {renderHook} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {useApplicationId} from './useApplicationId'

describe('useApplicationId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the application id the Sanity CLI embeds', () => {
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    const {result} = renderHook(() => useApplicationId())
    expect(result.current).toBe('app')
  })

  it('returns null when the application was built without an id', () => {
    const {result} = renderHook(() => useApplicationId())
    expect(result.current).toBeNull()
  })
})
