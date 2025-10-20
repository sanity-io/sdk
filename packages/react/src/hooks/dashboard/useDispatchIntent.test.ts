import {type DocumentHandle} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {useDispatchIntent} from './useDispatchIntent'

const mockSendMessage = vi.fn()
const mockFetch = vi.fn()

vi.mock('../comlink/useWindowConnection', () => {
  return {
    useWindowConnection: () => {
      return {
        sendMessage: mockSendMessage,
        fetch: mockFetch,
      }
    },
  }
})

describe('useDispatchIntent', () => {
  const mockDocumentHandle: DocumentHandle = {
    documentId: 'doc123',
    documentType: 'article',
    projectId: 'project1',
    dataset: 'dataset1',
  }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns a function and connection status', () => {
    const {result} = renderHook(() => useDispatchIntent(mockDocumentHandle))

    expect(result.current).toEqual({
      dispatchIntent: expect.any(Function),
    })
  })

  it('sends correct intents message when called', () => {
    const {result} = renderHook(() => useDispatchIntent(mockDocumentHandle))

    result.current.dispatchIntent()

    expect(mockSendMessage).toHaveBeenCalledWith('dashboard/v1/events/intents/open', {
      document: {
        id: 'doc123',
        type: 'article',
      },
      resource: {
        projectId: 'project1',
        dataset: 'dataset1',
      },
    })
  })
})
