import {type ValueOf} from '@sanity/workbench'
import {act, renderHook, waitFor} from '@testing-library/react'
import {BehaviorSubject} from 'rxjs'
import {afterEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {useTopic} from './useTopic'

const mocks = vi.hoisted(() => ({
  isDashboardEnvironment: vi.fn(() => true),
  subscribe: vi.fn(),
}))

vi.mock('@sanity/workbench', () => ({os: {subscribe: mocks.subscribe}}))
vi.mock('../../context/dashboardToken', () => ({
  isDashboardEnvironment: mocks.isDashboardEnvironment,
}))

describe('useTopic', () => {
  afterEach(() => {
    mocks.isDashboardEnvironment.mockReturnValue(true)
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
    mocks.isDashboardEnvironment.mockReturnValue(false)

    expect(() => renderHook(() => useTopic('applications.foreground'))).toThrow(
      'useTopic must be used inside a dashboard application',
    )
    expect(mocks.subscribe).not.toHaveBeenCalled()
  })
})
