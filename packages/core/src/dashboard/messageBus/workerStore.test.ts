import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../../store/createSanityInstance'
import {installMessageBus, resetMessageBus} from './bus'
import {getWorkerClient} from './workerStore'

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')
const config = {projectId: 'p', dataset: 'd'}

describe('getWorkerClient', () => {
  beforeEach(() => {
    // The SDK resolves its own app ID from the CLI-embedded global.
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    installMessageBus({appId: 'dashboard'})
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
  })

  it('returns the same client for a worker name on the same instance', () => {
    const instance = createSanityInstance(config)

    expect(getWorkerClient(instance, 'feed')).toBe(getWorkerClient(instance, 'feed'))
    expect(getWorkerClient(instance, 'feed')).not.toBe(getWorkerClient(instance, 'sync'))
  })

  it('gives each instance its own client', () => {
    const a = createSanityInstance(config)
    const b = createSanityInstance(config)

    expect(getWorkerClient(a, 'feed')).not.toBe(getWorkerClient(b, 'feed'))
  })

  it('throws without an installed dashboard message bus', () => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]

    expect(() => getWorkerClient(createSanityInstance(config), 'feed')).toThrow(
      'Cannot use worker "feed" without an installed dashboard message bus',
    )
  })
})
