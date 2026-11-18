import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {type MessageBusHost, type PayloadOf} from '@sanity/sdk/dashboard'
import {type ComponentProps, type ReactNode} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {AppProviders, renderHook} from '../../../test/test-utils'
import {getDashboardRootContext} from '../../dashboard/module'
import {usePanel} from './usePanel'

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')
const RootContext = getDashboardRootContext()
const signal = new AbortController().signal
const base = {
  id: 'notes-inbox',
  moduleId: 'views/inbox',
  name: 'inbox',
  title: 'Inbox',
  version: '2',
}

let host: MessageBusHost

function renderInView(value: ComponentProps<typeof RootContext.Provider>['value']) {
  return renderHook(() => usePanel(), {
    wrapper: ({children}: {children: ReactNode}) => (
      <AppProviders>
        <RootContext.Provider value={value}>{children}</RootContext.Provider>
      </AppProviders>
    ),
  })
}

describe('usePanel', () => {
  beforeEach(() => {
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
  })

  it('returns the panel view and the onClose the host passed to render()', () => {
    const view = {...base, metadata: null, type: 'panel'} as const
    const onClose = vi.fn()

    const {result} = renderInView({signal, viewType: 'panel', props: {onClose, view}})

    expect(result.current).toEqual({onClose, view, setMode: expect.any(Function)})
  })

  it('sends setMode payloads as panels.mode.set', () => {
    const payloads: PayloadOf<'panels.mode.set'>[] = []
    host.subscribe('panels.mode.set', (message) => payloads.push(message.payload))
    const view = {...base, metadata: null, type: 'panel'} as const

    const {result} = renderInView({signal, viewType: 'panel', props: {onClose: vi.fn(), view}})
    result.current.setMode({name: 'inbox', mode: 'full'})

    expect(payloads).toEqual([{name: 'inbox', mode: 'full'}])
  })

  it('throws in a view of another type', () => {
    const view = {...base, metadata: {size: 'small'}, type: 'tile'} as const

    expect(() => renderInView({signal, viewType: 'tile', props: {view}})).toThrow(
      'usePanel must be called inside a panel view, not a tile view',
    )
  })
})
