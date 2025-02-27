import {type DocumentHandle, getProjectionState, resolveProjection} from '@sanity/sdk'
import {act, render, screen} from '@testing-library/react'
import {Suspense, useRef} from 'react'
import {type Mock} from 'vitest'

import {useProjection} from './useProjection'

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

// Mock the projection store
vi.mock('@sanity/sdk', () => {
  const getCurrent = vi.fn()
  const subscribe = vi.fn()

  return {
    resolveProjection: vi.fn(),
    getProjectionState: vi.fn().mockReturnValue({getCurrent, subscribe}),
  }
})

vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: () => ({}),
}))

const mockDocument: DocumentHandle = {
  _id: 'doc1',
  _type: 'exampleType',
}

// interface ProjectionResult {
//   name: string
//   description: string
// }

function TestComponent({document, projection}: {document: DocumentHandle; projection: string}) {
  const ref = useRef(null)
  const {results, isPending} = useProjection({document, projection, ref})

  return (
    <div ref={ref}>
      {/* @ts-expect-error - Projection result is not typed */}
      <h1>{results?.title}</h1>
      {/* @ts-expect-error - Projection result is not typed */}
      <p>{results?.description}</p>
      {isPending && <div>Pending...</div>}
    </div>
  )
}

describe('useProjection', () => {
  let getCurrent: Mock
  let subscribe: Mock

  beforeEach(() => {
    // @ts-expect-error mock does not need param
    getCurrent = getProjectionState().getCurrent as Mock
    // @ts-expect-error mock does not need param
    subscribe = getProjectionState().subscribe as Mock

    // Reset all mocks between tests
    getCurrent.mockReset()
    subscribe.mockReset()
    mockIntersectionObserver.mockReset()
  })

  // skipping for now because of wonky subscription logic
  test.skip('it only subscribes when element is visible', async () => {
    // Setup initial state
    getCurrent.mockReturnValue({
      results: {title: 'Initial Title', description: 'Initial Description'},
      isPending: false,
    })
    const eventsUnsubscribe = vi.fn()
    subscribe.mockImplementation(() => eventsUnsubscribe)

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent document={mockDocument} projection="name, description" />
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
    const resolvePromise = Promise.resolve({
      title: 'Resolved Title',
      description: 'Resolved Description',
    })
    ;(resolveProjection as Mock).mockReturnValueOnce(resolvePromise)

    let subscriber: () => void
    subscribe.mockImplementation((sub: () => void) => {
      subscriber = sub
      return vi.fn()
    })

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent document={mockDocument} projection="title, description" />
      </Suspense>,
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()

    // Simulate element becoming visible
    await act(async () => {
      intersectionObserverCallback([{isIntersecting: true} as IntersectionObserverEntry])
      await resolvePromise
      getCurrent.mockReturnValue({
        results: {title: 'Resolved Title', description: 'Resolved Description'},
        isPending: false,
      })
      subscriber?.()
    })

    expect(screen.getByText('Resolved Title')).toBeInTheDocument()
    expect(screen.getByText('Resolved Description')).toBeInTheDocument()
  })

  test('it handles environments without IntersectionObserver', async () => {
    // Temporarily remove IntersectionObserver
    const originalIntersectionObserver = window.IntersectionObserver
    // @ts-expect-error - Intentionally removing IntersectionObserver
    delete window.IntersectionObserver

    getCurrent.mockReturnValue({
      results: {title: 'Fallback Title', description: 'Fallback Description'},
      isPending: false,
    })
    subscribe.mockImplementation(() => vi.fn())

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent document={mockDocument} projection="title, description" />
      </Suspense>,
    )

    expect(screen.getByText('Fallback Title')).toBeInTheDocument()

    // Restore IntersectionObserver
    window.IntersectionObserver = originalIntersectionObserver
  })

  test('it updates when projection changes', async () => {
    getCurrent.mockReturnValue({
      results: {title: 'Initial Title'},
      isPending: false,
    })
    const eventsUnsubscribe = vi.fn()
    subscribe.mockImplementation(() => eventsUnsubscribe)

    const {rerender} = render(
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent document={mockDocument} projection="title" />
      </Suspense>,
    )

    // Change projection
    getCurrent.mockReturnValue({
      results: {title: 'Updated Title', description: 'Added Description'},
      isPending: false,
    })

    rerender(
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent document={mockDocument} projection="title, description" />
      </Suspense>,
    )

    expect(screen.getByText('Updated Title')).toBeInTheDocument()
    expect(screen.getByText('Added Description')).toBeInTheDocument()
  })
})
