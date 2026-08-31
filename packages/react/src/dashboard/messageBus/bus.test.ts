import {BehaviorSubject, distinctUntilChanged, map, type Observable} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  applyChain,
  type Bus,
  connect,
  createBus as createRuntimeBus,
  createMessageBus,
  defineStateTopics,
  disconnectApp,
  installMessageBus,
  topicAdapters,
  topicVersions,
} from './bus'
import {type TopicManifest, type TopicMigration} from './topics'

const REGISTRY = Symbol.for('sanity.os.registry')
const createBus = (appId = 'test', config?: Parameters<typeof createRuntimeBus>[1]) =>
  createRuntimeBus(appId, config)
const sharedBus = installMessageBus({appId: 'test'})

afterEach(() => sharedBus.reset())

const getRegistry = (bus: Bus) =>
  (
    bus as unknown as Record<
      symbol,
      {
        appId: string
        topics: Map<string, TopicManifest[string]>
        stateSubjects: Map<string, unknown>
      }
    >
  )[REGISTRY]

describe('createBus', () => {
  it('requires an app ID', () => {
    expect(() => createRuntimeBus(undefined as never)).toThrowError(
      expect.objectContaining({code: 'MISSING_APP_ID'}),
    )
  })

  it('delivers published values to a subscriber (round trip)', () => {
    const bus = createBus()
    defineStateTopics(bus, {'test.count': 0})
    const seen: number[] = []
    bus.subscribe('test.count', (value) => seen.push(value))

    bus.emit('test.count', 1)
    bus.emit('test.count', 2)

    expect(seen).toEqual([0, 1, 2]) // seeded replay, then two updates
  })

  it("isolates instances — one bus's emit never reaches another", () => {
    const a = createBus()
    const b = createBus()
    defineStateTopics(a, {'test.count': 0})
    defineStateTopics(b, {'test.count': 0})
    const seenA: number[] = []
    a.subscribe('test.count', (value) => seenA.push(value))

    b.emit('test.count', 9)

    expect(seenA).toEqual([0])
  })

  it('replays the latest value to a late subscriber', () => {
    const bus = createBus()
    defineStateTopics(bus, {'test.count': 0})
    bus.emit('test.count', 5)

    const seen: number[] = []
    bus.subscribe('test.count', (value) => seen.push(value))

    expect(seen).toEqual([5])
  })

  it('resolves a declared state topic as a StateSource before any publish', () => {
    const bus = createBus()
    const source = bus.subscribe('auth.token')
    expect(typeof source.getCurrent).toBe('function')
    // No declared initial value: reads suspend until the owner publishes.
    expect(source.getCurrent()).toBeUndefined()
  })

  it("replays a topic's declared initial value before any publish", () => {
    const bus = createBus()
    const source = bus.subscribe('panels.mode')
    expect(source.getCurrent()).toEqual({ok: true, value: null})
  })

  it('routes a state emit as state even before any producer declares it', () => {
    const bus = createBus()
    const seen: unknown[] = []
    bus.subscribe('auth.token', (value) => seen.push(value))

    bus.emit('auth.token', 'tok')

    expect(seen).toEqual(['tok'])
  })

  it('rejects declaring a known event topic as state, registering nothing', () => {
    const bus = createBus()
    expect(() =>
      defineStateTopics(bus, {
        'test.count': 0,
        'panels.mode.set': undefined,
      } as never),
    ).toThrowError(/knows it as "event"/)
    expect(getRegistry(bus).topics.has('test.count')).toBe(false)
  })

  it('rejects defining a state topic owned by an app', () => {
    const bus = createBus()
    const token = bus.subscribe('auth.token')

    expect(() => defineStateTopics(bus, {'auth.token': 'spoofed'})).toThrowError(
      expect.objectContaining({code: 'OWNERSHIP_MISMATCH'}),
    )
    expect(token.getCurrent()).toBeUndefined()
  })
})

describe('message bus initialization', () => {
  it('shares one core across importers (first-registration-wins)', () => {
    const key = Symbol.for('sanity.os.bus')
    const globals = globalThis as Record<symbol, unknown>
    const previous = globals[key]
    try {
      delete globals[key]
      const first = installMessageBus({appId: 'first'})
      const second = installMessageBus({appId: 'second'})

      expect(getRegistry(first)).toBe(getRegistry(second))
      expect(getRegistry(first).appId).toBe('first')
    } finally {
      globals[key] = previous
    }
  })

  it('connects an application to the installed bus', () => {
    const seen: number[] = []
    const stop = new AbortController()
    installMessageBus({appId: 'test'}).subscribe('test.ping', (msg) => seen.push(msg.payload.n), {
      signal: stop.signal,
    })
    try {
      createMessageBus({appId: 'test'}).emit('test.ping', {n: 7})
      expect(seen).toEqual([7])
    } finally {
      stop.abort()
    }
  })

  it('replaces a foreign value squatting on the install key', () => {
    const key = Symbol.for('sanity.os.bus')
    const globals = globalThis as Record<symbol, unknown>
    const previous = globals[key]
    try {
      globals[key] = {fake: true}
      const core = installMessageBus({appId: 'installer'})
      expect(core).not.toMatchObject({fake: true})
      expect(getRegistry(core).appId).toBe('installer')
      expect(getRegistry(installMessageBus({appId: 'other'}))).toBe(getRegistry(core))
    } finally {
      globals[key] = previous
    }
  })

  it('can probe for a bus without installing one', () => {
    const key = Symbol.for('sanity.os.bus')
    const globals = globalThis as Record<symbol, unknown>
    const previous = globals[key]
    try {
      delete globals[key]

      expect(createMessageBus({optional: true})).toBeUndefined()
      expect(() => createMessageBus()).toThrowError(
        expect.objectContaining({code: 'BUS_NOT_INSTALLED'}),
      )
      expect(globals[key]).toBeUndefined()
    } finally {
      globals[key] = previous
    }
  })

  // Every client resolves the one global bus, so one remote can answer another's
  // request with no direct dependency between them.
  it("lets one participant answer another's request through the shared bus", async () => {
    installMessageBus({appId: 'workbench'})
    const remoteA = createMessageBus({appId: 'remote-a'})
    const remoteB = createMessageBus({appId: 'remote-b'})

    // A registers a responder; B — a different importer — awaits a request and
    // gets A's reply, proving they share one instance.
    const controller = new AbortController()
    remoteA.subscribe('test.echo', (msg) => msg.reply({n: msg.payload.n + 1}), {
      signal: controller.signal,
    })
    try {
      await expect(remoteB.emit('test.echo', {n: 41})).resolves.toEqual({
        n: 42,
      })
    } finally {
      controller.abort()
    }
  })
})

describe('version compatibility', () => {
  const step: TopicMigration = {from: 1, to: 2, up: (v) => v, down: (v) => v}
  // A real reshape, so adaptation is observable in both directions.
  const rename: TopicMigration = {
    from: 1,
    to: 2,
    up: (v) => ({fullName: (v as {name: string}).name}),
    down: (v) => ({name: (v as {fullName: string}).fullName}),
  }

  it("passes a same-version client's values through untouched", () => {
    const migrations = new Map([['test.count', [step]]])
    const core = createBus('x', {migrations})
    defineStateTopics(core, {'test.count': 0})
    const client = connect(core, {appId: 'x', migrations})

    const seen: number[] = []
    core.subscribe('test.count', (value) => seen.push(value))
    client.emit('test.count', 7)

    expect(seen).toEqual([0, 7])
  })

  // A UI binding may call `subscribe` on every render — the client must hand
  // back the same stream per topic (as the core does), or `useSyncExternalStore`
  // sees a new `getCurrent` each render and spins.
  it('returns the same stream for repeated no-handler subscribes', () => {
    const core = createBus('x')
    defineStateTopics(core, {'test.count': 0})
    const client = connect(core, {appId: 'x', migrations: new Map()})

    expect(client.subscribe('test.count')).toBe(client.subscribe('test.count'))
    expect(client.subscribe('test.ping')).toBe(client.subscribe('test.ping'))
  })

  // Deploy skew or a core rollback: the client's bundle carries chain steps the
  // installed core lacks. The wire stays at the installed version — the client
  // recasts with its own steps instead of being rejected.
  it('adapts a client ahead of the install with its own bundled chain', async () => {
    const core = createBus('x') // the older install: knows no chain
    defineStateTopics(core, {'test.profile': undefined})
    const ahead = connect(core, {
      appId: 'x',
      migrations: new Map([['test.profile', [rename]]]),
    })

    ahead.emit('test.profile', {fullName: 'Ada'} as never)

    expect((await core.query('test.profile')) as unknown).toEqual({
      name: 'Ada', // downcast to the wire shape on the way in
    })
    await expect(ahead.query('test.profile')).resolves.toEqual({
      fullName: 'Ada', // upcast back to the client's shape on the way out
    })
  })

  it('adapts a consumer many versions behind on a topic', () => {
    const chain: readonly TopicMigration[] = [
      step,
      {from: 2, to: 3, up: (v) => v, down: (v) => v},
      {from: 3, to: 4, up: (v) => v, down: (v) => v},
    ]
    const core = createBus('x', {
      migrations: new Map([['test.count', chain]]),
    })
    expect(() => connect(core, {appId: 'x', migrations: new Map()})).not.toThrow() // consumer @1, core @4
  })
})

describe('core protocol', () => {
  it('yields an inert client on a protocol mismatch instead of throwing at connect', () => {
    // A core whose protocol this copy doesn't speak: every call must fail with
    // the typed mismatch.
    const foreign = {emit() {}, query() {}, subscribe() {}} as unknown as Bus

    const client = connect(foreign, {appId: 'stale'})

    for (const call of [
      () => client.emit('test.ping', {n: 1}),
      () => client.query('test.count'),
      () => client.subscribe('test.count'),
    ]) {
      let error: unknown
      try {
        call()
      } catch (caught) {
        error = caught
      }
      expect(error).toMatchObject({code: 'PROTOCOL_MISMATCH'})
    }
  })

  it("yields an inert client when the copy's manifest conflicts with the core", () => {
    const core = createBus()
    // No public API declares a conflicting kind — simulate a core installed by
    // a copy that knows a manifest topic as an event and lacks another.
    const registry = getRegistry(core)
    registry.topics.set('panels.mode', {
      kind: 'event',
      ownership: {type: 'any_app'},
    })
    registry.topics.delete('auth.token')
    registry.stateSubjects.delete('auth.token')

    const client = connect(core, {appId: 'skewed'})

    let error: unknown
    try {
      client.subscribe('panels.mode')
    } catch (caught) {
      error = caught
    }
    expect(error).toMatchObject({code: 'PROTOCOL_MISMATCH'})
    // A rejected manifest leaves the shared core untouched — including the
    // topics it would have added before hitting the conflict.
    expect(registry.topics.get('panels.mode')).toEqual({
      kind: 'event',
      ownership: {type: 'any_app'},
    })
    expect(registry.topics.has('auth.token')).toBe(false)
  })

  it('rejects conflicting ownership without replacing the first owner', () => {
    const core = createBus()
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const registry = getRegistry(core)
    registry.topics.set('auth.token', {
      kind: 'state',
      ownership: {type: 'any_app'},
      seed: undefined,
    })

    try {
      const client = connect(core, {appId: 'skewed'})

      expect(() => client.subscribe('auth.token')).toThrowError(
        expect.objectContaining({code: 'OWNERSHIP_MISMATCH'}),
      )
      expect(registry.topics.get('auth.token')?.ownership).toEqual({
        type: 'any_app',
      })
    } finally {
      logError.mockRestore()
    }
  })
})

describe('app identity', () => {
  it('requires an app ID', () => {
    expect(() => connect(createBus(), {} as never)).toThrowError(
      expect.objectContaining({code: 'MISSING_APP_ID'}),
    )
  })

  it('uses an explicit app ID as the owner', () => {
    const core = createBus('workbench-deployment')
    const owner = connect(core, {appId: 'workbench-deployment'})

    owner.emit('auth.token', 'trusted')
    expect(core.subscribe('auth.token').getCurrent()).toBe('trusted')
  })

  it('lets applications publish shared state topics', () => {
    const core = createBus()
    const app = connect(core, {appId: 'favorites'})
    const panel = {
      ok: true as const,
      value: {appId: 'favorites', name: 'list', mode: 'full' as const},
    }

    app.emit('panels.mode', panel)
    app.emit('preferences.color-scheme', 'dark')
    app.emit('preferences.dock-locked', true)

    expect(core.subscribe('panels.mode').getCurrent()).toEqual(panel)
    expect(core.subscribe('preferences.color-scheme').getCurrent()).toBe('dark')
    expect(core.subscribe('preferences.dock-locked').getCurrent()).toBe(true)
  })

  it('rejects state updates from an app that does not own the topic', () => {
    const core = createBus()
    const app = connect(core, {appId: 'favorites'})

    core.emit('auth.token', 'trusted')

    expect(() => app.emit('auth.token', 'spoofed')).toThrowError(
      expect.objectContaining({code: 'OWNERSHIP_MISMATCH'}),
    )
    expect(core.subscribe('auth.token').getCurrent()).toBe('trusted')
  })

  it('only lets the event owner respond', async () => {
    const core = createBus()
    const app = connect(core, {appId: 'favorites'})

    expect(() =>
      app.subscribe('auth.token.refresh', (message) => message.reply('spoofed')),
    ).toThrowError(expect.objectContaining({code: 'OWNERSHIP_MISMATCH'}))
    core.subscribe('auth.token.refresh', (message) => message.reply('trusted'))

    await expect(app.emit('auth.token.refresh')).resolves.toBe('trusted')
  })

  it("stamps the connecting app's id on emitted messages", async () => {
    const core = createBus('host')
    const client = connect(core, {appId: 'favorites'})
    const stop = new AbortController()
    const seen: string[] = []
    core.subscribe(
      'test.echo',
      (msg) => {
        seen.push(msg.meta.appId)
        msg.reply({n: 1})
      },
      {signal: stop.signal},
    )

    try {
      await client.emit('test.echo', {n: 0})
      expect(seen).toEqual(['favorites'])
    } finally {
      stop.abort()
    }
  })
})

describe('disconnectApp', () => {
  it('tears down every subscription the app holds in one abort', () => {
    const core = createBus()
    defineStateTopics(core, {'test.count': 0})
    const client = connect(core, {appId: 'gone'})

    const plain: number[] = []
    const withSignal: number[] = []
    const own = new AbortController()
    client.subscribe('test.count', (value) => plain.push(value))
    client.subscribe('test.count', (value) => withSignal.push(value), {
      signal: own.signal, // composes with the app lifetime; either abort tears down
    })

    disconnectApp(core, 'gone')
    core.emit('test.count', 1)

    expect(plain).toEqual([0])
    expect(withSignal).toEqual([0])
  })

  it("aborts an app's in-flight await", async () => {
    const core = createBus()
    const client = connect(core, {appId: 'leaver'})
    const stop = new AbortController()
    core.subscribe('test.echo', () => {}, {signal: stop.signal})

    try {
      const pending = client.emit('test.echo', {n: 0}, {timeout: null})
      pending.then(undefined, () => {}) // arm before the abort
      disconnectApp(core, 'leaver')
      await expect(pending).rejects.toMatchObject({code: 'ABORTED'})
    } finally {
      stop.abort()
    }
  })

  it('gives the next connect for the same app a fresh lifetime', () => {
    const core = createBus()
    defineStateTopics(core, {'test.count': 0})
    disconnectApp(core, 'hmr') // unknown app: a no-op

    const first = connect(core, {appId: 'hmr'})
    const seenFirst: number[] = []
    first.subscribe('test.count', (value) => seenFirst.push(value))
    disconnectApp(core, 'hmr')

    const second = connect(core, {appId: 'hmr'})
    const seenSecond: number[] = []
    second.subscribe('test.count', (value) => seenSecond.push(value))
    core.emit('test.count', 2)

    expect(seenFirst).toEqual([0]) // the old generation stayed down
    expect(seenSecond).toEqual([0, 2])
  })
})

describe('reset', () => {
  it('removes state, topics, subscriptions, responders, and pending requests', async () => {
    const core = createBus('workbench')
    const app = connect(core, {appId: 'app'})
    defineStateTopics(core, {'test.count': 0})

    const stateValues: number[] = []
    const events: number[] = []
    app.subscribe('test.count', (value) => stateValues.push(value))
    core.subscribe('test.ping', (message) => events.push(message.payload.n))
    core.subscribe('test.echo', () => {})
    const pending = app.emit('test.echo', {n: 1}, {timeout: null})
    pending.catch(() => {})
    const previousSource = app.subscribe('panels.mode')

    app.emit('test.count', 1)
    core.reset()
    core.emit('test.count', 2)
    core.emit('test.ping', {n: 1})

    await expect(pending).rejects.toMatchObject({code: 'ABORTED'})
    expect(stateValues).toEqual([0, 1])
    expect(events).toEqual([])
    expect(getRegistry(core).topics.has('test.count')).toBe(false)
    expect(app.subscribe('panels.mode')).not.toBe(previousSource)
    expect(app.subscribe('panels.mode').getCurrent()).toEqual({
      ok: true,
      value: null,
    })
  })

  it('keeps existing clients usable in the next generation', () => {
    const core = createBus('workbench')
    const app = connect(core, {appId: 'app'})

    core.reset()

    const seen: unknown[] = []
    app.subscribe('panels.mode', (value) => seen.push(value))
    const panel = {
      ok: true as const,
      value: {appId: 'app', name: 'test', mode: 'full' as const},
    }
    app.emit('panels.mode', panel)
    expect(seen).toEqual([{ok: true, value: null}, panel])
  })
})

describe('subscribe teardown', () => {
  it('unsubscribes when the AbortSignal fires', () => {
    const bus = createBus()
    defineStateTopics(bus, {'test.count': 0})
    const ac = new AbortController()
    const seen: number[] = []
    bus.subscribe('test.count', (value) => seen.push(value), {
      signal: ac.signal,
    })

    bus.emit('test.count', 1)
    ac.abort()
    bus.emit('test.count', 2)

    expect(seen).toEqual([0, 1])
  })

  it('tears down a subscription whose signal is already aborted', () => {
    const bus = createBus()
    defineStateTopics(bus, {'test.count': 0})
    const ac = new AbortController()
    ac.abort()
    const seen: number[] = []
    bus.subscribe('test.count', (value) => seen.push(value), {
      signal: ac.signal,
    })

    bus.emit('test.count', 1)

    expect(seen).toEqual([0]) // the sync replay slips through; later emits don't
  })
})

describe('state source', () => {
  it('reads the current value synchronously', () => {
    const bus = createBus()
    defineStateTopics(bus, {'test.scheme': 'light'})
    const source = bus.subscribe('test.scheme')

    expect(source.getCurrent()).toBe('light')
    bus.emit('test.scheme', 'dark')
    expect(source.getCurrent()).toBe('dark')
  })

  it('resolves firstValue with the current value', async () => {
    const bus = createBus()
    defineStateTopics(bus, {'test.scheme': 'light'})

    await expect(bus.subscribe('test.scheme').firstValue).resolves.toBe('light')
  })

  it('loses the synchronous read once piped', () => {
    const bus = createBus()
    defineStateTopics(bus, {'test.scheme': 'light'})

    const piped = bus.subscribe('test.scheme').pipe(map((value) => value))

    expect('getCurrent' in piped).toBe(false)
  })
})

describe('query', () => {
  it("resolves immediately with a seeded topic's current value", async () => {
    const bus = createBus()
    defineStateTopics(bus, {'test.token': null})

    await expect(bus.query('test.token')).resolves.toBeNull()

    bus.emit('test.token', 'tok')
    await expect(bus.query('test.token')).resolves.toBe('tok')
  })

  it('reads published kernel state via query and a late subscribe', async () => {
    const bus = createBus()
    defineStateTopics(bus, {'test.scheme': 'light'})

    // Mirror the kernel adapter path: an observable source mapped to a slice,
    // no-op repeats dropped, pushed onto the topic.
    const actor$ = new BehaviorSubject<{scheme: 'light' | 'dark'}>({
      scheme: 'light',
    })
    actor$
      .pipe(
        map((snapshot) => snapshot.scheme),
        distinctUntilChanged(),
      )
      .subscribe((scheme) => bus.emit('test.scheme', scheme))

    actor$.next({scheme: 'dark'})
    actor$.next({scheme: 'dark'}) // dropped by distinctUntilChanged

    await expect(bus.query('test.scheme')).resolves.toBe('dark')

    const seen: string[] = []
    bus.subscribe('test.scheme', (scheme) => seen.push(scheme))
    expect(seen).toEqual(['dark']) // latest-value replay to a late subscriber
  })
})

// A suspending state topic has no initial value: reads see `undefined`/wait
// until the owner publishes the first value. The sentinel that stands in for
// "no value yet" is never exposed — it's what lets `use(source.firstValue)`
// suspend a React boundary.
describe('suspending state topics', () => {
  afterEach(() => vi.useRealTimers())

  it('getCurrent is undefined until the first value, then the value', () => {
    const bus = createBus()
    defineStateTopics(bus, {'test.suspending': undefined})
    const source = bus.subscribe('test.suspending')

    expect(source.getCurrent()).toBeUndefined()
    bus.emit('test.suspending', 'ready')
    expect(source.getCurrent()).toBe('ready')
  })

  it('firstValue resolves with the first published value', async () => {
    const bus = createBus()
    defineStateTopics(bus, {'test.suspending': undefined})
    const source = bus.subscribe('test.suspending')

    queueMicrotask(() => bus.emit('test.suspending', 'ready'))
    await expect(source.firstValue).resolves.toBe('ready')
  })

  it('a handler never observes the no-value sentinel', () => {
    const bus = createBus()
    defineStateTopics(bus, {'test.suspending': undefined})
    const seen: string[] = []
    bus.subscribe('test.suspending', (value) => seen.push(value))

    expect(seen).toEqual([]) // nothing before the first real value
    bus.emit('test.suspending', 'ready')
    expect(seen).toEqual(['ready'])
  })

  it("query waits for a suspending topic's first value", async () => {
    const bus = createBus()
    defineStateTopics(bus, {'test.suspending': undefined})

    queueMicrotask(() => bus.emit('test.suspending', 'ready'))
    await expect(bus.query('test.suspending')).resolves.toBe('ready')
  })

  it('query rejects with TIMEOUT when no value ever arrives', async () => {
    vi.useFakeTimers()
    const bus = createBus()
    defineStateTopics(bus, {'test.suspending': undefined})

    const rejects = expect(bus.query('test.suspending')).rejects.toMatchObject({
      code: 'TIMEOUT',
    })
    await vi.advanceTimersByTimeAsync(5000)
    await rejects
  })

  it("query rejects with ABORTED when the caller's signal fires", async () => {
    const bus = createBus()
    defineStateTopics(bus, {'test.suspending': undefined})
    const controller = new AbortController()

    const rejects = expect(
      bus.query('test.suspending', {signal: controller.signal}),
    ).rejects.toMatchObject({code: 'ABORTED'})
    controller.abort()
    await rejects
  })
})

describe('emit — request-reply', () => {
  it("resolves with the responder's reply", async () => {
    const bus = createBus()
    bus.subscribe('test.echo', (msg) => msg.reply({n: msg.payload.n + 1}))

    await expect(bus.emit('test.echo', {n: 1})).resolves.toEqual({n: 2})
  })

  it('catches a reply made in the same tick as the emit', async () => {
    const bus = createBus()
    bus.subscribe('test.echo', (msg) => msg.reply({n: 9}))

    // The responder replies synchronously during delivery, before the await.
    const result = bus.emit('test.echo', {n: 0})
    await expect(result).resolves.toEqual({n: 9})
  })

  it('rejects NO_RESPONDER when nothing is listening', async () => {
    const bus = createBus()

    await expect(bus.emit('test.echo', {n: 1})).rejects.toMatchObject({
      code: 'NO_RESPONDER',
    })
  })

  it('rejects TIMEOUT when the responder never replies', async () => {
    const bus = createBus()
    bus.subscribe('test.echo', () => {})

    await expect(bus.emit('test.echo', {n: 1}, {timeout: 10})).rejects.toMatchObject({
      code: 'TIMEOUT',
    })
  })

  it("rejects ABORTED when the caller's signal fires", async () => {
    const bus = createBus()
    bus.subscribe('test.echo', () => {})
    const ac = new AbortController()

    const result = bus.emit('test.echo', {n: 1}, {signal: ac.signal, timeout: null})
    ac.abort()

    await expect(result).rejects.toMatchObject({code: 'ABORTED'})
  })

  it('rejects HANDLER_THREW carrying the original error as cause', async () => {
    const bus = createBus()
    const boom = new Error('boom')
    bus.subscribe('test.echo', () => {
      throw boom
    })

    await expect(bus.emit('test.echo', {n: 1})).rejects.toMatchObject({
      code: 'HANDLER_THREW',
      cause: boom,
    })
  })

  it('carries a domain failure in the reply value, not a rejection', async () => {
    const bus = createBus()
    // A domain "no" is expressed in the reply, not thrown.
    bus.subscribe('test.echo', (msg) => msg.reply({n: -1}))

    await expect(bus.emit('test.echo', {n: 1})).resolves.toEqual({n: -1})
  })

  it('first reply wins; a second reply is a no-op', async () => {
    const bus = createBus()
    bus.subscribe('test.echo', (msg) => {
      msg.reply({n: 1})
      msg.reply({n: 2})
    })

    await expect(bus.emit('test.echo', {n: 0})).resolves.toEqual({n: 1})
  })

  it('aborts an in-flight request when the signal fires after the await', async () => {
    const bus = createBus()
    bus.subscribe('test.echo', () => {})
    const ac = new AbortController()

    const result = bus.emit('test.echo', {n: 1}, {signal: ac.signal})
    // Arm synchronously (registers the abort listener) before firing the signal.
    result.then(undefined, () => {})
    ac.abort()

    await expect(result).rejects.toMatchObject({code: 'ABORTED'})
  })

  it('surfaces an async responder rejection as HANDLER_THREW', async () => {
    const bus = createBus()
    const boom = new Error('async boom')
    bus.subscribe('test.echo', () => Promise.reject(boom))

    await expect(bus.emit('test.echo', {n: 1})).rejects.toMatchObject({
      code: 'HANDLER_THREW',
      cause: boom,
    })
  })

  it("aborts the responder's signal once the caller stops waiting", async () => {
    const bus = createBus()
    let aborted = false
    bus.subscribe('test.echo', (msg) => {
      msg.signal.addEventListener('abort', () => {
        aborted = true
      })
      msg.reply({n: 1})
    })

    await bus.emit('test.echo', {n: 0})
    expect(aborted).toBe(true)
  })
})

describe('emit — fire-and-forget events', () => {
  it('delivers to every subscriber and never blocks the producer', () => {
    const bus = createBus()
    const seen: number[] = []
    bus.subscribe('test.ping', (msg) => seen.push(msg.payload.n))
    bus.subscribe('test.ping', (msg) => seen.push(msg.payload.n * 10))

    bus.emit('test.ping', {n: 1})

    expect(seen).toEqual([1, 10])
  })

  it('keeps no memory — a late subscriber misses prior emits', () => {
    const bus = createBus()
    bus.emit('test.ping', {n: 1})

    const seen: number[] = []
    bus.subscribe('test.ping', (msg) => seen.push(msg.payload.n))

    expect(seen).toEqual([])
  })

  it('exposes an event topic as an observable of payloads (no handler)', () => {
    const bus = createBus()
    const seen: number[] = []
    const sub = bus.subscribe('test.ping').subscribe((p) => seen.push(p.n))

    bus.emit('test.ping', {n: 1})
    sub.unsubscribe()

    expect(seen).toEqual([1])
  })

  it('a rejected emit can be handled with .catch', async () => {
    const bus = createBus()

    const code = await bus
      .emit('test.echo', {n: 1})
      .catch((error) => (error as {code: string}).code)

    expect(code).toBe('NO_RESPONDER')
  })

  it('runs .finally on a settled emit', async () => {
    const bus = createBus()
    bus.subscribe('test.echo', (msg) => msg.reply({n: 1}))
    let finalized = false

    await bus.emit('test.echo', {n: 0}).finally(() => {
      finalized = true
    })

    expect(finalized).toBe(true)
  })
})

describe('state topic edge cases', () => {
  it('re-seeds an already-defined topic with a new value', () => {
    const bus = createBus()
    defineStateTopics(bus, {'test.count': 1})
    defineStateTopics(bus, {'test.count': 2})
    expect(bus.subscribe('test.count').getCurrent()).toBe(2)
  })

  // Producers republish freely (e.g. on every machine state entry); the bus
  // owns duplicate suppression so no producer has to.
  it('drops a reference-equal state republish', () => {
    const bus = createBus()
    defineStateTopics(bus, {'test.token': null})
    const seen: (string | null)[] = []
    bus.subscribe('test.token', (value) => seen.push(value))

    bus.emit('test.token', 'tok')
    bus.emit('test.token', 'tok')
    defineStateTopics(bus, {'test.token': 'tok'}) // re-seed with same value

    expect(seen).toEqual([null, 'tok'])
  })

  it('query on an undeclared topic with an already-aborted signal rejects ABORTED', async () => {
    const bus = createBus()
    const ac = new AbortController()
    ac.abort()

    // The topic was never declared, so the read holds the sentinel and waits;
    // the already-aborted signal rejects it at once.
    await expect(bus.query('test.suspending', {signal: ac.signal})).rejects.toMatchObject({
      code: 'ABORTED',
    })
  })
})

// test.profile changed shape twice — the bus composes both steps into a 1↔3 chain:
type V1 = {name: string}
type V2 = {name: string; tags: readonly string[]}
type V3 = {fullName: string; tags: readonly string[]}

const profile: readonly TopicMigration[] = [
  {
    from: 1,
    to: 2,
    up: (v) => ({name: (v as V1).name, tags: []}),
    down: (v) => ({name: (v as V2).name}),
  },
  {
    from: 2,
    to: 3,
    up: (v) => ({fullName: (v as V2).name, tags: (v as V2).tags}),
    down: (v) => ({name: (v as V3).fullName, tags: (v as V3).tags}),
  },
]

// test.greet changed once (v1 {name} → v2 {fullName}); its 2→3 step is absent, so
// the bus treats that version as identity when adapting against a v3 core.
const greet: readonly TopicMigration[] = [
  {
    from: 1,
    to: 2,
    up: (v) => ({fullName: (v as {name: string}).name}),
    down: (v) => ({name: (v as {fullName: string}).fullName}),
  },
]

const migrations = new Map([
  ['test.profile', profile],
  ['test.greet', greet],
])

// The installed bus, holding each topic at its latest version (profile@3, greet@2).
const latestCore = () => createBus('host', {migrations})

// A client's bundled chains pin its per-topic versions; a topic it has no chain
// for is at v1. The wire always speaks the installed core's versions.
describe('cross-version adaptation', () => {
  it('round-trips a state value across the full chain (v1 ↔ v3)', async () => {
    const core = latestCore()
    defineStateTopics(core, {'test.profile': undefined})
    const v1 = connect(core, {appId: 'host', migrations: new Map()})

    v1.emit('test.profile', {name: 'Ada'} as never)

    expect(await core.query('test.profile')).toEqual({
      fullName: 'Ada',
      tags: [],
    })
    expect((await v1.query('test.profile')) as unknown).toEqual({
      name: 'Ada',
    })
  })

  it('round-trips a state value mid-chain (v2)', async () => {
    const core = latestCore()
    defineStateTopics(core, {'test.profile': undefined})
    const v2 = connect(core, {
      appId: 'host',
      migrations: new Map([['test.profile', profile.slice(0, 1)]]),
    })

    v2.emit('test.profile', {name: 'Bo', tags: ['x']} as never)

    expect((await v2.query('test.profile')) as unknown).toEqual({
      name: 'Bo',
      tags: ['x'],
    })
  })

  it('downcasts state values delivered to an older subscriber', () => {
    const core = latestCore()
    defineStateTopics(core, {
      'test.profile': {fullName: 'Cy', tags: ['y']},
    })
    const v1 = connect(core, {appId: 'host', migrations: new Map()})

    const seen: unknown[] = []
    v1.subscribe('test.profile', (value) => seen.push(value))

    expect(seen).toEqual([{name: 'Cy'}])
  })

  it("downcasts a StateSource's getCurrent and firstValue", async () => {
    const core = latestCore()
    defineStateTopics(core, {'test.profile': {fullName: 'Di', tags: []}})
    const source = connect(core, {
      appId: 'host',
      migrations: new Map(),
    }).subscribe('test.profile')

    expect(source.getCurrent() as unknown).toEqual({name: 'Di'})
    expect((await source.firstValue) as unknown).toEqual({name: 'Di'})
  })

  it('adapts event payloads both ways', () => {
    const core = latestCore()
    const v1 = connect(core, {appId: 'host', migrations: new Map()})

    // emit upcasts: the latest core handler sees the new shape.
    const onCore: unknown[] = []
    const stop = new AbortController()
    core.subscribe('test.greet', (msg) => onCore.push(msg.payload), {
      signal: stop.signal,
    })
    v1.emit('test.greet', {name: 'Eve'} as never)
    expect(onCore).toEqual([{fullName: 'Eve'}])

    // subscribe downcasts: the older stream sees its own shape.
    const onV1: unknown[] = []
    ;(v1.subscribe('test.greet') as Observable<unknown>).subscribe((p) => onV1.push(p))
    core.emit('test.greet', {fullName: 'Fox'})
    expect(onV1).toEqual([{name: 'Fox'}])

    stop.abort()
  })

  // A bound source projects with `down` on every read; getCurrent must still hand
  // back a stable reference, or a useSyncExternalStore binding spins forever.
  it("returns a stable reference from a bound source's getCurrent", () => {
    const core = latestCore()
    defineStateTopics(core, {'test.profile': {fullName: 'Ada', tags: []}})
    const source = connect(core, {
      appId: 'host',
      migrations: new Map(),
    }).subscribe('test.profile')

    expect(source.getCurrent()).toBe(source.getCurrent())
  })
})

// A two-step chain that tags the value at each hop, so a round trip is visible.
const taggedChain: readonly TopicMigration[] = [
  {
    from: 1,
    to: 2,
    up: (v) => `${v as string}>2`,
    down: (v) => (v as string).replace('>2', ''),
  },
  {
    from: 2,
    to: 3,
    up: (v) => `${v as string}>3`,
    down: (v) => (v as string).replace('>3', ''),
  },
]

describe('topicVersions', () => {
  it("is a topic's highest `to`, or 1 for an empty chain, absent otherwise", () => {
    expect(topicVersions(new Map([['a', taggedChain]]))).toEqual(new Map([['a', 3]]))
    expect(topicVersions(new Map([['a', []]]))).toEqual(new Map([['a', 1]]))
    expect(topicVersions(new Map())).toEqual(new Map())
  })
})

describe('topicAdapters', () => {
  it('walks the core chain for a topic the client is behind on', () => {
    const {toCore, toClient} = topicAdapters(new Map([['a', taggedChain]]), new Map())
    expect(toCore('a', 'x')).toBe('x>2>3')
    expect(toClient('a', 'x>2>3')).toBe('x')
  })

  it("walks the client's own chain for a topic it is ahead on", () => {
    const {toCore, toClient} = topicAdapters(new Map(), new Map([['a', taggedChain]]))
    expect(toCore('a', 'x>2>3')).toBe('x') // down to the wire version
    expect(toClient('a', 'x')).toBe('x>2>3')
  })

  it('passes a topic neither side has a chain for through unchanged', () => {
    const {toCore, toClient} = topicAdapters(new Map(), new Map())
    expect(toCore('a', 'x')).toBe('x')
    expect(toClient('a', 'x')).toBe('x')
  })
})

describe('applyChain', () => {
  it('returns the value unchanged with no chain or no gap', () => {
    expect(applyChain(undefined, 'x', 1, 3)).toBe('x')
    expect(applyChain([], 'x', 1, 3)).toBe('x')
    expect(applyChain(taggedChain, 'x', 2, 2)).toBe('x')
  })

  it('walks up the chain in ascending order', () => {
    expect(applyChain(taggedChain, 'x', 1, 3)).toBe('x>2>3')
  })

  it('walks down the chain in descending order', () => {
    expect(applyChain(taggedChain, 'x>2>3', 3, 1)).toBe('x')
  })

  it("skips a version the topic didn't change at", () => {
    const partial = [taggedChain[0]] // only the 1→2 step; 2→3 is absent
    expect(applyChain(partial, 'x', 1, 3)).toBe('x>2') // 2→3 missing → identity
    expect(applyChain(partial, 'x>2', 3, 1)).toBe('x') // 2→3 skipped, 1→2 applies
  })
})

// This pair fails when the per-test reset in vitest.setup.ts stops running.
describe('per-test bus isolation', () => {
  it('leaves a value on the shared singleton', async () => {
    defineStateTopics(sharedBus, {'test.token': 'leaked'})
    await expect(sharedBus.query('test.token')).resolves.toBe('leaked')
  })

  it('starts the next test with a pristine bus', () => {
    const seen: unknown[] = []
    const stop = new AbortController()
    sharedBus.subscribe('test.token', (value) => seen.push(value), {
      signal: stop.signal,
    })
    // A leaked state topic would replay "leaked"; an undeclared one routes
    // as an event and replays nothing.
    expect(seen).toEqual([])
    stop.abort()
  })
})
