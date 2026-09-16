import './__fixtures__/test-topics'

import {EmptyError, firstValueFrom} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
  type ApplicationStatusBus,
  connectApplicationToMessageBus,
  type ConnectApplicationToMessageBusOptions,
  connectMessageBus,
  createIsolatedMessageBus as createRuntimeMessageBus,
  installMessageBus,
  type MessageBus,
  type MessageBusClient,
  type MessageBusConnection,
  MessageBusError,
  type MessageBusHost,
  registerStateTopics,
  resetMessageBus,
} from './bus'
import {type TopicManifest, type TopicMigration} from './topics'

const createMessageBus = (appId = 'dashboard') => createRuntimeMessageBus(appId)

// Connects an application and returns the host's client handle for it.
function connect(host: MessageBusHost, options: ConnectApplicationToMessageBusOptions) {
  const app = connectApplicationToMessageBus(host, options)
  let client: MessageBusClient | undefined
  host.connections.subscribe((candidate) => (client = candidate)).unsubscribe()
  if (client?.moduleId !== (options.moduleId ?? options.appId)) {
    throw new Error('Expected the new connection to be the latest client')
  }
  return {app, client}
}

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')
const MESSAGE_BUS_REGISTRY_KEY = Symbol.for('sanity.os.registry')
const globals = globalThis as Record<symbol, unknown>
let previousMessageBus: unknown

const preserveMessageBusInstallation = () => {
  previousMessageBus = globals[MESSAGE_BUS_KEY]
  delete globals[MESSAGE_BUS_KEY]
}

const restoreMessageBusInstallation = () => {
  globals[MESSAGE_BUS_KEY] = previousMessageBus
}

const getRegistry = (messageBus: MessageBus) =>
  (messageBus as unknown as Record<symbol, {topics: Map<string, TopicManifest[string]>}>)[
    MESSAGE_BUS_REGISTRY_KEY
  ]

type ProfileV1 = {name: string}
type ProfileV2 = {name: string; tags: readonly string[]}
type ProfileV3 = {fullName: string; tags: readonly string[]}

const profileMigrations: readonly TopicMigration[] = [
  {
    from: 1,
    to: 2,
    up: (value) => ({name: (value as ProfileV1).name, tags: []}),
    down: (value) => ({name: (value as ProfileV2).name}),
  },
  {
    from: 2,
    to: 3,
    up: (value) => ({
      fullName: (value as ProfileV2).name,
      tags: (value as ProfileV2).tags,
    }),
    down: (value) => ({
      name: (value as ProfileV3).fullName,
      tags: (value as ProfileV3).tags,
    }),
  },
]

const greetMigrations: readonly TopicMigration[] = [
  {
    from: 1,
    to: 2,
    up: (value) => ({fullName: (value as {name: string}).name}),
    down: (value) => ({name: (value as {fullName: string}).fullName}),
    reply: {
      up: (value) => ({
        salutation: (value as {greeting: string}).greeting,
        language: 'en',
      }),
      down: (value) => ({
        greeting: (value as {salutation: string}).salutation,
      }),
    },
  },
]

const latestMigrations = new Map([
  ['test.profile', profileMigrations],
  ['test.greet', greetMigrations],
])

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
    const secondInstaller = installMessageBus({appId: 'dashboard'})
    const application = connectMessageBus({appId: 'favorites'})
    if (!application) throw new Error('Expected a dashboard message bus')

    const seen: string[] = []
    secondInstaller.connections.subscribe((client) => seen.push(client.appId)).unsubscribe()
    dashboard.connections.subscribe((client) => client.emit('auth.token', 'token'))

    // Both installers share one bus: the second sees every other connection, the first can
    // write to the application.
    expect(seen).toEqual(['dashboard', 'favorites'])
    expect(application.subscribe('auth.token').getCurrent()).toBe('token')
  })

  it('rejects installing as a different application than the installed host', () => {
    installMessageBus({appId: 'dashboard'})

    expect(() => installMessageBus({appId: 'favorites'})).toThrowError(
      expect.objectContaining({code: 'OWNERSHIP_MISMATCH'}),
    )
  })

  it('replaces a foreign value at the installation key and reports it as an error', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    globals[MESSAGE_BUS_KEY] = {foreign: true}

    const dashboard = installMessageBus({appId: 'dashboard'})

    expect(dashboard).not.toMatchObject({foreign: true})
    expect(globals[MESSAGE_BUS_KEY]).not.toMatchObject({foreign: true})
    expect(error).toHaveBeenCalledWith(
      '[sanity-sdk:message-bus] overwriting an incompatible message bus already installed',
    )
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

  it('writes state to a connected application through its client', () => {
    const dashboard = installMessageBus({appId: 'dashboard'})
    const application = connectMessageBus({appId: 'favorites'})
    if (!application) throw new Error('Expected a dashboard message bus')

    dashboard.connections.subscribe((client) => client.emit('auth.token', 'token'))

    expect(application.subscribe('auth.token').getCurrent()).toBe('token')
    expect(() => application.emit('auth.token' as never, 'spoofed' as never)).toThrowError(
      expect.objectContaining({code: 'OWNERSHIP_MISMATCH'}),
    )
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

  it('returns undefined when the installed protocol is incompatible', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    installMessageBus({appId: 'dashboard'})
    const protocolKey = Symbol.for('sanity.os.protocol')
    const installedMessageBus = globals[MESSAGE_BUS_KEY] as Record<symbol, unknown>
    installedMessageBus[protocolKey] = 2

    expect(connectMessageBus({appId: 'favorites'})).toBeUndefined()
  })
})

describe('state topics', () => {
  it('exposes the current value, first value, and subsequent updates', async () => {
    const host = createMessageBus()
    registerStateTopics(host, {'test.count': 0})
    const {app, client} = connect(host, {appId: 'favorites'})
    const source = app.subscribe('test.count')
    const seen: number[] = []
    source.subscribe((value) => seen.push(value))
    const firstValue = source.firstValue

    client.emit('test.count', 1)
    client.emit('test.count', 2)

    expect(source.getCurrent()).toBe(2)
    await expect(firstValue).resolves.toBe(0)
    expect(seen).toEqual([0, 1, 2])
    expect(app.subscribe('test.count').getCurrent()).toBe(2)
  })

  it('waits for the first value of a suspending topic', async () => {
    const host = createMessageBus()
    registerStateTopics(host, {'test.suspending': undefined})
    const {app, client} = connect(host, {appId: 'favorites'})
    const source = app.subscribe('test.suspending')
    const seen: string[] = []
    source.subscribe((value) => seen.push(value))

    expect(source.getCurrent()).toBeUndefined()
    const query = app.query('test.suspending')
    queueMicrotask(() => client.emit('test.suspending', 'ready'))

    await expect(source.firstValue).resolves.toBe('ready')
    await expect(query).resolves.toBe('ready')
    expect(seen).toEqual(['ready'])
  })

  it('times out while a suspending topic has no value', async () => {
    vi.useFakeTimers()
    const host = createMessageBus()
    registerStateTopics(host, {'test.suspending': undefined})
    const {app} = connect(host, {appId: 'favorites'})

    const result = expect(app.query('test.suspending')).rejects.toMatchObject({
      code: 'TIMEOUT',
    })
    await vi.advanceTimersByTimeAsync(5000)

    await result
  })

  it('honours a custom query timeout', async () => {
    vi.useFakeTimers()
    const host = createMessageBus()
    registerStateTopics(host, {'test.suspending': undefined})
    const {app} = connect(host, {appId: 'favorites'})

    const result = expect(app.query('test.suspending', {timeout: 1})).rejects.toMatchObject({
      code: 'TIMEOUT',
    })
    // Rejects well before the 5s default, proving the timeout is configurable.
    await vi.advanceTimersByTimeAsync(1)

    await result
  })

  it('never times out when the query timeout is disabled', async () => {
    vi.useFakeTimers()
    const host = createMessageBus()
    registerStateTopics(host, {'test.suspending': undefined})
    const {app, client} = connect(host, {appId: 'favorites'})

    const query = app.query('test.suspending', {timeout: null})
    await vi.advanceTimersByTimeAsync(60_000)
    client.emit('test.suspending', 'ready')

    await expect(query).resolves.toBe('ready')
  })

  it('aborts a pending query', async () => {
    const host = createMessageBus()
    registerStateTopics(host, {'test.suspending': undefined})
    const {app} = connect(host, {appId: 'favorites'})
    const controller = new AbortController()

    const result = expect(
      app.query('test.suspending', {signal: controller.signal}),
    ).rejects.toMatchObject({code: 'ABORTED'})
    controller.abort()

    await result
  })

  it('stops a subscription when its signal aborts', () => {
    const host = createMessageBus()
    registerStateTopics(host, {'test.count': 0})
    const {app, client} = connect(host, {appId: 'favorites'})
    const controller = new AbortController()
    const seen: number[] = []
    app.subscribe('test.count', (value) => seen.push(value), {
      signal: controller.signal,
    })

    client.emit('test.count', 1)
    controller.abort()
    client.emit('test.count', 2)

    expect(seen).toEqual([0, 1])
  })

  it('skips a repeated value but delivers an equal object with a new reference', () => {
    const host = createMessageBus()
    registerStateTopics(host, {'test.token': null, 'test.profile': undefined})
    const {app, client} = connect(host, {appId: 'favorites'})
    const tokens: (string | null)[] = []
    app.subscribe('test.token', (value) => tokens.push(value))
    const profiles: unknown[] = []
    app.subscribe('test.profile', (value) => profiles.push(value))

    client.emit('test.token', 'token')
    client.emit('test.token', 'token')
    const profile = {fullName: 'Ada', tags: []}
    client.emit('test.profile', profile)
    client.emit('test.profile', profile)
    // React external-store snapshots compare by reference, so a new object must get through.
    client.emit('test.profile', {...profile})

    expect(tokens).toEqual([null, 'token'])
    expect(profiles).toHaveLength(2)
  })

  it('starts each connection from the manifest seed', () => {
    const host = createMessageBus()
    const {app} = connect(host, {appId: 'favorites'})

    expect(app.subscribe('panels.mode').getCurrent()).toEqual({ok: true, value: null})
    expect(app.subscribe('auth.token').getCurrent()).toBeUndefined()
  })

  it('applies a re-registered seed to later connections only', () => {
    const host = createMessageBus()
    registerStateTopics(host, {'test.count': 1})
    const {app: earlier} = connect(host, {appId: 'earlier'})
    expect(earlier.subscribe('test.count').getCurrent()).toBe(1)

    registerStateTopics(host, {'test.count': 2})
    const {app: later} = connect(host, {appId: 'later'})

    expect(later.subscribe('test.count').getCurrent()).toBe(2)
    expect(earlier.subscribe('test.count').getCurrent()).toBe(1)
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

  it('enforces state and responder ownership', () => {
    const host = createMessageBus('dashboard')
    const {app, client} = connect(host, {appId: 'favorites'})
    client.emit('auth.token', 'trusted')

    expect(() => app.emit('auth.token' as never, 'spoofed' as never)).toThrowError(
      expect.objectContaining({code: 'OWNERSHIP_MISMATCH'}),
    )
    expect(() =>
      app.subscribe('auth.token.refresh', (message) => message.reply('spoofed')),
    ).toThrowError(expect.objectContaining({code: 'OWNERSHIP_MISMATCH'}))
    expect(app.subscribe('auth.token').getCurrent()).toBe('trusted')
  })

  it('delivers application status events to the host and rejects app responders', () => {
    const statusHost = createMessageBus('dashboard') as ApplicationStatusBus<MessageBusHost>
    const application = connectApplicationToMessageBus(statusHost, {
      appId: 'favorites',
    }) as ApplicationStatusBus<MessageBusConnection>
    const responder = vi.fn()

    statusHost.subscribe('applications.status.update', responder)
    // @ts-expect-error application connections cannot respond to host-owned topics
    expect(() => application.subscribe('applications.status.update', vi.fn())).toThrowError(
      expect.objectContaining({code: 'OWNERSHIP_MISMATCH'}),
    )

    application.emit('applications.status.update', {
      name: 'list',
      value: {label: 'Syncing'},
    })
    application.emit('applications.status.update', {
      name: 'list',
      value: {label: null},
    })

    expect(responder).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'applications.status.update',
        payload: {name: 'list', value: {label: 'Syncing'}},
        meta: expect.objectContaining({appId: 'favorites'}),
      }),
    )
    expect(responder).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'applications.status.update',
        payload: {name: 'list', value: {label: null}},
        meta: expect.objectContaining({appId: 'favorites'}),
      }),
    )
  })

  it('rejects state emits from every connection, including the host', () => {
    const host = createMessageBus('dashboard')
    const panel = {
      ok: true as const,
      value: {appId: 'favorites', name: 'list', mode: 'full' as const},
    }

    expect(() => host.emit('panels.mode' as never, panel as never)).toThrowError(
      expect.objectContaining({code: 'OWNERSHIP_MISMATCH'}),
    )
    expect(host.subscribe('panels.mode').getCurrent()).toEqual({ok: true, value: null})
  })

  it('returns stable state and event streams', () => {
    const application = connectApplicationToMessageBus(createMessageBus(), {appId: 'favorites'})

    expect(application.subscribe('panels.mode')).toBe(application.subscribe('panels.mode'))
    expect(application.subscribe('test.ping')).toBe(application.subscribe('test.ping'))
  })
})

describe('connection identity and lifetime', () => {
  it('stamps each connection module id on emitted messages', async () => {
    const host = createMessageBus('dashboard')
    const a = connectApplicationToMessageBus(host, {appId: 'app', moduleId: 'module-a'})
    const b = connectApplicationToMessageBus(host, {appId: 'app', moduleId: 'module-b'})
    const seen: (string | undefined)[] = []
    host.subscribe('test.mint', (message) => {
      seen.push(message.meta.moduleId)
      message.reply('ok')
    })

    await a.emit('test.mint')
    await b.emit('test.mint')

    expect(seen).toEqual(['module-a', 'module-b'])
  })

  it('defaults the module id to the app id', async () => {
    const host = createMessageBus('dashboard')
    const application = connectApplicationToMessageBus(host, {appId: 'favorites'})
    let meta: {appId: string; moduleId?: string} | undefined
    host.subscribe('test.mint', (message) => {
      meta = message.meta
      message.reply('ok')
    })

    await application.emit('test.mint')

    expect(meta?.moduleId).toBe('favorites')
    expect(meta?.moduleId).toBe(meta?.appId)
  })

  it('returns a connection with disconnect from connectMessageBus', () => {
    preserveMessageBusInstallation()
    try {
      installMessageBus({appId: 'dashboard'})
      const connection = connectMessageBus({appId: 'favorites', moduleId: 'module'})
      if (!connection) throw new Error('Expected a dashboard message bus')
      expect(typeof connection.disconnect).toBe('function')
    } finally {
      restoreMessageBusInstallation()
    }
  })

  it('tears down one connection while its siblings keep working', async () => {
    const host = createMessageBus('dashboard')
    const a = connectApplicationToMessageBus(host, {appId: 'app', moduleId: 'module-a'})
    const b = connectApplicationToMessageBus(host, {appId: 'app', moduleId: 'module-b'})

    host.subscribe('test.echo', () => {})
    const pending = a.emit('test.echo', {n: 1}, {timeout: null})
    pending.catch(() => {})

    const handlerSeen: number[] = []
    a.subscribe('test.ping', (message) => handlerSeen.push(message.payload.n))
    const streamSeen: number[] = []
    const streamComplete = firstValueFrom(a.subscribe('test.ping')).catch((error) => error)
    a.subscribe('test.ping').subscribe({
      next: (payload) => streamSeen.push(payload.n),
    })

    a.disconnect()

    await expect(pending).rejects.toMatchObject({code: 'ABORTED'})
    // A's subscriptions stop; the stream form completes without a value.
    await expect(streamComplete).resolves.toBeInstanceOf(EmptyError)

    host.emit('test.ping', {n: 5})
    expect(handlerSeen).toEqual([])
    expect(streamSeen).toEqual([])

    // B is untouched and still delivers events.
    const bSeen: number[] = []
    b.subscribe('test.ping', (message) => bSeen.push(message.payload.n))
    host.emit('test.ping', {n: 7})
    expect(bSeen).toEqual([7])
  })

  it('completes a stream subscribed after disconnect() without delivering values', () => {
    const host = createMessageBus('dashboard')
    const a = connectApplicationToMessageBus(host, {appId: 'app', moduleId: 'module-a'})
    // Obtain the stream before disconnect, then subscribe after: the abort notifier must replay.
    const stream = a.subscribe('test.ping')

    a.disconnect()

    const seen: number[] = []
    let completed = false
    stream.subscribe({
      next: (payload) => seen.push(payload.n),
      complete: () => (completed = true),
    })

    expect(completed).toBe(true)
    host.emit('test.ping', {n: 1})
    expect(seen).toEqual([])
  })

  it('fails emit, state emit, query, and subscribe after disconnect()', async () => {
    const host = createMessageBus('dashboard')
    registerStateTopics(host, {'test.count': 0})
    const a = connectApplicationToMessageBus(host, {appId: 'app', moduleId: 'module-a'})

    const responderSeen: number[] = []
    host.subscribe('test.ping', (message) => responderSeen.push(message.payload.n))

    a.disconnect()

    expect(() => a.emit('test.ping', {n: 1})).toThrowError(
      expect.objectContaining({code: 'ABORTED'}),
    )
    expect(() => a.emit('test.count' as never, 1 as never)).toThrowError(
      expect.objectContaining({code: 'ABORTED'}),
    )
    await expect(a.query('test.count')).rejects.toMatchObject({code: 'ABORTED'})
    expect(() => a.subscribe('test.ping', () => {})).toThrowError(
      expect.objectContaining({code: 'ABORTED'}),
    )

    // The blocked emit never reached a sibling responder, and the state topic was not republished.
    expect(responderSeen).toEqual([])
    expect(host.subscribe('test.count').getCurrent()).toBe(0)
  })

  it('delivers a reply only to the requesting connection', async () => {
    const host = createMessageBus('dashboard')
    const a = connectApplicationToMessageBus(host, {appId: 'app', moduleId: 'module-a'})
    const b = connectApplicationToMessageBus(host, {appId: 'app', moduleId: 'module-b'})
    host.subscribe('test.mint', (message) => message.reply(`minted-for-${message.meta.moduleId}`))

    const bReplies: unknown[] = []
    b.subscribe('test.mint').subscribe(() => bReplies.push('b saw a payload'))

    await expect(a.emit('test.mint')).resolves.toBe('minted-for-module-a')
    // B observes the fire-and-forget payload but never A's private reply value.
    expect(bReplies).not.toContain('minted-for-module-a')
  })
})

describe('per-connection state', () => {
  it('delivers a state value only to the connection it was written to', async () => {
    const host = createMessageBus('dashboard')
    const a = connect(host, {appId: 'app', moduleId: 'module-a'})
    const b = connect(host, {appId: 'app', moduleId: 'module-b'})
    const aHandler: (string | null)[] = []
    const bHandler: (string | null)[] = []
    a.app.subscribe('auth.token', (token) => aHandler.push(token))
    b.app.subscribe('auth.token', (token) => bHandler.push(token))

    a.client.emit('auth.token', 'tok-a')
    b.client.emit('auth.token', 'tok-b')

    expect(a.app.subscribe('auth.token').getCurrent()).toBe('tok-a')
    expect(b.app.subscribe('auth.token').getCurrent()).toBe('tok-b')
    expect(aHandler).toEqual(['tok-a'])
    expect(bHandler).toEqual(['tok-b'])
    await expect(a.app.query('auth.token')).resolves.toBe('tok-a')
    await expect(b.app.query('auth.token')).resolves.toBe('tok-b')
    // The host's own copy was never written.
    expect(host.subscribe('auth.token').getCurrent()).toBeUndefined()
  })

  it('starts a later connection without values written to earlier ones', () => {
    const host = createMessageBus('dashboard')
    const a = connect(host, {appId: 'app', moduleId: 'module-a'})
    a.client.emit('auth.token', 'tok-a')

    const late = connect(host, {appId: 'app', moduleId: 'module-late'})

    expect(late.app.subscribe('auth.token').getCurrent()).toBeUndefined()
  })

  it('lists open connections first, then new ones, with one client object per connection', () => {
    const host = createMessageBus('dashboard')
    const a = connect(host, {appId: 'app', moduleId: 'module-a'})
    const seen: MessageBusClient[] = []
    host.connections.subscribe((client) => seen.push(client))

    expect(seen.map((client) => client.moduleId)).toEqual(['module-a'])
    expect(seen[0]).toBe(a.client)

    connectApplicationToMessageBus(host, {appId: 'app', moduleId: 'module-b'})

    expect(seen.map((client) => client.moduleId)).toEqual(['module-a', 'module-b'])
    expect(seen[1]).toMatchObject({appId: 'app', moduleId: 'module-b'})
  })

  it('closes the client and stops writes when its connection disconnects', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const host = createMessageBus('dashboard')
    const a = connect(host, {appId: 'app', moduleId: 'module-a'})
    const b = connect(host, {appId: 'app', moduleId: 'module-b'})
    b.client.emit('auth.token', 'tok-b')
    const bStream = b.app.subscribe('auth.token')
    expect(a.client.closed.aborted).toBe(false)

    a.app.disconnect()

    expect(a.client.closed.aborted).toBe(true)
    expect(() => a.client.emit('auth.token', 'tok-a')).not.toThrow()
    expect(warn).toHaveBeenCalledWith(
      '[sanity-sdk:message-bus] "auth.token" not written: connection "module-a" has closed',
    )
    // B keeps its value and stream.
    expect(bStream.getCurrent()).toBe('tok-b')
    b.client.emit('auth.token', 'tok-b2')
    expect(bStream.getCurrent()).toBe('tok-b2')

    const remaining: string[] = []
    host.connections.subscribe((client) => remaining.push(client.moduleId)).unsubscribe()
    expect(remaining).toEqual(['module-b'])
  })

  it('ends pending state reads and streams of a disconnected connection', async () => {
    const host = createMessageBus('dashboard')
    const a = connect(host, {appId: 'app', moduleId: 'module-a'})
    const pending = a.app.query('auth.token', {timeout: null})
    pending.catch(() => {})
    let completed = false
    a.app.subscribe('auth.token').subscribe({complete: () => (completed = true)})

    a.app.disconnect()

    await expect(pending).rejects.toMatchObject({code: 'ABORTED'})
    expect(completed).toBe(true)
  })

  it('completes connections when the host disconnects', () => {
    const host = createMessageBus('dashboard')
    let completed = false
    host.connections.subscribe({complete: () => (completed = true)})

    host.disconnect()

    expect(completed).toBe(true)
  })

  it('lets a host subscriber write to a connection as soon as it is announced', () => {
    const host = createMessageBus('dashboard')
    host.connections.subscribe((client) =>
      client.emit('auth.token', `token-for-${client.moduleId}`),
    )

    const application = connectApplicationToMessageBus(host, {appId: 'app', moduleId: 'module-a'})

    expect(application.subscribe('auth.token').getCurrent()).toBe('token-for-module-a')
  })

  it('writes through the client owner’s topic version', async () => {
    // The registry speaks the latest version; this host copy is older and writes v1 profiles.
    const dashboard = createRuntimeMessageBus('dashboard', {migrations: latestMigrations})
    registerStateTopics(dashboard, {'test.profile': undefined})
    const olderHost = connectApplicationToMessageBus(dashboard, {
      appId: 'dashboard',
      migrations: new Map(),
    }) as MessageBusHost
    const {app, client} = connect(olderHost, {appId: 'favorites', migrations: latestMigrations})

    client.emit('test.profile', {name: 'Ada'} as never)

    await expect(app.query('test.profile')).resolves.toEqual({fullName: 'Ada', tags: []})
  })

  it('lists and writes to a sibling connection that shares the host app id', () => {
    const host = createMessageBus('dashboard')
    const {app, client} = connect(host, {appId: 'dashboard', moduleId: 'dashboard/views/dock'})

    client.emit('auth.token', 'token')

    expect(client.appId).toBe('dashboard')
    expect(app.subscribe('auth.token').getCurrent()).toBe('token')
    // Only the host's own connection is left out.
    expect(host.subscribe('auth.token').getCurrent()).toBeUndefined()
  })

  it('does not expose connections to an application', () => {
    const host = createMessageBus('dashboard')
    const application = connectApplicationToMessageBus(host, {appId: 'favorites'})

    expect('connections' in application).toBe(false)
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
    installedMessageBus.connections.subscribe((client) => client.emit('panels.mode', panel))
    expect(seen).toEqual([{ok: true, value: null}, panel])
  })

  it('keeps announcing new connections to a host subscribed before the reset', () => {
    const host = installMessageBus({appId: 'dashboard'})
    const seen: string[] = []
    host.connections.subscribe((client) => seen.push(client.moduleId))

    resetMessageBus()
    connectMessageBus({appId: 'favorites', moduleId: 'module-late'})

    expect(seen).toEqual(['module-late'])
  })
})

describe('compatibility', () => {
  beforeEach(preserveMessageBusInstallation)
  afterEach(() => {
    restoreMessageBusInstallation()
    vi.resetModules()
  })

  it('connects independently loaded SDK copies through the shared symbol', async () => {
    const installer = await import('./bus')
    const dashboard = installer.installMessageBus({appId: 'dashboard'})
    vi.resetModules()
    const consumer = await import('./bus')
    const application = consumer.connectMessageBus({appId: 'favorites'})
    if (!application) throw new Error('Expected a dashboard message bus')

    dashboard.subscribe('test.echo', (message) => message.reply({n: message.payload.n + 1}))

    await expect(application.emit('test.echo', {n: 1})).resolves.toEqual({n: 2})
  })

  it('rejects incompatible message bus protocol semantics', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const dashboard = createMessageBus('dashboard')
    const protocolKey = Symbol.for('sanity.os.protocol')
    const internalDashboard = dashboard as unknown as Record<symbol, unknown>
    internalDashboard[protocolKey] = 2
    const application = connectApplicationToMessageBus(dashboard, {appId: 'favorites'})

    // `query` returns a Promise, so a rejected connection must reject rather than throw synchronously.
    await expect(application.query('applications.foreground')).rejects.toMatchObject({
      code: 'PROTOCOL_MISMATCH',
    })
    // `emit`/`subscribe` are not Promise-typed and still surface the failure synchronously.
    expect(() => application.subscribe('applications.foreground')).toThrowError(
      expect.objectContaining({code: 'PROTOCOL_MISMATCH'}),
    )
  })

  it('adapts state across the full migration chain', async () => {
    const dashboard = createRuntimeMessageBus('dashboard', {migrations: latestMigrations})
    registerStateTopics(dashboard, {
      'test.profile': {fullName: 'Initial', tags: ['one']},
    })
    const {app, client} = connect(dashboard, {appId: 'favorites', migrations: new Map()})
    const source = app.subscribe('test.profile')

    expect(source.getCurrent() as unknown).toEqual({name: 'Initial'})
    await expect(source.firstValue as Promise<unknown>).resolves.toEqual({name: 'Initial'})
    expect(source.getCurrent()).toBe(source.getCurrent())

    client.emit('test.profile', {fullName: 'Ada', tags: []})

    expect((await app.query('test.profile')) as unknown).toEqual({name: 'Ada'})
  })

  it('adapts an application newer than the installed message bus', async () => {
    const dashboard = createMessageBus()
    registerStateTopics(dashboard, {'test.profile': undefined})
    const {app, client} = connect(dashboard, {
      appId: 'favorites',
      migrations: new Map([['test.profile', [profileMigrations[1]]]]),
    })

    client.emit('test.profile', {name: 'Ada', tags: []} as never)

    await expect(app.query('test.profile')).resolves.toEqual({fullName: 'Ada', tags: []})
  })

  it('adapts event payloads in both directions', () => {
    const dashboard = createRuntimeMessageBus('dashboard', {migrations: latestMigrations})
    const application = connectApplicationToMessageBus(dashboard, {
      appId: 'favorites',
      migrations: new Map(),
    })
    const dashboardPayloads: unknown[] = []
    dashboard.subscribe('test.greet', (message) => dashboardPayloads.push(message.payload))

    application.emit('test.greet', {name: 'Ada'} as never)

    const applicationPayloads: unknown[] = []
    application.subscribe('test.greet', (message) => applicationPayloads.push(message.payload))
    dashboard.emit('test.greet', {fullName: 'Grace'})

    expect(dashboardPayloads).toEqual([{fullName: 'Ada'}, {fullName: 'Grace'}])
    expect(applicationPayloads).toEqual([{name: 'Grace'}])
  })

  it('adapts event replies for an older emitter', async () => {
    const dashboard = createRuntimeMessageBus('dashboard', {migrations: latestMigrations})
    const application = connectApplicationToMessageBus(dashboard, {
      appId: 'favorites',
      migrations: new Map(),
    })
    dashboard.subscribe('test.greet', (message) =>
      message.reply({salutation: `Hello ${message.payload.fullName}`, language: 'en'}),
    )

    await expect(application.emit('test.greet', {name: 'Ada'} as never)).resolves.toEqual({
      greeting: 'Hello Ada',
    })
  })

  it('adapts event replies from an older responder', async () => {
    const dashboard = createRuntimeMessageBus('dashboard', {migrations: latestMigrations})
    const application = connectApplicationToMessageBus(dashboard, {
      appId: 'favorites',
      migrations: new Map(),
    })
    application.subscribe('test.greet', (message) =>
      message.reply({
        greeting: `Hello ${(message.payload as unknown as {name: string}).name}`,
      } as never),
    )

    await expect(dashboard.emit('test.greet', {fullName: 'Ada'})).resolves.toEqual({
      salutation: 'Hello Ada',
      language: 'en',
    })
  })

  it('keeps migrated fire-and-forget replies lazy', () => {
    vi.useFakeTimers()
    const dashboard = createRuntimeMessageBus('dashboard', {migrations: latestMigrations})
    const application = connectApplicationToMessageBus(dashboard, {
      appId: 'favorites',
      migrations: new Map(),
    })
    let responderSignal: AbortSignal | undefined
    dashboard.subscribe('test.greet', (message) => {
      responderSignal = message.signal
    })

    application.emit('test.greet', {name: 'Ada'} as never, {timeout: 1})
    vi.advanceTimersByTime(1)

    expect(responderSignal?.aborted).toBe(false)
  })

  it('returns a failed connection without replacing a conflicting manifest', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const dashboard = createMessageBus()
    const registry = getRegistry(dashboard)
    registry.topics.set('panels.mode', {
      kind: 'event',
      ownership: {type: 'any_app'},
    })
    registry.topics.delete('auth.token')

    const application = connectApplicationToMessageBus(dashboard, {appId: 'favorites'})

    expect(() => application.subscribe('panels.mode')).toThrowError(
      expect.objectContaining({code: 'PROTOCOL_MISMATCH'}),
    )
    expect(registry.topics.get('panels.mode')).toEqual({
      kind: 'event',
      ownership: {type: 'any_app'},
    })
    expect(registry.topics.has('auth.token')).toBe(false)
  })

  it('returns a failed connection for an incompatible message bus', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const foreignMessageBus = {
      emit() {},
      query() {},
      subscribe() {},
    } as unknown as MessageBus

    const application = connectApplicationToMessageBus(foreignMessageBus, {appId: 'stale'})

    expect(() => application.subscribe('panels.mode')).toThrowError(
      expect.objectContaining({code: 'PROTOCOL_MISMATCH'}),
    )
  })
})
