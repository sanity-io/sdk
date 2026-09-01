import {getIsInDashboardState, getTokenState, type StateSource} from '@sanity/sdk'
import {act, renderHook} from '@testing-library/react'
import {of} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createIsolatedMessageBus, type MessageBus} from '../../dashboard/messageBus/bus'
import {useAuthToken} from './useAuthToken'

const mocks = vi.hoisted(() => ({
  instance: {config: {}},
  messageBus: undefined as MessageBus | undefined,
}))

vi.mock('@sanity/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/sdk')>()),
  getIsInDashboardState: vi.fn(),
  getTokenState: vi.fn(),
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

describe('useAuthToken', () => {
  beforeEach(() => {
    mocks.messageBus = undefined
    vi.mocked(getIsInDashboardState).mockReturnValue(stateSource(false))
    vi.mocked(getTokenState).mockReturnValue(stateSource('core-token'))
  })

  it('reads the token from SDK state without a message bus', () => {
    const {result} = renderHook(() => useAuthToken())

    expect(result.current).toBe('core-token')
  })

  it('reads and follows the message bus token', () => {
    mocks.messageBus = createIsolatedMessageBus('application')
    const {result} = renderHook(() => useAuthToken())

    expect(result.current).toBe('core-token')

    act(() => mocks.messageBus?.emit('auth.token', 'first-token'))
    expect(result.current).toBe('first-token')

    act(() => mocks.messageBus?.emit('auth.token', 'second-token'))
    expect(result.current).toBe('second-token')
  })

  it('keeps the Comlink-backed SDK state when both transports are visible', () => {
    mocks.messageBus = createIsolatedMessageBus('application')
    mocks.messageBus.emit('auth.token', 'bus-token')
    vi.mocked(getIsInDashboardState).mockReturnValue(stateSource(true))

    const {result} = renderHook(() => useAuthToken())

    expect(result.current).toBe('core-token')
  })
})
