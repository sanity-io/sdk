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
  entry: 'https://notes--apps--organization-1.sanity.run',
  moduleId: 'views/inbox',
  name: 'inbox',
  title: 'Inbox',
  surface: 'tile',
  version: '2',
} as const

describe('useView', () => {
  it('returns the view the host passed to render()', () => {
    const {result} = renderHook(() => useView(), {
      wrapper: ({children}: {children: ReactNode}) => (
        <RootContext.Provider
          value={{signal: new AbortController().signal, viewType: 'tile', props: {view}}}
        >
          {children}
        </RootContext.Provider>
      ),
    })

    expect(result.current).toBe(view)
  })

  it('returns the window view the host passed to render()', () => {
    const windowView = {...view, metadata: null, surface: 'window'} as const

    const {result} = renderHook(() => useView(), {
      wrapper: ({children}: {children: ReactNode}) => (
        <RootContext.Provider
          value={{
            signal: new AbortController().signal,
            viewType: 'window',
            props: {view: windowView},
          }}
        >
          {children}
        </RootContext.Provider>
      ),
    })

    expect(result.current).toBe(windowView)
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
