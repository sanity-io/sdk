import {
  type DocumentHandle,
  getPreviewStore,
  type PreviewValue,
  type SanityInstance,
} from '@sanity/sdk'
import {act, render, screen} from '@testing-library/react'
import {Suspense, useRef} from 'react'
import type {Mock} from 'vitest'

import {usePreview} from './usePreview'

// Mock IntersectionObserver
const mockIntersectionObserver = vi.fn()
let intersectionObserverCallback: (entries: IntersectionObserverEntry[]) => void

beforeAll(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
        intersectionObserverCallback = callback
        mockIntersectionObserver(callback)
      }
      observe = vi.fn()
      disconnect = vi.fn()
    },
  )
})

// Mock the preview store
vi.mock('@sanity/sdk', () => {
  const eventsMock = vi.fn()
  const getPreviewMock = vi.fn()
  const resolvePreviewMock = vi.fn()

  return {
    getPreviewStore: vi.fn().mockReturnValue({
      events: eventsMock,
      getPreview: getPreviewMock,
      resolvePreview: resolvePreviewMock,
    }),
  }
})

vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: () => ({}),
}))

const mockDocument: DocumentHandle = {
  _id: 'doc1',
  _type: 'exampleType',
}

function TestComponent({document}: {document: DocumentHandle}) {
  const ref = useRef<HTMLDivElement>(null)
  const [previewValue, pending] = usePreview({document, ref})

  return (
    <div ref={ref}>
      <h1>{previewValue.title}</h1>
      <p>{previewValue.subtitle}</p>
      {pending && <div>Pending...</div>}
    </div>
  )
}

describe('usePreview', () => {
  let eventsMock: Mock
  let getPreviewMock: Mock
  let resolvePreviewMock: Mock
  let observeMock: Mock
  let disconnectMock: Mock

  beforeEach(() => {
    eventsMock = getPreviewStore({} as SanityInstance).events as Mock
    getPreviewMock = getPreviewStore({} as SanityInstance).getPreview as Mock
    resolvePreviewMock = getPreviewStore({} as SanityInstance).resolvePreview as Mock
    observeMock = vi.fn()
    disconnectMock = vi.fn()

    // Reset all mocks between tests
    eventsMock.mockReset()
    getPreviewMock.mockReset()
    resolvePreviewMock.mockReset()
    mockIntersectionObserver.mockReset()
    observeMock.mockReset()
    disconnectMock.mockReset()
  })

  test('it only subscribes when element is visible', async () => {
    // Setup initial state
    getPreviewMock.mockReturnValue([{title: 'Initial Title', subtitle: 'Initial Subtitle'}, false])
    const eventsUnsubscribe = vi.fn()
    eventsMock.mockImplementation(() => ({
      subscribe: (_unused: {next: () => void}) => {
        return {unsubscribe: eventsUnsubscribe}
      },
    }))

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent document={mockDocument} />
      </Suspense>,
    )

    // Initially, element is not intersecting
    expect(screen.getByText('Initial Title')).toBeInTheDocument()

    // Simulate element becoming visible
    await act(async () => {
      intersectionObserverCallback([{isIntersecting: true} as IntersectionObserverEntry])
    })

    // After element becomes visible, events subscription should be active
    expect(eventsMock).toHaveBeenCalledWith({document: mockDocument})

    expect(eventsUnsubscribe).not.toHaveBeenCalled()

    // Simulate element becoming hidden
    await act(async () => {
      intersectionObserverCallback([{isIntersecting: false} as IntersectionObserverEntry])
    })

    // When hidden, should maintain last known state
    expect(screen.getByText('Initial Title')).toBeInTheDocument()
    expect(eventsUnsubscribe).toHaveBeenCalled()
  })

  test('it suspends and resolves data when element becomes visible', async () => {
    // Initial setup with pending state
    getPreviewMock.mockReturnValueOnce([null, true])
    const resolvePromise = Promise.resolve<PreviewValue>({
      title: 'Resolved Title',
      subtitle: 'Resolved Subtitle',
      media: null,
    })
    resolvePreviewMock.mockReturnValueOnce(resolvePromise)

    let observer: {next: () => void}
    eventsMock.mockImplementation(() => ({
      subscribe: ({next}: {next: () => void}) => {
        observer = {next}
        return {unsubscribe: vi.fn()}
      },
    }))

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent document={mockDocument} />
      </Suspense>,
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()

    // Simulate element becoming visible
    await act(async () => {
      intersectionObserverCallback([{isIntersecting: true} as IntersectionObserverEntry])
      await resolvePromise
      getPreviewMock.mockReturnValue([
        {title: 'Resolved Title', subtitle: 'Resolved Subtitle'},
        false,
      ])
      if (observer?.next) observer.next()
    })

    expect(screen.getByText('Resolved Title')).toBeInTheDocument()
    expect(screen.getByText('Resolved Subtitle')).toBeInTheDocument()
  })

  test('it handles environments without IntersectionObserver', async () => {
    // Temporarily remove IntersectionObserver
    const originalIntersectionObserver = window.IntersectionObserver
    // @ts-expect-error - Intentionally removing IntersectionObserver
    delete window.IntersectionObserver

    getPreviewMock.mockReturnValue([
      {title: 'Fallback Title', subtitle: 'Fallback Subtitle'},
      false,
    ])
    eventsMock.mockImplementation(() => ({
      subscribe: () => ({unsubscribe: vi.fn()}),
    }))

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent document={mockDocument} />
      </Suspense>,
    )

    expect(screen.getByText('Fallback Title')).toBeInTheDocument()

    // Restore IntersectionObserver
    window.IntersectionObserver = originalIntersectionObserver
  })
})
