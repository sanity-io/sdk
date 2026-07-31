import {type DocumentPresence, getDocumentPresence} from '@sanity/sdk'
import {act, renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {usePresenceForDocument} from './usePresenceForDocument'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/sdk')>()
  return {...actual, getDocumentPresence: vi.fn()}
})

const entry = (sessionId: string): DocumentPresence =>
  ({
    sessionId,
    documentId: 'movie-1',
    path: ['title'],
    lastActiveAt: '2026-07-30T12:00:00Z',
    user: {sanityUserId: 'u1', profile: {id: 'u1'}, memberships: []},
  }) as unknown as DocumentPresence

/** A minimal StateSource stand-in whose value can be pushed. */
function createSource(initial: DocumentPresence[]) {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    source: {
      getCurrent: () => current,
      subscribe: (cb: () => void) => {
        listeners.add(cb)
        return () => listeners.delete(cb)
      },
    },
    push: (next: DocumentPresence[]) => {
      current = next
      listeners.forEach((cb) => cb())
    },
  }
}

const wrapper = ({children}: {children: React.ReactNode}) => (
  <ResourceProvider projectId="p" dataset="d" fallback={null}>
    {children}
  </ResourceProvider>
)

describe('usePresenceForDocument', () => {
  beforeEach(() => {
    // Without this, `mock.calls[0]` is whatever the previous test did.
    vi.clearAllMocks()
  })

  it('returns presence and updates when the store changes', () => {
    const {source, push} = createSource([entry('s1')])
    vi.mocked(getDocumentPresence).mockReturnValue(source as never)

    const {result} = renderHook(
      () => usePresenceForDocument({documentId: 'movie-1', documentType: 'movie'}),
      {wrapper},
    )

    expect(result.current.presence).toHaveLength(1)

    act(() => push([entry('s1'), entry('s2')]))
    expect(result.current.presence).toHaveLength(2)
  })

  it('passes the document, path, and excludeVersions through', () => {
    const {source} = createSource([])
    vi.mocked(getDocumentPresence).mockReturnValue(source as never)

    renderHook(
      () =>
        usePresenceForDocument({
          documentId: 'drafts.movie-1',
          documentType: 'movie',
          path: ['cast', {_key: 'm1'}],
          excludeVersions: true,
        }),
      {wrapper},
    )

    // Already a draft id, so resolution leaves it alone.
    expect(vi.mocked(getDocumentPresence).mock.calls[0][1]).toMatchObject({
      documentId: 'drafts.movie-1',
      path: ['cast', {_key: 'm1'}],
      excludeVersions: true,
    })
  })

  it('reads the same id useReportPresence writes, or reads never match writes', () => {
    const {source} = createSource([])
    vi.mocked(getDocumentPresence).mockReturnValue(source as never)

    // Forwarded unresolved, exactly as `useReportPresence` forwards it, so core
    // resolves both the same way. If these diverged, field-level presence would
    // silently never match.
    renderHook(
      () =>
        usePresenceForDocument({
          documentId: 'movie-1',
          documentType: 'movie',
          perspective: 'published',
        }),
      {wrapper},
    )

    expect(vi.mocked(getDocumentPresence).mock.calls[0][1]).toMatchObject({
      documentId: 'movie-1',
      perspective: 'published',
    })
  })

  it('does not rebuild the source when a caller passes a fresh path each render', () => {
    const {source} = createSource([])
    vi.mocked(getDocumentPresence).mockReturnValue(source as never)

    const {rerender} = renderHook(
      // A new array identity every render, which is what real callers write.
      () => usePresenceForDocument({documentId: 'movie-1', documentType: 'movie', path: ['title']}),
      {wrapper},
    )

    rerender()
    rerender()

    expect(vi.mocked(getDocumentPresence)).toHaveBeenCalledTimes(1)
  })

  it('returns an empty array rather than undefined before anything arrives', () => {
    const {source} = createSource(undefined as unknown as DocumentPresence[])
    vi.mocked(getDocumentPresence).mockReturnValue(source as never)

    const {result} = renderHook(
      () => usePresenceForDocument({documentId: 'movie-1', documentType: 'movie'}),
      {wrapper},
    )

    expect(result.current.presence).toEqual([])
  })
})
