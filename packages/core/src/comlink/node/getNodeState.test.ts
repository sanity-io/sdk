import {type Node} from '@sanity/comlink'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../../store/createSanityInstance'
import {type FrameMessage, type WindowMessage} from '../types'
import * as comlinkNodeStoreModule from './comlinkNodeStore'
import {getOrCreateNode} from './comlinkNodeStore'
import {getNodeState} from './getNodeState'

const mockNode: Node<WindowMessage, FrameMessage> = {
  start: vi.fn(),
  stop: vi.fn(),
  onStatus: vi.fn(),
} as unknown as Node<WindowMessage, FrameMessage>

vi.mock('@sanity/comlink', () => ({
  createNode: vi.fn(() => mockNode),
}))

const nodeConfig = {name: 'test-node', connectTo: 'parent'}

describe('getNodeState', () => {
  let instance: ReturnType<typeof createSanityInstance>

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'test', dataset: 'test'})
  })

  afterEach(() => {
    vi.clearAllMocks()
    instance.dispose()
  })

  it('returns undefined if node is not present', () => {
    const source = getNodeState(instance, nodeConfig)
    expect(source.getCurrent()).toBeUndefined()
  })

  it('returns node and status if node is present and connected', async () => {
    let statusCallback: ((status: 'idle' | 'handshaking' | 'connected') => void) | undefined

    mockNode.onStatus = (cb: (status: 'idle' | 'handshaking' | 'connected') => void) => {
      statusCallback = cb
      return () => {}
    }

    // Subscribe to the state source first
    const source = getNodeState(instance, nodeConfig)
    source.subscribe(() => {})

    // Actually create the node
    getOrCreateNode(instance, nodeConfig)

    // Simulate the node becoming connected
    statusCallback?.('connected')

    // Await a tick for the selector to pick up the change
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(source.getCurrent()).toEqual({node: mockNode, status: 'connected'})
  })

  it('onSubscribe calls getOrCreateNode', () => {
    const spy = vi.spyOn(comlinkNodeStoreModule, 'getOrCreateNode')
    const source = getNodeState(instance, nodeConfig)
    const unsubscribe = source.subscribe()
    expect(spy).toHaveBeenCalledWith(instance, nodeConfig)
    unsubscribe()
  })

  it('unsubscribe calls releaseNode', async () => {
    vi.useFakeTimers()
    const spy = vi.spyOn(comlinkNodeStoreModule, 'releaseNode')
    let statusCallback: ((status: 'idle' | 'handshaking' | 'connected') => void) | undefined
    mockNode.onStatus = (cb: (status: 'idle' | 'handshaking' | 'connected') => void) => {
      statusCallback = cb
      return () => {}
    }
    const source = getNodeState(instance, nodeConfig)
    const unsubscribe = source.subscribe(() => {})

    getOrCreateNode(instance, nodeConfig)
    statusCallback?.('connected')

    unsubscribe()
    vi.advanceTimersByTime(5000)
    expect(spy).toHaveBeenCalledWith(instance, 'test-node')
    vi.useRealTimers()
  })
})
