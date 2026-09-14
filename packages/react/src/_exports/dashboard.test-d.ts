import {expectTypeOf, test} from 'vitest'

import {
  type DashboardTopics,
  type EventTopic,
  type EventTopicDef,
  type MessageBus,
  type MessageBusAbortOptions,
  type MessageBusEmitOptions,
  type MessageBusEmitResult,
  type MessageBusError,
  type MessageBusErrorCode,
  type MessageBusMessage,
  type MessageBusMeta,
  type MessageBusQueryOptions,
  type PayloadOf,
  type ReplyOf,
  type StateTopicDef,
  type TopicName,
  type Topics,
} from './dashboard'
import {type installMessageBus, type resetMessageBus} from './dashboard-internal'

// Guards issue #1: every `@public` message bus type must be reachable from the
// `@sanity/sdk-react/dashboard` entrypoint. A missing export fails `ts:check`
// on the import above.
test('dashboard entrypoint exposes the message bus public types', () => {
  // EventTopic is exported, so PayloadOf/ReplyOf are usable over event topics.
  expectTypeOf<PayloadOf<'auth.token.refresh'>>().toEqualTypeOf<void>()
  expectTypeOf<ReplyOf<'auth.token.refresh'>>().toEqualTypeOf<string>()
  expectTypeOf<EventTopic>().toExtend<TopicName>()

  // A consumer can name the constraint to write a generic wrapper over event topics.
  const wrap = <K extends EventTopic>(type: K, payload: PayloadOf<K>): [K, PayloadOf<K>] => [
    type,
    payload,
  ]
  expectTypeOf(wrap).toBeFunction()

  // Topic declarations are reachable for declaration merging.
  expectTypeOf<TopicName>().toEqualTypeOf<keyof Topics>()
  expectTypeOf<keyof DashboardTopics>().toExtend<TopicName>()
  expectTypeOf<StateTopicDef<number>['value']>().toBeNumber()
  expectTypeOf<EventTopicDef<{n: number}, string>['payload']>().toEqualTypeOf<{n: number}>()

  // The error code can be named when switching on `MessageBusError.code`.
  expectTypeOf<MessageBusError['code']>().toEqualTypeOf<MessageBusErrorCode>()

  // Event handlers and operation options can be typed explicitly.
  expectTypeOf<MessageBusMessage<{n: number}, string>['payload']>().toEqualTypeOf<{n: number}>()
  expectTypeOf<MessageBusMeta['appId']>().toBeString()
  expectTypeOf<MessageBusAbortOptions['signal']>().toEqualTypeOf<AbortSignal | undefined>()
  expectTypeOf<MessageBusEmitOptions['timeout']>().toEqualTypeOf<number | null | undefined>()
  expectTypeOf<MessageBusQueryOptions['timeout']>().toEqualTypeOf<number | null | undefined>()
  expectTypeOf<MessageBusEmitResult<string>>().toExtend<PromiseLike<string>>()
  expectTypeOf<MessageBus['query']>().toBeFunction()
})

// Guards issue #3: the test-isolation helpers stay on the internal entrypoint,
// not the public one.
test('internal entrypoint exposes install and reset', () => {
  expectTypeOf<typeof installMessageBus>().toBeFunction()
  expectTypeOf<typeof resetMessageBus>().toBeFunction()
})
