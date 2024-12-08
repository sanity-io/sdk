import {renderHook} from '@testing-library/react'
import {describe, expect, it} from 'vitest'

import {useCurrentUser} from './useCurrentUser'

describe('useCurrentUser', () => {
  it('should return null initially', () => {
    const mockInstance = {} as any
    const {result} = renderHook(() => useCurrentUser(mockInstance))
    expect(result.current).toBeNull()
  })

  // Add more tests once the hook is implemented
})
