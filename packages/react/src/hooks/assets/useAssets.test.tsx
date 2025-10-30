import {type AssetDocumentBase, getAssetsState, resolveAssets, type StateSource} from '@sanity/sdk'
import {act, render, screen} from '@testing-library/react'
import {useState} from 'react'
import {type Observable, Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useAssets} from './useAssets'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...original,
    getAssetsState: vi.fn(),
    resolveAssets: vi.fn(),
  }
})

describe('useAssets', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders assets immediately when available', () => {
    const assets: AssetDocumentBase[] = [
      {_id: 'image-1', _type: 'sanity.imageAsset', url: 'u1'},
      {_id: 'file-1', _type: 'sanity.fileAsset', url: 'u2'},
    ]

    vi.mocked(getAssetsState).mockReturnValue({
      getCurrent: vi.fn().mockReturnValue(assets),
      subscribe: vi.fn(),
      get observable(): Observable<unknown> {
        throw new Error('Not implemented')
      },
    } as unknown as StateSource<AssetDocumentBase[]>)

    function TestComponent() {
      const data = useAssets({assetType: 'all'})
      return <div data-testid="output">{data.map((a) => a._id).join(',')}</div>
    }

    render(
      <ResourceProvider projectId="p" dataset="d" fallback={<p>Loading...</p>}>
        <TestComponent />
      </ResourceProvider>,
    )

    expect(screen.getByTestId('output').textContent).toBe('image-1,file-1')
  })

  it('suspends until assets are resolved via Suspense', async () => {
    const ref = {current: undefined as AssetDocumentBase[] | undefined}
    const getCurrent = vi.fn(() => ref.current)
    const storeChanged$ = new Subject<void>()

    vi.mocked(getAssetsState).mockReturnValue({
      getCurrent,
      subscribe: vi.fn((cb) => {
        const sub = storeChanged$.subscribe(cb)
        return () => sub.unsubscribe()
      }),
      get observable(): Observable<unknown> {
        throw new Error('Not implemented')
      },
    } as unknown as StateSource<AssetDocumentBase[] | undefined>)

    let resolvePromise: () => void
    vi.mocked(resolveAssets).mockReturnValue(
      new Promise<AssetDocumentBase[]>((resolve) => {
        resolvePromise = () => {
          ref.current = [{_id: 'image-1', _type: 'sanity.imageAsset'}]
          storeChanged$.next()
          resolve(ref.current)
        }
      }),
    )

    function TestComponent() {
      const data = useAssets({assetType: 'image'})
      return <div data-testid="output">{data.map((a) => a._id).join(',')}</div>
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

    expect(screen.getByTestId('fallback')).toBeInTheDocument()

    await act(async () => {
      resolvePromise()
    })

    expect(screen.getByTestId('output').textContent).toBe('image-1')
  })

  it('re-subscribes and updates when options change', async () => {
    const ref = {current: undefined as AssetDocumentBase[] | undefined}
    const getCurrent = vi.fn(() => ref.current)
    const storeChanged$ = new Subject<void>()

    vi.mocked(getAssetsState).mockImplementation((_instance, options) => {
      if (options?.assetType === 'image') {
        return {
          getCurrent: vi.fn().mockReturnValue([{_id: 'image-1', _type: 'sanity.imageAsset'}]),
          subscribe: vi.fn(),
          get observable(): Observable<unknown> {
            throw new Error('Not implemented')
          },
        } as unknown as StateSource<AssetDocumentBase[] | undefined>
      }

      return {
        getCurrent,
        subscribe: vi.fn((cb) => {
          const sub = storeChanged$.subscribe(cb)
          return () => sub.unsubscribe()
        }),
        get observable(): Observable<unknown> {
          throw new Error('Not implemented')
        },
      } as unknown as StateSource<AssetDocumentBase[] | undefined>
    })

    let resolvePromise: () => void
    vi.mocked(resolveAssets).mockReturnValue(
      new Promise<AssetDocumentBase[]>((resolve) => {
        resolvePromise = () => {
          ref.current = [{_id: 'file-1', _type: 'sanity.fileAsset'}]
          storeChanged$.next()
          resolve(ref.current)
        }
      }),
    )

    function Wrapper() {
      const [kind, setKind] = useState<'image' | 'file'>('image')
      const data = useAssets({assetType: kind})
      return (
        <div>
          <div data-testid="output">{data.map((a) => a._id).join(',')}</div>
          <button data-testid="toggle" onClick={() => setKind('file')}>
            Toggle
          </button>
        </div>
      )
    }

    render(
      <ResourceProvider projectId="p" dataset="d" fallback={<p>Loading...</p>}>
        <Wrapper />
      </ResourceProvider>,
    )

    // Initially for images
    expect(screen.getByTestId('output').textContent).toBe('image-1')

    // Change to files, trigger suspense and then resolve
    act(() => {
      screen.getByTestId('toggle').dispatchEvent(new MouseEvent('click', {bubbles: true}))
    })

    await act(async () => {
      resolvePromise()
    })

    expect(screen.getByTestId('output').textContent).toBe('file-1')
  })

  it('calls unsubscribe on unmount', () => {
    const unsubscribe = vi.fn()
    const subscribe = vi.fn().mockImplementation((_cb: () => void) => {
      // Return cleanup
      return unsubscribe
    })

    vi.mocked(getAssetsState).mockReturnValue({
      getCurrent: vi.fn().mockReturnValue([]),
      subscribe,
      get observable(): Observable<unknown> {
        throw new Error('Not implemented')
      },
    } as unknown as StateSource<AssetDocumentBase[]>)

    function TestComponent() {
      useAssets()
      return null
    }

    const {unmount} = render(
      <ResourceProvider projectId="p" dataset="d" fallback={<p>Loading...</p>}>
        <TestComponent />
      </ResourceProvider>,
    )

    expect(subscribe).toHaveBeenCalled()
    unmount()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('throws when state source getCurrent throws (error path)', () => {
    vi.mocked(getAssetsState).mockReturnValue({
      getCurrent: vi.fn(() => {
        throw new Error('failed')
      }),
      subscribe: vi.fn(),
      get observable(): Observable<unknown> {
        throw new Error('Not implemented')
      },
    } as unknown as StateSource<AssetDocumentBase[]>)

    function TestComponent() {
      const data = useAssets()
      return <div>{data.length}</div>
    }

    expect(() =>
      render(
        <ResourceProvider projectId="p" dataset="d" fallback={<p>Loading...</p>}>
          <TestComponent />
        </ResourceProvider>,
      ),
    ).toThrow('failed')
  })
})
