import {type Message, type Node, type NodeInput} from '@sanity/comlink'
import {type FrameMessages, type WindowMessages} from '@sanity/message-protocol'
import {expectTypeOf, test} from 'vitest'

import {type SanityInstance} from '../../store/createSanityInstance'
import {type StateSource} from '../../store/createStateSourceAction'
import {getNodeState, type NodeState} from './getNodeState'

const instance = {} as SanityInstance
const nodeInput: NodeInput = {name: 'test-node', connectTo: 'parent'}

test('getNodeState — defaults to untyped messages', () => {
  expectTypeOf(getNodeState(instance, nodeInput)).toEqualTypeOf<
    StateSource<NodeState<Message, Message> | undefined>
  >()
  expectTypeOf<NodeState['node']>().toEqualTypeOf<Node<Message, Message>>()
})

test('getNodeState — types the node by the message type arguments', () => {
  const nodeState = getNodeState<FrameMessages, WindowMessages>(instance, nodeInput).getCurrent()
  expectTypeOf(nodeState).toEqualTypeOf<NodeState<FrameMessages, WindowMessages> | undefined>()

  const node = nodeState!.node
  expectTypeOf(
    node.fetch('dashboard/v1/events/favorite/query', {document: {id: 'doc', type: 'article'}}),
  ).toEqualTypeOf<Promise<{isFavorited: boolean}>>()
  // @ts-expect-error the protocol has no such message
  void node.fetch('dashboard/v1/unknown')
})
