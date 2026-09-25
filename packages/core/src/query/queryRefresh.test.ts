import {describe, expect, it, vi} from 'vitest'

import {openQueryRefreshChannel, requestQueryRefresh} from './queryRefresh'

describe('queryRefresh', () => {
  it('delivers requests to queries that resubscribe while the channel is open', () => {
    const refresh = openQueryRefreshChannel('p.resubscribe')
    const first = vi.fn()
    refresh.requests.subscribe(first).unsubscribe()

    const second = vi.fn()
    const subscription = refresh.requests.subscribe(second)
    requestQueryRefresh('p.resubscribe')

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    subscription.unsubscribe()
    refresh.close()
  })

  it('drops requests for a resource without an open channel', () => {
    const refresh = openQueryRefreshChannel('p.closed')
    const listener = vi.fn()
    refresh.requests.subscribe(listener)
    refresh.close()

    requestQueryRefresh('p.closed')
    requestQueryRefresh('p.never-opened')
    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps a newer channel open when an older one for the same resource closes', () => {
    const older = openQueryRefreshChannel('p.replaced')
    const newer = openQueryRefreshChannel('p.replaced')
    const listener = vi.fn()
    newer.requests.subscribe(listener)

    older.close()
    requestQueryRefresh('p.replaced')
    expect(listener).toHaveBeenCalledTimes(1)
    newer.close()
  })
})
