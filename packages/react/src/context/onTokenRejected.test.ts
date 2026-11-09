import {type SanityInstance} from '@sanity/sdk'
import {getIsTokenRejectedState} from '@sanity/sdk/_internal'
import {BehaviorSubject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {onTokenRejected} from './onTokenRejected'

vi.mock('@sanity/sdk/_internal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/sdk/_internal')>()),
  getIsTokenRejectedState: vi.fn(),
}))

describe('onTokenRejected', () => {
  let rejected: BehaviorSubject<boolean>
  const instance = {} as SanityInstance

  beforeEach(() => {
    vi.useFakeTimers()
    rejected = new BehaviorSubject(false)
    vi.mocked(getIsTokenRejectedState).mockReturnValue({
      getCurrent: () => rejected.value,
      subscribe: vi.fn(),
      observable: rejected,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('refreshes as soon as the token is rejected', () => {
    const refresh = vi.fn()
    onTokenRejected(instance, refresh)
    expect(refresh).not.toHaveBeenCalled()

    rejected.next(true)
    vi.advanceTimersByTime(0)

    expect(refresh).toHaveBeenCalledOnce()
  })

  it('refreshes again every minute while the token stays rejected', () => {
    const refresh = vi.fn()
    onTokenRejected(instance, refresh)
    rejected.next(true)
    vi.advanceTimersByTime(0)

    vi.advanceTimersByTime(60_000)

    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('stops once a new token is set', () => {
    const refresh = vi.fn()
    onTokenRejected(instance, refresh)
    rejected.next(true)
    vi.advanceTimersByTime(0)

    rejected.next(false)
    vi.advanceTimersByTime(5 * 60_000)

    expect(refresh).toHaveBeenCalledOnce()
  })

  it('waits a minute after the last refresh when the new token is rejected too', () => {
    const refresh = vi.fn()
    onTokenRejected(instance, refresh)
    rejected.next(true)
    vi.advanceTimersByTime(0)
    rejected.next(false)

    vi.advanceTimersByTime(10_000)
    rejected.next(true)
    expect(refresh).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(50_000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
