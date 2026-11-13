import {renderHook} from '@testing-library/react'
import {type ComponentProps, type ReactNode} from 'react'
import {describe, expect, it, vi} from 'vitest'

import {getDashboardRootContext} from '../../dashboard/module'
import {usePanel} from './usePanel'

const RootContext = getDashboardRootContext()
const signal = new AbortController().signal
const base = {
  id: 'notes-inbox',
  moduleId: 'views/inbox',
  name: 'inbox',
  title: 'Inbox',
  version: '2',
}

function renderInView(value: ComponentProps<typeof RootContext.Provider>['value']) {
  return renderHook(() => usePanel(), {
    wrapper: ({children}: {children: ReactNode}) => (
      <RootContext.Provider value={value}>{children}</RootContext.Provider>
    ),
  })
}

describe('usePanel', () => {
  it('returns the panel view and the onClose the host passed to render()', () => {
    const view = {...base, metadata: null, type: 'panel'} as const
    const onClose = vi.fn()

    const {result} = renderInView({signal, viewType: 'panel', props: {onClose, view}})

    expect(result.current).toEqual({onClose, view})
  })

  it('throws in a view of another type', () => {
    const view = {...base, metadata: {size: 'small'}, type: 'tile'} as const

    expect(() => renderInView({signal, viewType: 'tile', props: {view}})).toThrow(
      'usePanel must be called inside a panel view, not a tile view',
    )
  })
})
