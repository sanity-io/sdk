import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance, type SanityInstance} from '../../store/createSanityInstance'
import {
  installMessageBus,
  type MessageBus,
  MessageBusError,
  type MessageBusHost,
  resetMessageBus,
} from './bus'
import {getDashboardMessageBus} from './store'
import {getTopicState, resolveTopic, TopicError} from './topicStore'

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

let host: MessageBusHost
let instance: SanityInstance

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms)

describe('dashboard topic store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
    instance = createSanityInstance({projectId: 'p', dataset: 'd'})
  })

  afterEach(() => {
    instance.dispose()
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('reads the current value from the bus and unwraps topic results', () => {
    expect(getTopicState(instance, 'applications.foreground').getCurrent()).toBeUndefined()
    host.connections.subscribe((client) => client.emit('applications.foreground', null))
    expect(getTopicState(instance, 'applications.foreground').getCurrent()).toBeNull()

    host.connections.subscribe((client) => client.emit('applications.list', {ok: true, value: []}))
    expect(getTopicState(instance, 'applications.list').getCurrent()).toEqual([])

    host.connections.subscribe((client) => client.emit('applications.list', {ok: false}))
    expect(() => getTopicState(instance, 'applications.list').getCurrent()).toThrow(TopicError)
  })

  it('notifies subscribers when the topic publishes', () => {
    const onChange = vi.fn()
    const unsubscribe = getTopicState(instance, 'auth.token').subscribe(onChange)

    host.connections.subscribe((client) => client.emit('auth.token', 'token'))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(getTopicState(instance, 'auth.token').getCurrent()).toBe('token')
    unsubscribe()
  })

  it('shares one query across pending reads of the same topic', () => {
    const query = vi.spyOn(getDashboardMessageBus(instance) as MessageBus, 'query')

    const first = resolveTopic(instance, 'auth.token')
    const second = resolveTopic(instance, 'auth.token')

    expect(second).toBe(first)
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('records a query failure, then drops it with its last reader', async () => {
    const pending = resolveTopic(instance, 'auth.token')
    await advance(5000)
    await pending

    expect(() => getTopicState(instance, 'auth.token').getCurrent()).toThrow(
      expect.objectContaining({code: 'TIMEOUT'}) as MessageBusError,
    )

    // The temporary reader is released after the grace period; nothing else holds the entry.
    await advance(1000)

    expect(getTopicState(instance, 'auth.token').getCurrent()).toBeUndefined()
  })

  it('returns a value published inside the grace window instead of the recorded failure', async () => {
    const pending = resolveTopic(instance, 'auth.token')
    await advance(5000)
    await pending
    expect(() => getTopicState(instance, 'auth.token').getCurrent()).toThrow(MessageBusError)

    // The temporary reader still holds the entry; a publish must win over its stale failure.
    host.connections.subscribe((client) => client.emit('auth.token', 'token'))

    expect(getTopicState(instance, 'auth.token').getCurrent()).toBe('token')
  })

  it('keeps a pending query alive after its readers leave, so its failure lands on its own entry', async () => {
    const unsubscribe = getTopicState(instance, 'auth.token').subscribe()
    const first = resolveTopic(instance, 'auth.token')
    unsubscribe()
    await advance(1000)

    // Still pending: a new reader joins the same query rather than starting another.
    expect(resolveTopic(instance, 'auth.token')).toBe(first)

    await advance(4000)
    await first
    expect(() => getTopicState(instance, 'auth.token').getCurrent()).toThrow(
      expect.objectContaining({code: 'TIMEOUT'}) as MessageBusError,
    )
  })

  it('keeps the entry while any reader remains', async () => {
    const leaveA = getTopicState(instance, 'auth.token').subscribe()
    const leaveB = getTopicState(instance, 'auth.token').subscribe()
    const pending = resolveTopic(instance, 'auth.token')

    leaveA()
    await advance(1000)
    expect(resolveTopic(instance, 'auth.token')).toBe(pending)

    leaveB()
    await advance(1000)
    // Only the query's own temporary reader is left, and that is enough.
    expect(resolveTopic(instance, 'auth.token')).toBe(pending)
  })

  it('surfaces a query failure to subscribers and ends their subscription', async () => {
    const onChange = vi.fn()
    getTopicState(instance, 'auth.token').subscribe(onChange)
    const pending = resolveTopic(instance, 'auth.token')
    await advance(5000)
    await pending

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(() => getTopicState(instance, 'auth.token').getCurrent()).toThrow(MessageBusError)

    // The failed subscriber is gone: a later publish no longer reaches it, and once the
    // temporary reader is released a fresh read sees the value cleanly.
    await advance(1000)
    host.connections.subscribe((client) => client.emit('auth.token', 'token'))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(getTopicState(instance, 'auth.token').getCurrent()).toBe('token')
  })

  it('reads the value written to this instance connection only', () => {
    const other = createSanityInstance({projectId: 'p', dataset: 'd'})
    // Connect both instances (module ids come from the first store call) before writing.
    getDashboardMessageBus(instance, 'module-a')
    getDashboardMessageBus(other, 'module-b')
    host.connections.subscribe((client) => {
      if (client.moduleId === 'module-a') client.emit('auth.token', 'tok-a')
      if (client.moduleId === 'module-b') client.emit('auth.token', 'tok-b')
    })

    expect(getTopicState(instance, 'auth.token').getCurrent()).toBe('tok-a')
    expect(getTopicState(other, 'auth.token').getCurrent()).toBe('tok-b')
    other.dispose()
  })

  it('throws without an installed message bus', () => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    const other = createSanityInstance({projectId: 'p', dataset: 'd'})

    expect(() => getTopicState(other, 'auth.token').getCurrent()).toThrow(
      'Cannot read topic "auth.token" without an installed dashboard message bus',
    )
    other.dispose()
  })
})
