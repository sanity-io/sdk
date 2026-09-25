import {type Node} from '@sanity/comlink'
import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {BehaviorSubject, lastValueFrom} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getNodeState, type NodeState} from '../comlink/node/getNodeState'
import {type FrameMessage, type WindowMessage} from '../comlink/types'
import {installMessageBus, type MessageBusHost, resetMessageBus} from '../dashboard/messageBus/bus'
import {type ApplicationActivity, type CapabilityRecord} from '../dashboard/messageBus/topics'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {
  recordDocumentHistoryEvent,
  type RecordDocumentHistoryEventInput,
} from './recordDocumentHistoryEvent'

vi.mock('../comlink/node/getNodeState', () => ({
  getNodeState: vi.fn(),
}))

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

let instance: SanityInstance

beforeEach(() => {
  instance = createSanityInstance({projectId: 'p', dataset: 'd'})
})

afterEach(() => {
  instance.dispose()
  vi.clearAllMocks()
})

const input: RecordDocumentHistoryEventInput = {
  eventType: 'viewed',
  documentId: 'doc',
  documentType: 'movie',
  resourceId: 'p.d',
  resourceType: 'studio',
  schemaName: 'production',
}

const record = (overrides: Partial<RecordDocumentHistoryEventInput> = {}) =>
  lastValueFrom(recordDocumentHistoryEvent(instance, {...input, ...overrides}), {
    defaultValue: undefined,
  })

describe('recordDocumentHistoryEvent (Comlink)', () => {
  const post = vi.fn()
  let nodeState: BehaviorSubject<NodeState | undefined>

  const connect = () =>
    nodeState.next({
      node: {post} as unknown as Node<WindowMessage, FrameMessage>,
      status: 'connected',
    })

  beforeEach(() => {
    nodeState = new BehaviorSubject<NodeState | undefined>(undefined)
    vi.mocked(getNodeState).mockReturnValue({
      observable: nodeState,
    } as unknown as StateSource<NodeState | undefined>)
  })

  it('posts an event recorded before the node connects once it connects, and only once', async () => {
    const recorded = record()
    expect(post).not.toHaveBeenCalled()

    connect()
    await recorded
    connect()

    expect(getNodeState).toHaveBeenCalledWith(instance, {
      name: SDK_NODE_NAME,
      connectTo: SDK_CHANNEL_NAME,
    })
    expect(post).toHaveBeenCalledExactlyOnceWith('dashboard/v1/events/history', {
      eventType: 'viewed',
      document: {
        id: 'doc',
        type: 'movie',
        resource: {id: 'p.d', type: 'studio', schemaName: 'production'},
      },
    })
  })
})

describe('recordDocumentHistoryEvent (message bus)', () => {
  let host: MessageBusHost
  let activity: ApplicationActivity[]

  const provideCapabilities = (capabilities: CapabilityRecord) =>
    host.connections.subscribe((client) => client.emit('applications.capabilities', capabilities))

  beforeEach(() => {
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
    activity = []
    host.subscribe('applications.activity', (message) => activity.push(message.payload))
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
  })

  it.each([
    ['studio', 'dataset'],
    ['media-library', 'media-library'],
  ] as const)(
    'emits a %s event once the host provides history, addressed as a %s resource',
    async (resourceType, type) => {
      const recorded = record({resourceType})
      provideCapabilities({history: true})
      await recorded

      expect(getNodeState).not.toHaveBeenCalled()
      expect(activity).toEqual([
        {
          kind: 'document',
          eventType: 'viewed',
          document: {
            id: 'doc',
            type: 'movie',
            resource: {id: 'p.d', type, schemaName: 'production'},
          },
        },
      ])
    },
  )

  it.each([{history: false}, {}])(
    'drops the event when the host does not provide history (%o)',
    async (capabilities) => {
      provideCapabilities(capabilities)
      await record()

      expect(activity).toEqual([])
    },
  )

  it('drops the event and logs when the capabilities read fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    host.connections.subscribe((client) => client.reject('applications.capabilities'))

    await expect(record()).resolves.toBeUndefined()

    expect(activity).toEqual([])
    expect(consoleError).toHaveBeenCalledOnce()
    consoleError.mockRestore()
  })
})
