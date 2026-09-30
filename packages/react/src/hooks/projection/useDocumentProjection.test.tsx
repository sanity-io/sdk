import {type DocumentHandle, getProjectionState, resolveProjection} from '@sanity/sdk'
import {act, render, screen} from '@testing-library/react'
import {useRef} from 'react'
import {NEVER} from 'rxjs'
import {type Mock} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
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
vi.mock('@sanity/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/sdk')>()

  return {
    ...actual,
    resolveProjection: vi.fn(),
    getProjectionState: vi.fn(),
  }
})

const mockDocument: DocumentHandle = {
  documentId: 'doc1',
  documentType: 'exampleType',
}

interface ProjectionResult {
  title: string
  description: string
}

function TestComponent({document, projection}: {document: DocumentHandle; projection: string}) {
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
    getCurrent = vi.fn()
    subscribe = vi.fn()
    vi.mocked(getProjectionState)
      .mockReset()
      .mockReturnValue({getCurrent, subscribe, observable: NEVER})
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
      <ResourceProvider fallback={<div>Loading...</div>}>
        <TestComponent document={mockDocument} projection="{name, description}" />
      </ResourceProvider>,
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

  test('it re-reads the current snapshot when the element becomes visible again after an off-screen update', async () => {
    // The store notifies subscribers only on changes *after* subscribe (it skips the
    // value current at subscribe time), so the mocked subscribe never invokes its
    // callback — matching real behavior. The hook must therefore re-read getCurrent()
    // itself whenever the visibility gate (re)opens, otherwise a value that updated
    // while the element was off-screen stays frozen on screen.
    getCurrent.mockReturnValue({
      data: {title: 'Initial Title', description: 'Initial Description'},
      isPending: false,
    })
    const eventsUnsubscribe = vi.fn()
    subscribe.mockImplementation(() => eventsUnsubscribe)

    render(
      <ResourceProvider fallback={<div>Loading...</div>}>
        <TestComponent document={mockDocument} projection="{name, description}" />
      </ResourceProvider>,
    )

    // Become visible, then hidden — mirrors a card being scrolled out of view.
    await act(async () => {
      intersectionObserverCallback([{isIntersecting: true} as IntersectionObserverEntry])
    })
    await act(async () => {
      intersectionObserverCallback([{isIntersecting: false} as IntersectionObserverEntry])
    })

    // The underlying document changes while the element is off-screen.
    getCurrent.mockReturnValue({
      data: {title: 'Updated Title', description: 'Updated Description'},
      isPending: false,
    })

    // Becoming visible again must surface the value that changed while hidden.
    await act(async () => {
      intersectionObserverCallback([{isIntersecting: true} as IntersectionObserverEntry])
    })

    expect(screen.getByText('Updated Title')).toBeInTheDocument()
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
      <ResourceProvider fallback={<div>Loading...</div>}>
        <TestComponent document={mockDocument} projection="{title, description}" />
      </ResourceProvider>,
    )

    await act(async () => {
      intersectionObserverCallback([{isIntersecting: true} as IntersectionObserverEntry])
      await Promise.resolve()
    })

    expect(screen.getByText('Resolved Title')).toBeInTheDocument()
    expect(screen.getByText('Resolved Description')).toBeInTheDocument()

    // Suspending must resolve the same store entry the hook reads
    const resolveOptions = vi.mocked(resolveProjection).mock.calls.at(-1)?.[1]
    expect(
      vi.mocked(getProjectionState).mock.calls.some(([, options]) => options === resolveOptions),
    ).toBe(true)
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
      <ResourceProvider fallback={<div>Loading...</div>}>
        <TestComponent document={mockDocument} projection="{title, description}" />
      </ResourceProvider>,
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
      <ResourceProvider fallback={<div>Loading...</div>}>
        <TestComponent document={mockDocument} projection="{title}" />
      </ResourceProvider>,
    )

    // Change projection
    getCurrent.mockReturnValue({
      data: {title: 'Updated Title', description: 'Added Description'},
      isPending: false,
    })

    rerender(
      <ResourceProvider fallback={<div>Loading...</div>}>
        <TestComponent document={mockDocument} projection="{title, description}" />
      </ResourceProvider>,
    )

    expect(screen.getByText('Updated Title')).toBeInTheDocument()
    expect(screen.getByText('Added Description')).toBeInTheDocument()
  })

  test.each([
    {
      documentId: 'doc1',
      documentType: 'exampleType',
      resource: {projectId: 'test', dataset: 'test'},
    },
    {
      resource: {dataset: 'test', projectId: 'test'},
      ignored: 'unrelated data',
      documentType: 'exampleType',
      documentId: 'doc1',
    },
  ])(
    'it keeps its subscription across equivalent handle and resource values: %j',
    async (document) => {
      getCurrent.mockReturnValue({
        data: {title: 'Title', description: 'Description'},
        isPending: false,
      })
      const unsubscribe = vi.fn()
      subscribe.mockReturnValue(unsubscribe)
      vi.mocked(getProjectionState)
        .mockClear()
        .mockImplementation(() => ({
          getCurrent,
          subscribe: (...args) => subscribe(...args),
          observable: NEVER,
        }))
      const {rerender} = render(
        <ResourceProvider fallback={<div>Loading...</div>}>
          <TestComponent
            document={{...mockDocument, resource: {projectId: 'test', dataset: 'test'}}}
            projection="{title, description}"
          />
        </ResourceProvider>,
      )
      await act(async () => {
        intersectionObserverCallback([{isIntersecting: true} as IntersectionObserverEntry])
      })
      expect(subscribe).toHaveBeenCalledTimes(1)
      rerender(
        <ResourceProvider fallback={<div>Loading...</div>}>
          <TestComponent document={document} projection="{title, description}" />
        </ResourceProvider>,
      )
      expect(getProjectionState).toHaveBeenCalledTimes(1)
      expect(subscribe).toHaveBeenCalledTimes(1)
      expect(unsubscribe).not.toHaveBeenCalled()

      rerender(
        <ResourceProvider fallback={<div>Loading...</div>}>
          <TestComponent
            document={{...mockDocument, documentId: 'doc2'}}
            projection="{title, description}"
          />
        </ResourceProvider>,
      )
      expect(getProjectionState).toHaveBeenCalledTimes(2)
      expect(unsubscribe).toHaveBeenCalledTimes(1)
      expect(vi.mocked(getProjectionState).mock.calls[1][1]).toMatchObject({documentId: 'doc2'})
    },
  )

  test('it excludes unused params and extra document properties from the serialized handle', () => {
    getCurrent.mockReturnValue({
      data: {title: 'Title', description: 'Description'},
      isPending: false,
    })
    const circular: {self?: unknown} = {}
    circular.self = circular
    const document = {...mockDocument, count: 1n, circular, params: {count: 1n, circular}}
    vi.mocked(getProjectionState).mockClear()
    render(
      <ResourceProvider fallback={<div>Loading...</div>}>
        <TestComponent document={document} projection="{title, description}" />
      </ResourceProvider>,
    )
    expect(screen.getByText('Title')).toBeInTheDocument()
    expect(vi.mocked(getProjectionState).mock.calls[0][1]).not.toHaveProperty('params')
    expect(vi.mocked(getProjectionState).mock.calls[0][1]).not.toHaveProperty('count')
    expect(vi.mocked(getProjectionState).mock.calls[0][1]).not.toHaveProperty('circular')
  })

  test('it subscribes immediately when no ref is provided', async () => {
    getCurrent.mockReturnValue({
      data: {title: 'Title', description: 'Description'},
      isPending: false,
    })
    const eventsUnsubscribe = vi.fn()
    subscribe.mockImplementation(() => eventsUnsubscribe)

    function NoRefComponent({projection, ...docHandle}: DocumentHandle & {projection: string}) {
      const {data} = useDocumentProjection<ProjectionResult>({...docHandle, projection}) // No ref provided
      return (
        <div>
          <h1>{data.title}</h1>
          <p>{data.description}</p>
        </div>
      )
    }

    render(
      <ResourceProvider fallback={<div>Loading...</div>}>
        <NoRefComponent {...mockDocument} projection="{title, description}" />
      </ResourceProvider>,
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
    }: DocumentHandle & {projection: string}) {
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
      <ResourceProvider fallback={<div>Loading...</div>}>
        <NonHtmlRefComponent {...mockDocument} projection="{title, description}" />
      </ResourceProvider>,
    )

    // Should subscribe immediately without waiting for intersection
    expect(subscribe).toHaveBeenCalled()
    expect(screen.getByText('Title')).toBeInTheDocument()
  })
})
