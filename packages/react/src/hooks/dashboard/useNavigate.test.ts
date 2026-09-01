import {type PathChangeMessage} from '@sanity/message-protocol'
import {getIsInDashboardState, type StateSource} from '@sanity/sdk'
import {act, renderHook} from '@testing-library/react'
import {of} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createIsolatedMessageBus, type MessageBus} from '../../dashboard/messageBus/bus'
import {useOptionalWindowConnection} from '../comlink/useWindowConnection'
import {useNavigate} from './useNavigate'

const mocks = vi.hoisted(() => ({
  instance: {config: {}},
  messageBus: undefined as MessageBus | undefined,
  messageHandler: undefined as ((data: PathChangeMessage['data']) => void) | undefined,
}))

vi.mock('@sanity/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/sdk')>()),
  getIsInDashboardState: vi.fn(),
}))

vi.mock('../../dashboard/messageBus/client', () => ({
  getDashboardMessageBus: () => mocks.messageBus,
}))

vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: () => mocks.instance,
}))

vi.mock('../comlink/useWindowConnection', () => ({
  useOptionalWindowConnection: vi.fn((options, enabled: boolean) => {
    mocks.messageHandler = enabled
      ? options.onMessage?.['dashboard/v1/history/change-path']
      : undefined
  }),
}))

const dashboardContextState = (value: boolean): StateSource<boolean> => ({
  getCurrent: () => value,
  observable: of(value),
  subscribe: () => () => {},
})

describe('useNavigate', () => {
  beforeEach(() => {
    mocks.messageBus = undefined
    mocks.messageHandler = undefined
    vi.mocked(getIsInDashboardState).mockReturnValue(dashboardContextState(true))
  })

  it('receives navigation through Comlink inside an embedded application', () => {
    const navigate = vi.fn()
    renderHook(() => useNavigate(navigate))

    const change = {path: '/test-path', type: 'push'} as const
    mocks.messageHandler?.(change)

    expect(navigate).toHaveBeenCalledWith(change)
    expect(useOptionalWindowConnection).toHaveBeenCalledWith(expect.anything(), true)
  })

  it('follows navigation for the foreground federated application', () => {
    const navigate = vi.fn()
    vi.mocked(getIsInDashboardState).mockReturnValue(dashboardContextState(false))
    mocks.messageBus = createIsolatedMessageBus('application')
    mocks.messageBus.emit('applications.foreground', 'application')
    mocks.messageBus.emit('navigation.location', {
      appId: 'application',
      path: 'initial',
      transition: null,
    })

    renderHook(() => useNavigate(navigate))

    expect(navigate).toHaveBeenLastCalledWith({path: 'initial', type: 'pop'})
    expect(useOptionalWindowConnection).toHaveBeenCalledWith(expect.anything(), false)

    act(() =>
      mocks.messageBus?.emit('navigation.location', {
        appId: 'application',
        path: 'initial',
        transition: {
          navigationType: 'replace',
          to: {appId: 'application', path: 'next'},
        },
      }),
    )

    expect(navigate).toHaveBeenLastCalledWith({path: 'next', type: 'replace'})

    act(() =>
      mocks.messageBus?.emit('navigation.location', {
        appId: 'application',
        path: 'next',
        transition: null,
      }),
    )

    expect(navigate).toHaveBeenCalledTimes(2)
  })

  it('ignores navigation for another application', () => {
    const navigate = vi.fn()
    vi.mocked(getIsInDashboardState).mockReturnValue(dashboardContextState(false))
    mocks.messageBus = createIsolatedMessageBus('application')
    mocks.messageBus.emit('applications.foreground', 'application')
    mocks.messageBus.emit('navigation.location', {
      appId: 'other-application',
      path: 'somewhere',
      transition: null,
    })

    renderHook(() => useNavigate(navigate))

    expect(navigate).not.toHaveBeenCalled()
  })
})
