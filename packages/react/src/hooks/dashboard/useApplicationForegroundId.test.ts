import {type Application} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {describe, expect, expectTypeOf, it, vi} from 'vitest'

import {useApplicationForegroundId} from './useApplicationForegroundId'
import {type UseTopicResult} from './useTopic'

const mocks = vi.hoisted(() => ({useTopic: vi.fn()}))

vi.mock('./useTopic', () => ({useTopic: mocks.useTopic}))

describe('useApplicationForegroundId', () => {
  it('reads the applications.foreground topic', () => {
    mocks.useTopic.mockReturnValue({data: 'application-1', isPending: false})

    const {result} = renderHook(() => useApplicationForegroundId())

    expectTypeOf(result.current).toEqualTypeOf<UseTopicResult<Application['id'] | null, true>>()
    expect(result.current).toEqual({data: 'application-1', isPending: false})
    expect(mocks.useTopic).toHaveBeenCalledWith('applications.foreground', {})
  })

  it('forwards the suspension option', () => {
    mocks.useTopic.mockReturnValue({data: null, isPending: false})

    const {result} = renderHook(() => useApplicationForegroundId({suspend: false}))

    expectTypeOf(result.current).toEqualTypeOf<UseTopicResult<Application['id'] | null, false>>()
    expect(result.current).toEqual({data: null, isPending: false})
    expect(mocks.useTopic).toHaveBeenCalledWith('applications.foreground', {suspend: false})
  })
})
