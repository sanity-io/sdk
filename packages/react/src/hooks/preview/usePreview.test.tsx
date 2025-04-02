import {type DocumentHandle, getPreviewState, type PreviewValue, resolvePreview} from '@sanity/sdk'
import {act, render, screen} from '@testing-library/react'
import {Suspense, useRef} from 'react'
import {type Mock} from 'vitest'

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
  documentId: 'doc1',
  documentType: 'exampleType',
}

function TestComponent(docHandle: DocumentHandle) {
  const ref = useRef(null)
  const {data, isPending} = usePreview({...docHandle, ref})

  return (
    <div ref={ref}>
      <h1>{data?.title}</h1>
      <p>{data?.subtitle}</p>
      {isPending && <div>Pending...</div>}
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
    getCurrent.mockReturnValue({
      data: {title: 'Initial Title', subtitle: 'Initial Subtitle'},
      isPending: false,
    })
    const eventsUnsubscribe = vi.fn()
    subscribe.mockImplementation(() => eventsUnsubscribe)

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent {...mockDocument} />
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

  test.skip('it suspends and resolves data when element becomes visible', async () => {
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
        <TestComponent {...mockDocument} />
      </Suspense>,
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()

    // Simulate element becoming visible
    await act(async () => {
      intersectionObserverCallback([{isIntersecting: true} as IntersectionObserverEntry])
      await resolvePromise
      getCurrent.mockReturnValue({
        data: {title: 'Resolved Title', subtitle: 'Resolved Subtitle'},
        isPending: false,
      })
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

    getCurrent.mockReturnValue({
      data: {title: 'Fallback Title', subtitle: 'Fallback Subtitle'},
      isPending: false,
    })
    subscribe.mockImplementation(() => vi.fn())

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent {...mockDocument} />
      </Suspense>,
    )

    expect(screen.getByText('Fallback Title')).toBeInTheDocument()

    // Restore IntersectionObserver
    window.IntersectionObserver = originalIntersectionObserver
  })

  test('it subscribes immediately when no ref is provided', async () => {
    getCurrent.mockReturnValue({
      data: {title: 'Title', subtitle: 'Subtitle'},
      isPending: false,
    })
    const eventsUnsubscribe = vi.fn()
    subscribe.mockImplementation(() => eventsUnsubscribe)

    function NoRefComponent(docHandle: DocumentHandle) {
      const {data} = usePreview(docHandle) // No ref provided
      return (
        <div>
          <h1>{data?.title}</h1>
          <p>{data?.subtitle}</p>
        </div>
      )
    }

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <NoRefComponent {...mockDocument} />
      </Suspense>,
    )

    // Should subscribe immediately without waiting for intersection
    expect(subscribe).toHaveBeenCalled()
    expect(screen.getByText('Title')).toBeInTheDocument()
  })

  test('it subscribes immediately when ref.current is not an HTML element', async () => {
    getCurrent.mockReturnValue({
      data: {title: 'Title', subtitle: 'Subtitle'},
      isPending: false,
    })
    const eventsUnsubscribe = vi.fn()
    subscribe.mockImplementation(() => eventsUnsubscribe)

    function NonHtmlRefComponent(docHandle: DocumentHandle) {
      const ref = useRef({}) // ref.current is not an HTML element
      const {data} = usePreview({...docHandle, ref})
      return (
        <div>
          <h1>{data?.title}</h1>
          <p>{data?.subtitle}</p>
        </div>
      )
    }

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <NonHtmlRefComponent {...mockDocument} />
      </Suspense>,
    )

    // Should subscribe immediately without waiting for intersection
    expect(subscribe).toHaveBeenCalled()
    expect(screen.getByText('Title')).toBeInTheDocument()
  })
})
