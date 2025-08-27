import {
  type DocumentHandle,
  getProjectionState,
  resolveProjection,
  type ValidProjection,
} from '@sanity/sdk'
import {act, render, screen} from '@testing-library/react'
import {Suspense, useRef} from 'react'
import {type Mock} from 'vitest'

import {useDocumentProjection} from './useDocumentProjection'

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
  documentId: 'doc1',
  documentType: 'exampleType',
}

interface ProjectionResult {
  title: string
  description: string
}

function TestComponent({
  document,
  projection,
}: {
  document: DocumentHandle
  projection: ValidProjection
}) {
  const ref = useRef(null)
  const {data, isPending} = useDocumentProjection<ProjectionResult>({...document, projection, ref})

  return (
    <div ref={ref}>
      <h1>{data.title}</h1>
      <p>{data.description}</p>
      {isPending && <div>Pending...</div>}
    </div>
  )
}

describe('useDocumentProjection', () => {
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

  test('it only subscribes when element is visible', async () => {
    // Setup initial state
    getCurrent.mockReturnValue({
      data: {title: 'Initial Title', description: 'Initial Description'},
      isPending: false,
    })
    const eventsUnsubscribe = vi.fn()
    subscribe.mockImplementation(() => eventsUnsubscribe)

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent document={mockDocument} projection="{name, description}" />
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
    // Mock the initial state to trigger suspense
    getCurrent.mockReturnValueOnce({
      data: null,
      isPending: true,
    })

    const resolvedData = {
      data: {title: 'Resolved Title', description: 'Resolved Description'},
      isPending: false,
    }

    // Mock resolveProjection to return a promise that resolves immediately
    ;(resolveProjection as Mock).mockReturnValueOnce(Promise.resolve(resolvedData))

    // After suspense resolves, return the resolved data
    getCurrent.mockReturnValue(resolvedData)

    // Setup subscription that does nothing (we'll manually trigger updates)
    subscribe.mockReturnValue(() => {})

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent document={mockDocument} projection="{title, description}" />
      </Suspense>,
    )

    await act(async () => {
      intersectionObserverCallback([{isIntersecting: true} as IntersectionObserverEntry])
      await Promise.resolve()
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
      data: {title: 'Fallback Title', description: 'Fallback Description'},
      isPending: false,
    })
    subscribe.mockImplementation(() => vi.fn())

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent document={mockDocument} projection="{title, description}" />
      </Suspense>,
    )

    expect(screen.getByText('Fallback Title')).toBeInTheDocument()

    // Restore IntersectionObserver
    window.IntersectionObserver = originalIntersectionObserver
  })

  test('it updates when projection changes', async () => {
    getCurrent.mockReturnValue({
      data: {title: 'Initial Title'},
      isPending: false,
    })
    const eventsUnsubscribe = vi.fn()
    subscribe.mockImplementation(() => eventsUnsubscribe)

    const {rerender} = render(
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent document={mockDocument} projection="{title}" />
      </Suspense>,
    )

    // Change projection
    getCurrent.mockReturnValue({
      data: {title: 'Updated Title', description: 'Added Description'},
      isPending: false,
    })

    rerender(
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent document={mockDocument} projection="{title, description}" />
      </Suspense>,
    )

    expect(screen.getByText('Updated Title')).toBeInTheDocument()
    expect(screen.getByText('Added Description')).toBeInTheDocument()
  })

  test('it subscribes immediately when no ref is provided', async () => {
    getCurrent.mockReturnValue({
      data: {title: 'Title', description: 'Description'},
      isPending: false,
    })
    const eventsUnsubscribe = vi.fn()
    subscribe.mockImplementation(() => eventsUnsubscribe)

    function NoRefComponent({
      projection,
      ...docHandle
    }: DocumentHandle & {projection: ValidProjection}) {
      const {data} = useDocumentProjection<ProjectionResult>({...docHandle, projection}) // No ref provided
      return (
        <div>
          <h1>{data.title}</h1>
          <p>{data.description}</p>
        </div>
      )
    }

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <NoRefComponent {...mockDocument} projection="{title, description}" />
      </Suspense>,
    )

    // Should subscribe immediately without waiting for intersection
    expect(subscribe).toHaveBeenCalled()
    expect(screen.getByText('Title')).toBeInTheDocument()
  })

  test('it subscribes immediately when ref.current is not an HTML element', async () => {
    getCurrent.mockReturnValue({
      data: {title: 'Title', description: 'Description'},
      isPending: false,
    })
    const eventsUnsubscribe = vi.fn()
    subscribe.mockImplementation(() => eventsUnsubscribe)

    function NonHtmlRefComponent({
      projection,
      ...docHandle
    }: DocumentHandle & {projection: ValidProjection}) {
      const ref = useRef({}) // ref.current is not an HTML element
      const {data} = useDocumentProjection<ProjectionResult>({...docHandle, projection, ref})
      return (
        <div>
          <h1>{data.title}</h1>
          <p>{data.description}</p>
        </div>
      )
    }

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <NonHtmlRefComponent {...mockDocument} projection="{title, description}" />
      </Suspense>,
    )

    // Should subscribe immediately without waiting for intersection
    expect(subscribe).toHaveBeenCalled()
    expect(screen.getByText('Title')).toBeInTheDocument()
  })

  test('it forwards params to core when provided', async () => {
    const params = {q: 'Star'}

    // Trigger suspense first
    getCurrent.mockReturnValueOnce({
      data: null,
      isPending: true,
    })

    const resolvedData = {
      data: {title: 'Resolved Title', description: 'Resolved Description'},
      isPending: false,
    }

    ;(resolveProjection as Mock).mockReturnValueOnce(Promise.resolve(resolvedData))
    getCurrent.mockReturnValue(resolvedData)
    subscribe.mockReturnValue(() => {})

    function WithParamsComponent({
      projection,
      ...docHandle
    }: DocumentHandle & {projection: ValidProjection}) {
      const ref = useRef(null)
      const {data} = useDocumentProjection<ProjectionResult>({
        ...docHandle,
        projection,
        params,
        ref,
      })
      return (
        <div ref={ref}>
          <h1>{data.title}</h1>
        </div>
      )
    }

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <WithParamsComponent {...mockDocument} projection="{title}" />
      </Suspense>,
    )

    await act(async () => {
      intersectionObserverCallback([{isIntersecting: true} as IntersectionObserverEntry])
      await Promise.resolve()
    })

    const getProjectionCalls = (getProjectionState as unknown as Mock).mock.calls
    const getProjectionCall = getProjectionCalls[getProjectionCalls.length - 1]
    const resolveProjectionCalls = (resolveProjection as Mock).mock.calls
    const resolveProjectionCall = resolveProjectionCalls[resolveProjectionCalls.length - 1]

    expect(getProjectionCall[1].params).toEqual(params)
    expect(resolveProjectionCall[1].params).toEqual(params)
    expect(screen.getByText('Resolved Title')).toBeInTheDocument()
  })

  test('it works without params and does not set params field', async () => {
    getCurrent.mockReturnValue({
      data: {title: 'No Params', description: 'Desc'},
      isPending: false,
    })
    subscribe.mockReturnValue(() => {})

    function NoParamsComponent({
      projection,
      ...docHandle
    }: DocumentHandle & {projection: ValidProjection}) {
      const {data} = useDocumentProjection<ProjectionResult>({
        ...docHandle,
        projection,
      })
      return <h1>{data.title}</h1>
    }

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <NoParamsComponent {...mockDocument} projection="{title}" />
      </Suspense>,
    )

    const getProjectionCalls = (getProjectionState as unknown as Mock).mock.calls
    const getProjectionCall = getProjectionCalls[getProjectionCalls.length - 1]
    expect('params' in getProjectionCall[1]).toBe(false)
    expect(screen.getByText('No Params')).toBeInTheDocument()
  })
})
