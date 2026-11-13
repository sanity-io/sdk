import {renderHook} from '@testing-library/react'
import {type ComponentProps, type ReactNode} from 'react'
import {describe, expect, it, vi} from 'vitest'

import {getDashboardRootContext} from '../../dashboard/module'
import {useTile} from './useTile'

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
  return renderHook(() => useTile(), {
    wrapper: ({children}: {children: ReactNode}) => (
      <RootContext.Provider value={value}>{children}</RootContext.Provider>
    ),
  })
}

describe('useTile', () => {
  it('returns the tile view the host passed to render()', () => {
    const view = {...base, metadata: {size: 'small'}, type: 'tile'} as const

    const {result} = renderInView({signal, viewType: 'tile', props: {view}})

    expect(result.current).toEqual({view})
  })

  it('throws in a view of another type', () => {
    const view = {...base, metadata: null, type: 'panel'} as const

    expect(() =>
      renderInView({signal, viewType: 'panel', props: {onClose: vi.fn(), view}}),
    ).toThrow('useTile must be called inside a tile view, not a panel view')
  })
})
