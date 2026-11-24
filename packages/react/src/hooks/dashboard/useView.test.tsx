import {renderHook} from '@testing-library/react'
import {type ReactNode} from 'react'
import {describe, expect, it} from 'vitest'

import {viewApplication} from '../../../test/test-utils'
import {getDashboardRootContext} from '../../dashboard/module'
import {useView} from './useView'

const RootContext = getDashboardRootContext()
const view = {
  application: viewApplication,
  id: 'notes-tile-inbox',
  metadata: {size: 'small'},
  moduleId: 'views/inbox',
  name: 'inbox',
  title: 'Inbox',
  type: 'tile',
  version: '2',
} as const

describe('useView', () => {
  it('returns the view the host passed to render(), with its type as surface', () => {
    const {result} = renderHook(() => useView(), {
      wrapper: ({children}: {children: ReactNode}) => (
        <RootContext.Provider
          value={{signal: new AbortController().signal, viewType: 'tile', props: {view}}}
        >
          {children}
        </RootContext.Provider>
      ),
    })

    const {type: _type, ...rest} = view
    expect(result.current).toEqual({...rest, surface: 'tile'})
  })

  it('returns the same view across renders', () => {
    const {result, rerender} = renderHook(() => useView(), {
      wrapper: ({children}: {children: ReactNode}) => (
        <RootContext.Provider
          value={{signal: new AbortController().signal, viewType: 'tile', props: {view}}}
        >
          {children}
        </RootContext.Provider>
      ),
    })
    const first = result.current

    rerender()

    expect(result.current).toBe(first)
  })

  it('throws when the host passes no view', () => {
    expect(() =>
      renderHook(() => useView(), {
        wrapper: ({children}: {children: ReactNode}) => (
          <RootContext.Provider
            value={{signal: new AbortController().signal, viewType: 'tile', props: {} as never}}
          >
            {children}
          </RootContext.Provider>
        ),
      }),
    ).toThrow('useView must be called inside a Dashboard view')
  })

  it('throws outside a Dashboard view', () => {
    expect(() => renderHook(() => useView())).toThrow(
      'useView must be called inside a Dashboard view',
    )
  })
})
