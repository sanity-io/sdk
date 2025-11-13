import {getQueryState, resolveQuery, type StateSource} from '@sanity/sdk'
import {act, render, screen} from '@testing-library/react'
import {useState} from 'react'
import {type Observable, Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useQuery} from './useQuery'

// Mock the functions from '@sanity/sdk'
vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...original,
    getQueryState: vi.fn(),
    resolveQuery: vi.fn(),
  }
})

describe('useQuery', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should render data immediately when available', () => {
    const getCurrent = vi.fn().mockReturnValue('test data')
    vi.mocked(getQueryState).mockReturnValue({
      getCurrent,
      subscribe: vi.fn(),
      get observable(): Observable<unknown> {
        throw new Error('Not implemented')
      },
    } as StateSource<unknown>)

    function TestComponent() {
      const {data, isPending} = useQuery({query: 'test query'})
      return (
        <div data-testid="output">
          {data} - {isPending ? 'pending' : 'not pending'}
        </div>
      )
    }

    render(
      <ResourceProvider projectId="p" dataset="d" fallback={<p>Loading...</p>}>
        <TestComponent />
      </ResourceProvider>,
    )

    // Verify that the output contains the data and that isPending is false
    expect(screen.getByTestId('output').textContent).toContain('test data')
    expect(screen.getByTestId('output').textContent).toContain('not pending')
  })

  it('should suspend rendering until data is resolved via Suspense', async () => {
    const ref = {current: undefined as string | undefined}
    const getCurrent = vi.fn(() => ref.current)
    const storeChanged$ = new Subject<void>()

    vi.mocked(getQueryState).mockReturnValue({
      getCurrent,
      subscribe: vi.fn((cb) => {
        const subscription = storeChanged$.subscribe(cb)
        return () => subscription.unsubscribe()
      }),
      get observable(): Observable<unknown> {
        throw new Error('Not implemented')
      },
    } as StateSource<unknown>)

    // Create a controllable promise to simulate the query resolution
    let resolvePromise: () => void
    // Mock resolveQuery to return our fake promise
    vi.mocked(resolveQuery).mockReturnValue(
      new Promise<void>((resolve) => {
        resolvePromise = () => {
          ref.current = 'resolved data'
          storeChanged$.next()
          resolve()
        }
      }),
    )

    function TestComponent() {
      const {data} = useQuery({query: 'test query'})
      return <div data-testid="output">{data}</div>
    }

    render(
      <ResourceProvider
        projectId="p"
        dataset="d"
        fallback={<div data-testid="fallback">Loading...</div>}
      >
        <TestComponent />
      </ResourceProvider>,
    )

    // Initially, since storeValue is undefined, the component should suspend and fallback is shown
    expect(screen.getByTestId('fallback')).toBeInTheDocument()

    // Now simulate that data becomes available
    await act(async () => {
      resolvePromise()
    })

    expect(screen.getByTestId('output').textContent).toContain('resolved data')
  })

  it('should display transition pending state during query change', async () => {
    const ref = {current: undefined as string | undefined}
    const getCurrent = vi.fn(() => ref.current)
    const storeChanged$ = new Subject<void>()

    vi.mocked(getQueryState).mockImplementation((_instance, {query}) => {
      if (query === 'query1') {
        return {
          getCurrent: vi.fn().mockReturnValue('data1'),
          subscribe: vi.fn(),
          get observable(): Observable<unknown> {
            throw new Error('Not implemented')
          },
        }
      }

      return {
        getCurrent,
        subscribe: vi.fn((cb) => {
          const subscription = storeChanged$.subscribe(cb)
          return () => subscription.unsubscribe()
        }),
        get observable(): Observable<unknown> {
          throw new Error('Not implemented')
        },
      }
    })

    // Create a controllable promise to simulate the query resolution
    let resolvePromise: () => void
    // Mock resolveQuery to return our fake promise
    vi.mocked(resolveQuery).mockReturnValue(
      new Promise<void>((resolve) => {
        resolvePromise = () => {
          ref.current = 'data2'
          storeChanged$.next()
          resolve()
        }
      }),
    )

    function WrapperComponent() {
      const [query, setQuery] = useState('query1')
      const {data, isPending} = useQuery<string>({query})
      return (
        <div>
          <div data-testid="output">
            {data} - {isPending ? 'pending' : 'not pending'}
          </div>
          <button data-testid="button" onClick={() => setQuery('query2')}>
            Change Query
          </button>
        </div>
      )
    }

    render(
      <ResourceProvider projectId="p" dataset="d" fallback={<p>Loading...</p>}>
        <WrapperComponent />
      </ResourceProvider>,
    )

    // Initially, should show data1 and not pending
    expect(screen.getByTestId('output').textContent).toContain('data1')
    expect(screen.getByTestId('output').textContent).toContain('not pending')

    // Trigger query change to "query2"
    act(() => {
      screen.getByTestId('button').click()
    })

    // Immediately after clicking, deferredQueryKey is still for query1,
    // so the hook returns data from the previous query ('data1') but isPending should now be true.
    expect(screen.getByTestId('output').textContent).toContain('data1')
    expect(screen.getByTestId('output').textContent).toContain('pending')

    // Simulate the completion of the transition.
    await act(async () => {
      // Update the global variable so that getCurrent now returns data2 for the new query.
      resolvePromise()
    })

    // Now, the component should render with the new deferred query and display new data.
    expect(screen.getByTestId('output').textContent).toContain('data2')
    expect(screen.getByTestId('output').textContent).toContain('not pending')
  })
})
