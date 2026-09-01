import {act, render, renderHook, screen} from '@testing-library/react'
import {Suspense} from 'react'
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {createIsolatedMessageBus, type MessageBus} from '../../dashboard/messageBus/bus'
import {type PayloadOf, type ValueOf} from '../../dashboard/messageBus/topics'
import {useTopic, type UseTopicResult} from './useTopic'

const mocks = vi.hoisted(() => ({
  client: undefined as MessageBus | undefined,
}))

vi.mock('../../dashboard/messageBus/client', () => ({
  getDashboardMessageBus: () => mocks.client,
}))

describe('useTopic', () => {
  beforeEach(() => {
    mocks.client = createIsolatedMessageBus('dashboard')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads a seeded value and follows topic updates', () => {
    const {result} = renderHook(() => useTopic('applications.foreground', {suspend: true}))

    expectTypeOf(result.current).toEqualTypeOf<
      UseTopicResult<ValueOf<'applications.foreground'>, true>
    >()
    expect(result.current).toEqual({data: null, isPending: false})

    act(() => mocks.client?.emit('applications.foreground', 'application-2'))

    expect(result.current).toEqual({data: 'application-2', isPending: false})
  })

  it('suspends an unseeded topic until its first value', async () => {
    const query = vi.spyOn(mocks.client as MessageBus, 'query')
    const firstValue = mocks.client?.subscribe('auth.token').firstValue

    function Token() {
      return useTopic('auth.token').data
    }

    await act(async () => {
      render(
        <Suspense fallback="Loading">
          <Token />
        </Suspense>,
      )
    })

    expect(screen.getByText('Loading')).toBeInTheDocument()
    expect(query).toHaveBeenCalledWith('auth.token')

    await act(async () => {
      mocks.client?.emit('auth.token', 'token')
      await firstValue
    })

    expect(await screen.findByText('token')).toBeInTheDocument()
  })

  it('returns a pending result when suspension is disabled', () => {
    const {result} = renderHook(() => useTopic('auth.token', {suspend: false}))

    expectTypeOf(result.current).toEqualTypeOf<UseTopicResult<ValueOf<'auth.token'>, false>>()
    expect(result.current).toEqual({data: undefined, isPending: true})

    act(() => mocks.client?.emit('auth.token', null))

    expect(result.current).toEqual({data: null, isPending: false})
  })

  it('follows event payloads when suspension is disabled', () => {
    const {result} = renderHook(() => useTopic('navigation.location.update', {suspend: false}))

    expectTypeOf(result.current).toEqualTypeOf<
      UseTopicResult<PayloadOf<'navigation.location.update'>, false>
    >()
    expect(result.current).toEqual({data: undefined, isPending: true})

    act(() => {
      mocks.client?.emit('navigation.location.update', {url: '/desk'})
    })

    expect(result.current).toEqual({data: {url: '/desk'}, isPending: false})

    act(() => {
      mocks.client?.emit('navigation.location.update', {url: '/media', history: 'replace'})
    })

    expect(result.current).toEqual({
      data: {url: '/media', history: 'replace'},
      isPending: false,
    })
  })

  it('suspends an event topic until its first payload', async () => {
    const query = vi.spyOn(mocks.client as MessageBus, 'query')

    function NavigationRequest() {
      return useTopic('navigation.location.update').data.url
    }

    await act(async () => {
      render(
        <Suspense fallback="Loading">
          <NavigationRequest />
        </Suspense>,
      )
    })

    expect(screen.getByText('Loading')).toBeInTheDocument()
    expect(query).not.toHaveBeenCalled()

    await act(async () => {
      mocks.client?.emit('navigation.location.update', {url: '/desk'})
    })

    expect(screen.getByText('/desk')).toBeInTheDocument()
  })

  it('forgets an event payload after the last consumer unmounts', async () => {
    const first = renderHook(() => useTopic('navigation.location.update', {suspend: false}))

    act(() => {
      mocks.client?.emit('navigation.location.update', {url: '/desk'})
    })
    expect(first.result.current).toEqual({data: {url: '/desk'}, isPending: false})

    first.unmount()
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))

    const second = renderHook(() => useTopic('navigation.location.update', {suspend: false}))
    expect(second.result.current).toEqual({data: undefined, isPending: true})
  })

  it('throws outside a dashboard application', () => {
    mocks.client = undefined

    expect(() => renderHook(() => useTopic('applications.foreground'))).toThrow(
      'useTopic must be used inside a dashboard application',
    )
  })
})
