import {act, renderHook, waitFor} from '@testing-library/react'
import {BehaviorSubject} from 'rxjs'
import {beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {type ValueOf} from '../../dashboard/messageBus/topics'
import {useTopic} from './useTopic'

const mocks = vi.hoisted(() => ({
  client: undefined as undefined | {subscribe: ReturnType<typeof vi.fn>},
  subscribe: vi.fn(),
}))

vi.mock('../../dashboard/messageBus/client', () => ({
  get dashboardMessageBus() {
    return mocks.client
  },
  isDashboardEnvironment: (client: unknown) => client !== undefined,
}))

describe('useTopic', () => {
  beforeEach(() => {
    mocks.client = {subscribe: mocks.subscribe}
    mocks.subscribe.mockReset()
  })

  it('reads the current value and follows topic updates', async () => {
    const source = new BehaviorSubject<string | null>('application-1')
    mocks.subscribe.mockReturnValue(source)

    const {result} = renderHook(() => useTopic('applications.foreground'))

    expectTypeOf(result.current).toEqualTypeOf<ValueOf<'applications.foreground'> | undefined>()
    await waitFor(() => expect(result.current).toBe('application-1'))

    act(() => source.next('application-2'))

    expect(result.current).toBe('application-2')
    expect(mocks.subscribe).toHaveBeenCalledWith('applications.foreground')
  })

  it('throws outside a dashboard application', () => {
    mocks.client = undefined

    expect(() => renderHook(() => useTopic('applications.foreground'))).toThrow(
      'useTopic must be used inside a dashboard application',
    )
    expect(mocks.subscribe).not.toHaveBeenCalled()
  })
})
