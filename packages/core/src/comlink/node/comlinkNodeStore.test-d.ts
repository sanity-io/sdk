import {type Message, type Node, type NodeInput} from '@sanity/comlink'
import {type FrameMessages, type WindowMessages} from '@sanity/message-protocol'
import {expectTypeOf, test} from 'vitest'

import {type SanityInstance} from '../../store/createSanityInstance'
import {getOrCreateNode} from './comlinkNodeStore'

const instance = {} as SanityInstance
const nodeInput: NodeInput = {name: 'test-node', connectTo: 'parent'}

test('getOrCreateNode — defaults to untyped messages', () => {
  expectTypeOf(getOrCreateNode(instance, nodeInput)).toEqualTypeOf<Node<Message, Message>>()
})

test('getOrCreateNode — returns a node typed by the message type arguments', () => {
  expectTypeOf(getOrCreateNode<FrameMessages, WindowMessages>(instance, nodeInput)).toEqualTypeOf<
    Node<FrameMessages, WindowMessages>
  >()
})
