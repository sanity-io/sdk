import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {connectMessageBus, type MessageBusHost} from '@sanity/sdk/dashboard'
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useWorker} from './useWorker'

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

type Feed = {payload: {feed: string}; reply: string[]; message: {type: string}}

let host: MessageBusHost

describe('useWorker', () => {
  beforeEach(() => {
    // The SDK resolves its own app ID from the CLI-embedded global.
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
  })

  it('posts to the named worker through the dashboard and resolves with its reply', async () => {
    host.subscribe('workers.post', (message) => {
      if (message.meta.appId === 'app' && message.payload.name === 'feed') {
        message.reply([`items for ${(message.payload.payload as Feed['payload']).feed}`])
      }
    })
    const {result, rerender} = renderHook(() => useWorker<Feed>('feed'))
    const feed = result.current

    expectTypeOf(feed.post({feed: 'inbox'})).toEqualTypeOf<Promise<string[]>>()
    await expect(feed.post({feed: 'inbox'})).resolves.toEqual(['items for inbox'])

    rerender()
    expect(result.current).toBe(feed)
  })

  it('rejects with the code the dashboard refuses with', async () => {
    host.subscribe('workers.post', (message) => message.reject(undefined, 'NO_RESPONDER'))
    const {result} = renderHook(() => useWorker<Feed>('feed'))

    await expect(result.current.post({feed: 'inbox'})).rejects.toMatchObject({
      code: 'NO_RESPONDER',
    })
  })

  it("runs a handler for each of its worker's messages until unsubscribed", () => {
    const feedWorker = connectMessageBus({appId: 'app', moduleId: 'app/services/feed'})!
    const syncWorker = connectMessageBus({appId: 'app', moduleId: 'app/services/sync'})!
    const {result} = renderHook(() => useWorker<Feed>('feed'))
    const handler = vi.fn()
    const unsubscribe = result.current.subscribe(handler)

    feedWorker.emit('workers.message', {type: 'welcome'})
    syncWorker.emit('workers.message', {type: 'sync'})
    unsubscribe()
    feedWorker.emit('workers.message', {type: 'after unsubscribe'})

    expect(handler.mock.calls).toEqual([[{type: 'welcome'}]])
  })
})
