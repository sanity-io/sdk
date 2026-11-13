import {type ApplicationInterface} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {type ReactNode} from 'react'
import {describe, expect, it, vi} from 'vitest'

import {getDashboardRootContext} from '../../dashboard/module'
import {usePanel} from './usePanel'

const RootContext = getDashboardRootContext()
const base = {
  id: 'notes-inbox',
  moduleId: 'views/inbox',
  name: 'inbox',
  title: 'Inbox',
  version: '2',
}

function renderInView(
  view: Exclude<ApplicationInterface, {type: 'worker'}>,
  onClose: (() => void) | null = vi.fn(),
) {
  const hook = renderHook(() => usePanel(), {
    wrapper: ({children}: {children: ReactNode}) => (
      <RootContext.Provider
        value={{signal: new AbortController().signal, props: {onClose: onClose ?? undefined, view}}}
      >
        {children}
      </RootContext.Provider>
    ),
  })

  return {...hook, onClose}
}

describe('usePanel', () => {
  it('returns the panel view and the onClose the host passed to render()', () => {
    const view = {...base, metadata: null, type: 'panel'} as const

    const {result, onClose} = renderInView(view)

    expect(result.current).toEqual({onClose, view})
  })

  it('throws in a view of another type', () => {
    const view = {...base, metadata: {size: 'small'}, type: 'tile'} as const

    expect(() => renderInView(view)).toThrow(
      'usePanel must be called inside a panel view, not a tile view',
    )
  })

  it('throws when the Dashboard renders the panel without onClose', () => {
    const view = {...base, metadata: null, type: 'panel'} as const

    expect(() => renderInView(view, null)).toThrow(
      'The Dashboard rendered this panel without onClose',
    )
  })
})
