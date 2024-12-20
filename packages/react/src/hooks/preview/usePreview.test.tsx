import {type DocumentHandle, getPreviewState, type PreviewValue, resolvePreview} from '@sanity/sdk'
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
  const getCurrent = vi.fn()
  const subscribe = vi.fn()

  return {
    resolvePreview: vi.fn(),
    getPreviewState: vi.fn().mockReturnValue({getCurrent, subscribe}),
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
  let getCurrent: Mock
  let subscribe: Mock

  beforeEach(() => {
    // @ts-expect-error mock does not need param
    getCurrent = getPreviewState().getCurrent as Mock
    // @ts-expect-error mock does not need param
    subscribe = getPreviewState().subscribe as Mock

    // Reset all mocks between tests
    getCurrent.mockReset()
    subscribe.mockReset()
    mockIntersectionObserver.mockReset()
  })

  test('it only subscribes when element is visible', async () => {
    // Setup initial state
    getCurrent.mockReturnValue([{title: 'Initial Title', subtitle: 'Initial Subtitle'}, false])
    const eventsUnsubscribe = vi.fn()
    subscribe.mockImplementation(() => eventsUnsubscribe)

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent document={mockDocument} />
      </Suspense>,
    )

    // Initially, element is not intersecting
    expect(screen.getByText('Initial Title')).toBeInTheDocument()
    expect(subscribe).not.toHaveBeenCalled()

    // Simulate element becoming visible
    await act(async () => {
      intersectionObserverCallback([{isIntersecting: true} as IntersectionObserverEntry])
    })

    // After element becomes visible, events subscription should be active
    expect(subscribe).toHaveBeenCalled()
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
    getCurrent.mockReturnValueOnce([null, true])
    const resolvePromise = Promise.resolve<PreviewValue>({
      title: 'Resolved Title',
      subtitle: 'Resolved Subtitle',
      media: null,
    })
    ;(resolvePreview as Mock).mockReturnValueOnce(resolvePromise)

    let subscriber: () => void
    subscribe.mockImplementation((sub: () => void) => {
      subscriber = sub
      return vi.fn()
    })

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
      getCurrent.mockReturnValue([{title: 'Resolved Title', subtitle: 'Resolved Subtitle'}, false])
      subscriber?.()
    })

    expect(screen.getByText('Resolved Title')).toBeInTheDocument()
    expect(screen.getByText('Resolved Subtitle')).toBeInTheDocument()
  })

  test('it handles environments without IntersectionObserver', async () => {
    // Temporarily remove IntersectionObserver
    const originalIntersectionObserver = window.IntersectionObserver
    // @ts-expect-error - Intentionally removing IntersectionObserver
    delete window.IntersectionObserver

    getCurrent.mockReturnValue([{title: 'Fallback Title', subtitle: 'Fallback Subtitle'}, false])
    subscribe.mockImplementation(() => vi.fn())

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
