import {type PathChangeMessage} from '@sanity/message-protocol'
import {renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {useDashboardNavigate} from './useDashboardNavigate'

const mockOnMessage = vi.fn()
let mockMessageHandler: ((data: PathChangeMessage['data']) => void) | undefined

vi.mock('../comlink/useWindowConnection', () => {
  return {
    useWindowConnection: ({
      onMessage,
    }: {
      onMessage: Record<string, (data: PathChangeMessage['data']) => void>
    }) => {
      mockMessageHandler = onMessage['dashboard/v1/history/change-path']
      return {
        onMessage: mockOnMessage,
      }
    },
  }
})

describe('useDashboardNavigate', () => {
  const mockNavigateFn = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
    mockMessageHandler = undefined
  })

  it('calls navigate function with correct data when message is received', () => {
    renderHook(() => useDashboardNavigate(mockNavigateFn))

    const mockNavigationData = {
      path: '/test-path',
      type: 'push' as const,
    }
    mockMessageHandler?.(mockNavigationData)

    expect(mockNavigateFn).toHaveBeenCalledWith(mockNavigationData)
  })
})
