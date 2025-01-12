import {getDocumentState, type SanityDocumentLike} from '@sanity/sdk'
import {act, render, screen} from '@testing-library/react'
import {Suspense} from 'react'
import {identity, map, Observable} from 'rxjs'

import {useDocument} from './useDocument'

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const original = await importOriginal()
  return {...original, getDocumentState: vi.fn()}
})

vi.mock('../context/useSanityInstance')

interface Author extends SanityDocumentLike {
  name?: string
}

function createMockGetDocumentState() {
  const ref = {current: undefined as SanityDocumentLike | null | undefined}
  const subscribers = new Map<string, () => void>()
  const setDocument = (value: SanityDocumentLike | null | undefined) => {
    ref.current = value
    for (const subscriber of subscribers.values()) {
      subscriber()
    }
  }
  const subscribe = vi.fn((subscriber?: () => void) => {
    if (!subscriber) return () => {}

    const id = Math.random().toString()
    subscribers.set(id, subscriber)
    return () => {
      subscribers.delete(id)
    }
  })

  const observable = new Observable<SanityDocumentLike | null | undefined>((observer) => {
    const emitCurrent = () => observer.next(ref.current)
    emitCurrent()
    return subscribe(emitCurrent)
  })

  return {
    setDocument,
    subscribe,
    getDocumentState: vi.fn(
      (_context, _documentId, selector: (doc?: unknown) => unknown = identity) => {
        return {
          getCurrent: () => selector(ref.current) as SanityDocumentLike | null | undefined,
          observable: observable.pipe(map(selector)) as Observable<
            SanityDocumentLike | null | undefined
          >,
          subscribe,
        }
      },
    ),
  }
}

describe('useDocument', () => {
  let subscribe: (subscriber?: () => void) => void
  let setDocument: (doc: SanityDocumentLike | null | undefined) => void

  beforeEach(async () => {
    vi.clearAllMocks()

    const mock = createMockGetDocumentState()
    setDocument = mock.setDocument
    subscribe = mock.subscribe

    vi.mocked(getDocumentState).mockImplementation(mock.getDocumentState)
  })

  it('returns the current value from getDocumentState()', () => {
    // Setup initial state
    setDocument({_id: 'exampleId', _type: 'author', name: 'sdk'})

    function TestComponent() {
      const document = useDocument<Author>('exampleId')
      return <h1>{document?.name}</h1>
    }

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent />
      </Suspense>,
    )

    // Initially, element is not intersecting
    expect(screen.getByText('sdk')).toBeInTheDocument()
    expect(subscribe).toHaveBeenCalled()
  })

  it('works with selectors', () => {
    // Setup initial state
    setDocument({_id: 'exampleId', _type: 'author', name: 'sdk'})

    function TestComponent() {
      const name = useDocument('exampleId', (doc: Author | null) => doc?.name)
      return <h1>{name}</h1>
    }

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent />
      </Suspense>,
    )

    // Initially, element is not intersecting
    expect(screen.getByText('sdk')).toBeInTheDocument()
    expect(subscribe).toHaveBeenCalled()
  })

  it('suspends while initially loading the document', async () => {
    setDocument(undefined)

    function TestComponent() {
      const document = useDocument('exampleId')
      return <h1>{document?._id ?? 'null'}</h1>
    }

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <TestComponent />
      </Suspense>,
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()

    // simulate null (meaning no state from content-lake) document
    await act(async () => {
      setDocument(null)
    })

    expect(screen.getByText('null')).toBeInTheDocument()

    // now try a full document
    await act(async () => {
      setDocument({_id: 'sdk', _type: 'author'})
    })
    expect(screen.getByText('sdk')).toBeInTheDocument()
  })
})
