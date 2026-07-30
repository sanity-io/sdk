import {reportPresence} from '@sanity/sdk'
import {act, renderHook} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useReportPresence} from './useReportPresence'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...actual,
    reportPresence: vi.fn(),
  }
})

const reported = () => vi.mocked(reportPresence).mock.calls.map(([, params]) => params.locations)

const wrapper = ({children}: {children: React.ReactNode}) => (
  <ResourceProvider projectId="p" dataset="d" fallback={null}>
    {children}
  </ResourceProvider>
)

describe('useReportPresence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('announces the document on mount', () => {
    renderHook(() => useReportPresence({documentId: 'doc-1', documentType: 'movie'}), {wrapper})

    // No `path` or `selection` keys at all, rather than keys set to `undefined`.
    expect(reported()).toEqual([[{documentId: 'doc-1'}]])
  })

  it('announces a field path', () => {
    renderHook(
      () => useReportPresence({documentId: 'doc-1', documentType: 'movie', path: ['title']}),
      {wrapper},
    )

    expect(reported()[0][0].path).toEqual(['title'])
  })

  it('carries keyed segments and a selection', () => {
    const path = ['body', {_key: 'b1'}, 'children', {_key: 's1'}, 'text']
    const selection = {
      anchor: {path: [{_key: 'b1'}, 'children', {_key: 's1'}], offset: 1},
      focus: {path: [{_key: 'b1'}, 'children', {_key: 's1'}], offset: 4},
    }

    renderHook(
      () => useReportPresence({documentId: 'doc-1', documentType: 'movie', path, selection}),
      {wrapper},
    )

    expect(reported()[0][0].path).toEqual(path)
    expect(reported()[0][0].selection).toEqual(selection)
  })

  it('does not re-announce when a caller passes fresh literals each render', () => {
    const {rerender} = renderHook(
      () =>
        useReportPresence({
          documentId: 'doc-1',
          documentType: 'movie',
          // A new array identity on every render, which is what real callers do.
          path: ['title'],
        }),
      {wrapper},
    )

    rerender()
    rerender()

    expect(reported()).toHaveLength(1)
  })

  it('throttles a burst and announces the final position', () => {
    const {rerender} = renderHook(
      ({path}: {path: string[]}) =>
        useReportPresence({documentId: 'doc-1', documentType: 'movie', path}),
      {wrapper, initialProps: {path: ['a']}},
    )

    expect(reported()).toHaveLength(1)

    rerender({path: ['b']})
    rerender({path: ['c']})
    expect(reported()).toHaveLength(1)

    // Trailing edge, so the position the user actually settled on is the one sent.
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(reported()).toHaveLength(2)
    expect(reported()[1][0].path).toEqual(['c'])
  })

  it('announces selections more often than field focus', () => {
    const selectionAt = (offset: number) => ({
      anchor: {path: [{_key: 'b1'}], offset},
      focus: {path: [{_key: 'b1'}], offset},
    })

    const {rerender} = renderHook(
      ({offset}: {offset: number}) =>
        useReportPresence({
          documentId: 'doc-1',
          documentType: 'movie',
          path: ['body'],
          selection: selectionAt(offset),
        }),
      {wrapper, initialProps: {offset: 1}},
    )

    expect(reported()).toHaveLength(1)
    rerender({offset: 2})

    // Would still be pending at the 1000ms focus interval. A caret that lags a
    // full second reads as broken, so selections use 250ms.
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(reported()).toHaveLength(2)
  })

  it('clears its location on unmount, staying present but nowhere', () => {
    const {unmount} = renderHook(
      () => useReportPresence({documentId: 'doc-1', documentType: 'movie'}),
      {wrapper},
    )

    unmount()

    expect(reported().at(-1)).toEqual([])
  })

  it('does not clear on every location change, only on unmount', () => {
    const {rerender} = renderHook(
      ({path}: {path: string[]}) =>
        useReportPresence({documentId: 'doc-1', documentType: 'movie', path}),
      {wrapper, initialProps: {path: ['a']}},
    )

    rerender({path: ['b']})
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(reported().every((locations) => locations.length === 1)).toBe(true)
  })
})
