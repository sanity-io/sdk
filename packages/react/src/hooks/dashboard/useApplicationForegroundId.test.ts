import {type Application} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {describe, expect, expectTypeOf, it, vi} from 'vitest'

import {useApplicationForegroundId} from './useApplicationForegroundId'

const mocks = vi.hoisted(() => ({useTopic: vi.fn()}))

vi.mock('./useTopic', () => ({useTopic: mocks.useTopic}))

describe('useApplicationForegroundId', () => {
  it('reads the applications.foreground topic', () => {
    mocks.useTopic.mockReturnValue('application-1')

    const {result} = renderHook(() => useApplicationForegroundId())

    expectTypeOf(result.current).toEqualTypeOf<Application['id'] | null>()
    expect(result.current).toBe('application-1')
    expect(mocks.useTopic).toHaveBeenCalledWith('applications.foreground')
  })

  it('returns null before the topic emits', () => {
    mocks.useTopic.mockReturnValue(undefined)

    const {result} = renderHook(() => useApplicationForegroundId())

    expect(result.current).toBeNull()
  })
})
