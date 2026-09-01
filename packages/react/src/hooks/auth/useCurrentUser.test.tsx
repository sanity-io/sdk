import {
  type CurrentUser,
  getCurrentUserState,
  getIsInDashboardState,
  type StateSource,
} from '@sanity/sdk'
import {act, renderHook} from '@testing-library/react'
import {of} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createIsolatedMessageBus, type MessageBus} from '../../dashboard/messageBus/bus'
import {useCurrentUser} from './useCurrentUser'

const mocks = vi.hoisted(() => ({
  instance: {config: {}},
  messageBus: undefined as MessageBus | undefined,
}))

vi.mock('@sanity/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/sdk')>()),
  getCurrentUserState: vi.fn(),
  getIsInDashboardState: vi.fn(),
}))

vi.mock('../../dashboard/messageBus/client', () => ({
  getDashboardMessageBus: () => mocks.messageBus,
}))

vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: () => mocks.instance,
}))

const stateSource = <T,>(value: T): StateSource<T> => ({
  getCurrent: () => value,
  observable: of(value),
  subscribe: () => () => {},
})

const coreUser: CurrentUser = {
  id: 'core-user',
  name: 'Core User',
  email: 'core@example.com',
  role: 'administrator',
  roles: [{name: 'administrator', title: 'Administrator'}],
}

const dashboardUser: CurrentUser = {
  id: 'dashboard-user',
  name: 'Dashboard User',
  email: 'dashboard@example.com',
  profileImage: 'https://example.com/avatar.png',
  role: 'developer',
  roles: [{name: 'developer', title: 'Developer'}],
}

describe('useCurrentUser', () => {
  beforeEach(() => {
    mocks.messageBus = undefined
    vi.mocked(getIsInDashboardState).mockReturnValue(stateSource(false))
    vi.mocked(getCurrentUserState).mockReturnValue(stateSource(coreUser))
  })

  it('reads the full user from SDK state without a message bus', () => {
    const {result} = renderHook(() => useCurrentUser())

    expect(result.current).toEqual(coreUser)
  })

  it('reads the full user from the message bus', () => {
    mocks.messageBus = createIsolatedMessageBus('application')
    const {result} = renderHook(() => useCurrentUser())

    expect(result.current).toEqual(coreUser)

    act(() => mocks.messageBus?.emit('users.current', dashboardUser))
    expect(result.current).toEqual(dashboardUser)
  })

  it('keeps the Comlink-backed SDK state when both transports are visible', () => {
    mocks.messageBus = createIsolatedMessageBus('application')
    mocks.messageBus.emit('users.current', dashboardUser)
    vi.mocked(getIsInDashboardState).mockReturnValue(stateSource(true))

    const {result} = renderHook(() => useCurrentUser())

    expect(result.current).toEqual(coreUser)
  })
})
