import {renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {AppProviders} from '../../../test/test-utils'
import {useWindowConnection} from '../comlink/useWindowConnection'
import {useAgentResourceContext} from './useAgentResourceContext'

vi.mock('../comlink/useWindowConnection', () => ({
  useWindowConnection: vi.fn(),
}))

describe('useAgentResourceContext', () => {
  let mockSendMessage = vi.fn()

  beforeEach(() => {
    mockSendMessage = vi.fn()
    vi.mocked(useWindowConnection).mockImplementation(() => {
      return {
        sendMessage: mockSendMessage,
        fetch: vi.fn(),
      }
    })
  })

  it('should send context update on mount', () => {
    renderHook(
      () =>
        useAgentResourceContext({
          projectId: 'test-project',
          dataset: 'production',
          documentId: 'doc-123',
        }),
      {wrapper: AppProviders},
    )

    expect(mockSendMessage).toHaveBeenCalledWith('dashboard/v1/events/agent/resource/update', {
      projectId: 'test-project',
      dataset: 'production',
      documentId: 'doc-123',
    })
  })

  it('should send context update without documentId', () => {
    renderHook(
      () =>
        useAgentResourceContext({
          projectId: 'test-project',
          dataset: 'production',
        }),
      {wrapper: AppProviders},
    )

    expect(mockSendMessage).toHaveBeenCalledWith('dashboard/v1/events/agent/resource/update', {
      projectId: 'test-project',
      dataset: 'production',
      documentId: undefined,
    })
  })

  it('should send context update when context changes', () => {
    const {rerender} = renderHook(
      ({documentId}: {documentId: string}) =>
        useAgentResourceContext({
          projectId: 'test-project',
          dataset: 'production',
          documentId,
        }),
      {
        wrapper: AppProviders,
        initialProps: {documentId: 'doc-123'},
      },
    )

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).toHaveBeenCalledWith('dashboard/v1/events/agent/resource/update', {
      projectId: 'test-project',
      dataset: 'production',
      documentId: 'doc-123',
    })

    // Change documentId
    rerender({documentId: 'doc-456'})

    expect(mockSendMessage).toHaveBeenCalledTimes(2)
    expect(mockSendMessage).toHaveBeenLastCalledWith('dashboard/v1/events/agent/resource/update', {
      projectId: 'test-project',
      dataset: 'production',
      documentId: 'doc-456',
    })
  })

  it('should not send duplicate updates for the same context', () => {
    const {rerender} = renderHook(
      ({documentId}: {documentId: string}) =>
        useAgentResourceContext({
          projectId: 'test-project',
          dataset: 'production',
          documentId,
        }),
      {
        wrapper: AppProviders,
        initialProps: {documentId: 'doc-123'},
      },
    )

    expect(mockSendMessage).toHaveBeenCalledTimes(1)

    // Re-render with the same documentId
    rerender({documentId: 'doc-123'})

    // Should still only be called once
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
  })

  it('should warn when projectId is missing', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderHook(
      () =>
        useAgentResourceContext({
          projectId: '',
          dataset: 'production',
          documentId: 'doc-123',
        }),
      {wrapper: AppProviders},
    )

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[useAgentResourceContext] projectId and dataset are required',
      {projectId: '', dataset: 'production'},
    )
    expect(mockSendMessage).not.toHaveBeenCalled()

    consoleWarnSpy.mockRestore()
  })

  it('should warn when dataset is missing', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderHook(
      () =>
        useAgentResourceContext({
          projectId: 'test-project',
          dataset: '',
          documentId: 'doc-123',
        }),
      {wrapper: AppProviders},
    )

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[useAgentResourceContext] projectId and dataset are required',
      {projectId: 'test-project', dataset: ''},
    )
    expect(mockSendMessage).not.toHaveBeenCalled()

    consoleWarnSpy.mockRestore()
  })

  it('should handle errors when sending messages', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSendMessage.mockImplementation(() => {
      throw new Error('Failed to send message')
    })

    // Should not throw, but should log error
    expect(() =>
      renderHook(
        () =>
          useAgentResourceContext({
            projectId: 'test-project',
            dataset: 'production',
            documentId: 'doc-123',
          }),
        {wrapper: AppProviders},
      ),
    ).not.toThrow()

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[useAgentResourceContext] Failed to update context:',
      expect.any(Error),
    )

    consoleErrorSpy.mockRestore()
  })

  it('should update context when switching between documents', () => {
    const {rerender} = renderHook(
      ({documentId}: {documentId: string}) =>
        useAgentResourceContext({
          projectId: 'test-project',
          dataset: 'production',
          documentId,
        }),
      {
        wrapper: AppProviders,
        initialProps: {documentId: 'doc-123'},
      },
    )

    expect(mockSendMessage).toHaveBeenCalledTimes(1)

    // Switch to document 456
    rerender({documentId: 'doc-456'})
    expect(mockSendMessage).toHaveBeenCalledTimes(2)

    // Switch to document 789
    rerender({documentId: 'doc-789'})
    expect(mockSendMessage).toHaveBeenCalledTimes(3)

    // Switch back to document 123
    rerender({documentId: 'doc-123'})
    expect(mockSendMessage).toHaveBeenCalledTimes(4)
  })

  it('should update context when document is cleared', () => {
    const {rerender} = renderHook(
      ({documentId}: {documentId: string | undefined}) =>
        useAgentResourceContext({
          projectId: 'test-project',
          dataset: 'production',
          documentId,
        }),
      {
        wrapper: AppProviders,
        initialProps: {documentId: 'doc-123' as string | undefined},
      },
    )

    expect(mockSendMessage).toHaveBeenCalledWith('dashboard/v1/events/agent/resource/update', {
      projectId: 'test-project',
      dataset: 'production',
      documentId: 'doc-123',
    })

    // Clear documentId
    rerender({documentId: undefined})

    expect(mockSendMessage).toHaveBeenCalledTimes(2)
    expect(mockSendMessage).toHaveBeenLastCalledWith('dashboard/v1/events/agent/resource/update', {
      projectId: 'test-project',
      dataset: 'production',
      documentId: undefined,
    })
  })
})
