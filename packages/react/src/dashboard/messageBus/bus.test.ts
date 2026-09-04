import './__fixtures__/test-topics'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
  connectApplicationToMessageBus,
  connectMessageBus,
  createIsolatedMessageBus as createRuntimeMessageBus,
  installMessageBus,
  MessageBusError,
  registerStateTopics,
  resetMessageBus,
} from './bus'

const createMessageBus = (appId = 'dashboard') => createRuntimeMessageBus(appId)

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')
const globals = globalThis as Record<symbol, unknown>
let previousMessageBus: unknown

const preserveMessageBusInstallation = () => {
  previousMessageBus = globals[MESSAGE_BUS_KEY]
  delete globals[MESSAGE_BUS_KEY]
}

const restoreMessageBusInstallation = () => {
  globals[MESSAGE_BUS_KEY] = previousMessageBus
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('dashboard connection', () => {
  beforeEach(preserveMessageBusInstallation)
  afterEach(restoreMessageBusInstallation)

  it('returns undefined without installing a message bus', () => {
    expect(connectMessageBus()).toBeUndefined()
    expect(globals[MESSAGE_BUS_KEY]).toBeUndefined()
  })

  it('requires an application id when installing', () => {
    expect(() => installMessageBus()).toThrowError(
      expect.objectContaining({code: 'MISSING_APP_ID'}),
    )
  })

  it('reuses an existing installation', () => {
    const dashboard = installMessageBus({appId: 'dashboard'})
    const secondInstaller = installMessageBus({appId: 'other'})
    const panel = {
      ok: true as const,
      value: {appId: 'favorites', name: 'list', mode: 'full' as const},
    }

    dashboard.emit('panels.mode', panel)

    expect(secondInstaller.subscribe('panels.mode').getCurrent()).toEqual(panel)
  })

  it('replaces a foreign value at the installation key', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    globals[MESSAGE_BUS_KEY] = {foreign: true}

    const dashboard = installMessageBus({appId: 'dashboard'})

    expect(dashboard).not.toMatchObject({foreign: true})
    expect(globals[MESSAGE_BUS_KEY]).not.toMatchObject({foreign: true})
  })

  it('connects applications to the installed message bus', async () => {
    const dashboard = installMessageBus({appId: 'dashboard'})
    const application = connectMessageBus({appId: 'favorites'})
    if (!application) throw new Error('Expected a dashboard message bus')

    let callerId: string | undefined
    dashboard.subscribe('auth.token.refresh', (message) => {
      callerId = message.meta.appId
      message.reply('new-token')
    })

    await expect(application.emit('auth.token.refresh')).resolves.toBe('new-token')
    expect(callerId).toBe('favorites')
  })

  it('shares state with connected applications', () => {
    const dashboard = installMessageBus({appId: 'dashboard'})
    const application = connectMessageBus({appId: 'favorites'})
    if (!application) throw new Error('Expected a dashboard message bus')

    dashboard.emit('auth.token', 'token')

    expect(application.subscribe('auth.token').getCurrent()).toBe('token')
  })

  it('reports request failures as MessageBusError values', async () => {
    installMessageBus({appId: 'dashboard'})
    const application = connectMessageBus({appId: 'favorites'})
    if (!application) throw new Error('Expected a dashboard message bus')

    const error = await application.emit('auth.token.refresh').catch((caught) => caught)

    expect(error).toBeInstanceOf(MessageBusError)
    expect(error).toMatchObject({code: 'NO_RESPONDER'})
  })

  it('warns and returns undefined without an application id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    installMessageBus({appId: 'dashboard'})

    expect(connectMessageBus()).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      '[sanity-sdk:message-bus] cannot connect without an app ID; build with the Sanity CLI or pass appId',
    )
  })
})

describe('state topics', () => {
  it('exposes the current value, first value, and subsequent updates', async () => {
    const messageBus = createMessageBus()
    registerStateTopics(messageBus, {'test.count': 0})
    const source = messageBus.subscribe('test.count')
    const seen: number[] = []
    source.subscribe((value) => seen.push(value))
    const firstValue = source.firstValue

    messageBus.emit('test.count', 1)
    messageBus.emit('test.count', 2)

    expect(source.getCurrent()).toBe(2)
    await expect(firstValue).resolves.toBe(0)
    expect(seen).toEqual([0, 1, 2])
    expect(messageBus.subscribe('test.count').getCurrent()).toBe(2)
  })

  it('waits for the first value of a suspending topic', async () => {
    const messageBus = createMessageBus()
    registerStateTopics(messageBus, {'test.suspending': undefined})
    const source = messageBus.subscribe('test.suspending')
    const seen: string[] = []
    source.subscribe((value) => seen.push(value))

    expect(source.getCurrent()).toBeUndefined()
    const query = messageBus.query('test.suspending')
    queueMicrotask(() => messageBus.emit('test.suspending', 'ready'))

    await expect(source.firstValue).resolves.toBe('ready')
    await expect(query).resolves.toBe('ready')
    expect(seen).toEqual(['ready'])
  })

  it('times out while a suspending topic has no value', async () => {
    vi.useFakeTimers()
    const messageBus = createMessageBus()
    registerStateTopics(messageBus, {'test.suspending': undefined})

    const result = expect(messageBus.query('test.suspending')).rejects.toMatchObject({
      code: 'TIMEOUT',
    })
    await vi.advanceTimersByTimeAsync(5000)

    await result
  })

  it('aborts a pending query', async () => {
    const messageBus = createMessageBus()
    registerStateTopics(messageBus, {'test.suspending': undefined})
    const controller = new AbortController()

    const result = expect(
      messageBus.query('test.suspending', {signal: controller.signal}),
    ).rejects.toMatchObject({code: 'ABORTED'})
    controller.abort()

    await result
  })

  it('stops a subscription when its signal aborts', () => {
    const messageBus = createMessageBus()
    registerStateTopics(messageBus, {'test.count': 0})
    const controller = new AbortController()
    const seen: number[] = []
    messageBus.subscribe('test.count', (value) => seen.push(value), {
      signal: controller.signal,
    })

    messageBus.emit('test.count', 1)
    controller.abort()
    messageBus.emit('test.count', 2)

    expect(seen).toEqual([0, 1])
  })

  it('does not publish the same state reference twice', () => {
    const messageBus = createMessageBus()
    registerStateTopics(messageBus, {'test.token': null})
    const seen: (string | null)[] = []
    messageBus.subscribe('test.token', (value) => seen.push(value))

    messageBus.emit('test.token', 'token')
    messageBus.emit('test.token', 'token')
    registerStateTopics(messageBus, {'test.token': 'token'})

    expect(seen).toEqual([null, 'token'])
  })

  it('updates an existing topic when it is registered with a new seed', () => {
    const messageBus = createMessageBus()
    registerStateTopics(messageBus, {'test.count': 1})

    registerStateTopics(messageBus, {'test.count': 2})

    expect(messageBus.subscribe('test.count').getCurrent()).toBe(2)
  })

  it('rejects an event registered as state', () => {
    const messageBus = createMessageBus()

    expect(() =>
      registerStateTopics(messageBus, {
        'test.count': 0,
        'panels.mode.set': undefined,
      } as never),
    ).toThrowError(/knows it as "event"/)
  })
})

describe('event topics', () => {
  it('delivers fire-and-forget events to current subscribers without replaying them', () => {
    const messageBus = createMessageBus()
    const seen: number[] = []
    messageBus.subscribe('test.ping', (message) => seen.push(message.payload.n))
    messageBus.subscribe('test.ping').subscribe((payload) => seen.push(payload.n * 10))

    messageBus.emit('test.ping', {n: 1})

    const late: number[] = []
    messageBus.subscribe('test.ping', (message) => late.push(message.payload.n))
    expect(seen).toEqual([1, 10])
    expect(late).toEqual([])
  })

  it('resolves a request with the first reply', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const messageBus = createMessageBus()
    messageBus.subscribe('test.echo', (message) => {
      message.reply({n: message.payload.n + 1})
      message.reply({n: 100})
    })

    await expect(messageBus.emit('test.echo', {n: 1})).resolves.toEqual({n: 2})
  })

  it('rejects a request without a responder', async () => {
    await expect(createMessageBus().emit('test.echo', {n: 1})).rejects.toMatchObject({
      code: 'NO_RESPONDER',
    })
  })

  it('times out when a responder never replies', async () => {
    const messageBus = createMessageBus()
    messageBus.subscribe('test.echo', () => {})

    await expect(messageBus.emit('test.echo', {n: 1}, {timeout: 1})).rejects.toMatchObject({
      code: 'TIMEOUT',
    })
  })

  it('aborts the caller and responder together', async () => {
    const messageBus = createMessageBus()
    const caller = new AbortController()
    let responderSignal: AbortSignal | undefined
    messageBus.subscribe('test.echo', (message) => {
      responderSignal = message.signal
    })

    const result = expect(
      messageBus.emit('test.echo', {n: 1}, {signal: caller.signal, timeout: null}),
    ).rejects.toMatchObject({code: 'ABORTED'})
    caller.abort()

    await result
    expect(responderSignal?.aborted).toBe(true)
  })

  it.each([
    [
      'synchronous',
      () => {
        throw new Error('sync failure')
      },
    ],
    ['asynchronous', () => Promise.reject(new Error('async failure'))],
  ])('reports a %s responder failure', async (_kind, respond) => {
    const messageBus = createMessageBus()
    messageBus.subscribe('test.echo', respond)

    await expect(messageBus.emit('test.echo', {n: 1})).rejects.toMatchObject({
      code: 'HANDLER_THREW',
      cause: expect.any(Error),
    })
  })

  it('supports catch and finally on an emit result', async () => {
    let finalized = false
    const result = createMessageBus().emit('test.echo', {n: 1})

    const finalizedResult = result
      .finally(() => {
        finalized = true
      })
      .catch(() => undefined)
    const code = await result.catch((error) => (error as {code: string}).code)

    await finalizedResult
    expect(code).toBe('NO_RESPONDER')
    expect(finalized).toBe(true)
  })
})

describe('application connections', () => {
  it('stamps emitted messages with the connected application id', async () => {
    const installedMessageBus = createMessageBus('dashboard')
    const application = connectApplicationToMessageBus(installedMessageBus, {appId: 'favorites'})
    let applicationId: string | undefined
    installedMessageBus.subscribe('test.echo', (message) => {
      applicationId = message.meta.appId
      message.reply({n: message.payload.n})
    })

    await application.emit('test.echo', {n: 1})

    expect(applicationId).toBe('favorites')
  })

  it('allows applications to publish shared state topics', () => {
    const installedMessageBus = createMessageBus('dashboard')
    const application = connectApplicationToMessageBus(installedMessageBus, {appId: 'favorites'})
    const panel = {
      ok: true as const,
      value: {appId: 'favorites', name: 'list', mode: 'full' as const},
    }

    application.emit('panels.mode', panel)

    expect(installedMessageBus.subscribe('panels.mode').getCurrent()).toEqual(panel)
  })

  it('returns stable state and event streams', () => {
    const application = connectApplicationToMessageBus(createMessageBus(), {appId: 'favorites'})

    expect(application.subscribe('panels.mode')).toBe(application.subscribe('panels.mode'))
    expect(application.subscribe('test.ping')).toBe(application.subscribe('test.ping'))
  })
})

describe('reset', () => {
  beforeEach(preserveMessageBusInstallation)
  afterEach(restoreMessageBusInstallation)

  it('does nothing when no message bus is installed', () => {
    expect(() => resetMessageBus()).not.toThrow()
  })

  it('resets state sources without unhandled rejections', async () => {
    const messageBus = installMessageBus({appId: 'dashboard'})
    messageBus.subscribe('applications.config')
    const pending = messageBus.query('applications.list')

    resetMessageBus()

    await expect(pending).rejects.toMatchObject({code: 'ABORTED'})
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it('aborts pending work and keeps existing application connections reusable', async () => {
    const installedMessageBus = installMessageBus({appId: 'dashboard'})
    const application = connectMessageBus({appId: 'favorites'})
    if (!application) throw new Error('Expected a dashboard message bus')
    installedMessageBus.subscribe('test.echo', () => {})
    const pending = application.emit('test.echo', {n: 1}, {timeout: null})
    pending.catch(() => {})

    resetMessageBus()

    await expect(pending).rejects.toMatchObject({code: 'ABORTED'})
    const seen: unknown[] = []
    application.subscribe('panels.mode').subscribe((value) => seen.push(value))
    const panel = {
      ok: true as const,
      value: {appId: 'favorites', name: 'list', mode: 'full' as const},
    }
    application.emit('panels.mode', panel)
    expect(seen).toEqual([{ok: true, value: null}, panel])
  })
})
